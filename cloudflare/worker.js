// Cloudflare で動かすための入り口（Worker）。
// サーバー本体（server.js）は Cloudflare Containers の中でそのまま動かし、ここは届いたリクエストをそこへ渡すだけ。
// コンテナの中のファイルは作り直すと消えるので、data/ の中身は Vault（Durable Object）に置いておき、
// 起動するときに戻す。コンテナからは http://192.0.2.1/... で読み書きする。
// 192.0.2.1 は説明用に予約されていてどこにもつながらない番地で、ここで横取りして Vault に渡す（外には出ない）。

import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';

export { ContainerProxy };

const VAULT_HOST = '192.0.2.1';
const CHUNK = 1024 * 1024; // 1行に入れる大きさ（SQLite の1行は 2MB まで）

export class Server extends Container {
  defaultPort = 8080;
  // 配信中は TikTok とつながり続けるので、止めない（5分ごとの見回りでも起きたままになる）
  sleepAfter = '24h';
  enableInternet = true;

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      TW_HOSTED: '1',
      HOST: '0.0.0.0',
      PORT: '8080',
      TW_VAULT: `http://${VAULT_HOST}`,
      TW_ADMIN_TOKEN: env.TW_ADMIN_TOKEN ?? '',
      TIKTOK_SIGN_API_KEY: env.TIKTOK_SIGN_API_KEY ?? '',
    };
  }

  onError(error) {
    console.error('コンテナのエラー:', error);
    throw error;
  }
}

// コンテナからの http://192.0.2.1/... は Vault に渡す。
// （クラスの中に static で書くと、親の Container が見ている登録に入らないので、外で代入する）
Server.outboundByHost = {
  [VAULT_HOST]: (req, env) => env.VAULT.getByName('main').fetch(req),
};

/**
 * data/ のファイルを置いておく場所。
 * GET /list → [{ path, size, mtime }]、GET /f/<path> → 中身、PUT /f/<path>?mtime= → 置く、DELETE /f/<path> → 消す
 */
export class Vault extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, size INTEGER, mtime INTEGER, chunks INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS chunks (path TEXT, idx INTEGER, data BLOB, PRIMARY KEY (path, idx))');
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/list') {
      return Response.json(this.sql.exec('SELECT path, size, mtime FROM files ORDER BY path').toArray());
    }
    if (!url.pathname.startsWith('/f/')) return new Response('not found', { status: 404 });
    const path = decodeURIComponent(url.pathname.slice(3));
    if (!path || path.split('/').some((p) => p === '..' || p === '')) return new Response('bad path', { status: 400 });

    if (request.method === 'GET') {
      const meta = this.sql.exec('SELECT size FROM files WHERE path = ?', path).toArray()[0];
      if (!meta) return new Response('not found', { status: 404 });
      const out = new Uint8Array(meta.size);
      let at = 0;
      for (const row of this.sql.exec('SELECT data FROM chunks WHERE path = ? ORDER BY idx', path)) {
        const part = new Uint8Array(row.data);
        out.set(part, at);
        at += part.byteLength;
      }
      return new Response(out);
    }
    if (request.method === 'PUT') {
      const body = new Uint8Array(await request.arrayBuffer());
      const mtime = Number(url.searchParams.get('mtime')) || Date.now();
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM chunks WHERE path = ?', path);
        let idx = 0;
        for (let at = 0; at < body.byteLength || idx === 0; at += CHUNK, idx++) {
          this.sql.exec('INSERT INTO chunks (path, idx, data) VALUES (?, ?, ?)', path, idx, body.subarray(at, at + CHUNK));
        }
        this.sql.exec('INSERT OR REPLACE INTO files (path, size, mtime, chunks) VALUES (?, ?, ?, ?)', path, body.byteLength, mtime, idx);
      });
      return new Response('ok');
    }
    if (request.method === 'DELETE') {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM chunks WHERE path = ?', path);
        this.sql.exec('DELETE FROM files WHERE path = ?', path);
      });
      return new Response('ok');
    }
    return new Response('method not allowed', { status: 405 });
  }
}

// サーバーは1台だけ（配信者ごとの分け方はサーバーの中でしている）
const server = (env) => getContainer(env.SERVER, 'main');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 中のサーバーが本当の URL（https://.../t/...）を作れるように、元のホスト名を渡す
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
    return server(env).fetch(new Request(request, { headers }));
  },

  // 定期的に起こす（作り直したあとや止まったあとでも、配信者が開く前に起きているように）
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(server(env).fetch('http://server/healthz').catch((err) => console.error('起こせませんでした:', err)));
  },
};
