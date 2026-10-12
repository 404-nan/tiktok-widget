// data/ の中身を、外の置き場（Cloudflare の Vault）と同じにしておく。
// コンテナは作り直すとファイルが消えるので、起動するときに置き場から戻し、そのあとは変わったファイルだけ送る。
// TW_VAULT（例: http://192.0.2.1）があるときだけ使う。ふだん（自分の PC）は使わない。

import fs from 'node:fs';
import path from 'node:path';

const SYNC_EVERY = 15_000;
// 書きかけのファイル（tenants.json.tmp-123 など）は送らない
const skip = (rel) => /\.tmp-\d+$/.test(rel) || rel.endsWith('.tmp');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (rel) => rel.split('/').map(encodeURIComponent).join('/');

function walk(dir, base = dir, out = new Map()) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, base, out);
    else if (ent.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (skip(rel)) continue;
      const st = fs.statSync(full);
      out.set(rel, { size: st.size, mtime: Math.floor(st.mtimeMs) });
    }
  }
  return out;
}

export function createVault({ url, dir, log = console }) {
  const known = new Map(); // 置き場にあるもの: rel → { size, mtime }
  let timer = null;
  let running = null;

  const call = async (p, init) => {
    const res = await fetch(`${url}${p}`, init);
    if (!res.ok) throw new Error(`置き場 ${init?.method ?? 'GET'} ${p}: HTTP ${res.status}`);
    return res;
  };

  /** 置き場から data/ に戻す。つながらないまま始めると空のデータで上書きしてしまうので、戻せるまで待つ */
  async function restore({ tries = 20 } = {}) {
    for (let i = 1; ; i++) {
      try {
        const list = await (await call('/list')).json();
        fs.mkdirSync(dir, { recursive: true });
        for (const f of list) {
          const buf = Buffer.from(await (await call(`/f/${enc(f.path)}`)).arrayBuffer());
          const full = path.join(dir, ...f.path.split('/'));
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.writeFileSync(full, buf);
          const t = new Date(f.mtime);
          fs.utimesSync(full, t, t);
          known.set(f.path, { size: f.size, mtime: f.mtime });
        }
        log.log(`[vault] ${list.length} 個のファイルを戻しました`);
        return;
      } catch (err) {
        if (i >= tries) throw err;
        log.warn(`[vault] 戻せませんでした（${i}回目）: ${err.message}`);
        await sleep(Math.min(10_000, 500 * 2 ** i));
      }
    }
  }

  /** 変わったファイルを送り、消えたファイルを消す */
  async function sync() {
    if (running) return running;
    running = (async () => {
      const now = walk(dir);
      for (const [rel, st] of now) {
        const old = known.get(rel);
        if (old && old.size === st.size && old.mtime === st.mtime) continue;
        try {
          const body = fs.readFileSync(path.join(dir, ...rel.split('/')));
          await call(`/f/${enc(rel)}?mtime=${st.mtime}`, { method: 'PUT', body });
          known.set(rel, st);
        } catch (err) {
          log.warn(`[vault] ${rel} を送れませんでした: ${err.message}`);
        }
      }
      for (const rel of [...known.keys()]) {
        if (now.has(rel)) continue;
        try {
          await call(`/f/${enc(rel)}`, { method: 'DELETE' });
          known.delete(rel);
        } catch (err) {
          log.warn(`[vault] ${rel} を消せませんでした: ${err.message}`);
        }
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }

  function start() {
    timer = setInterval(() => sync().catch(() => {}), SYNC_EVERY);
    timer.unref();
    // 止められるとき（作り直し・眠るとき）は、最後に送ってから終わる
    for (const sig of ['SIGTERM', 'SIGINT']) {
      process.once(sig, async () => {
        clearInterval(timer);
        await sync().catch(() => {});
        process.exit(0);
      });
    }
  }

  return { restore, sync, start };
}
