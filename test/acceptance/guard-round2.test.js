// tw-guard 2巡目(カード docs/cards/tw-guard.md の「2巡目」)の受け入れテスト。
// AC-6: TW_SERVER で hosted の本番サーバーを送り先にしたローカルモードの spin_roulette は、
//       認証なし API(/api/control)を通じて実行されず、日本語で理由を返す。
// AC-7: tw unset の引数がないとき、未処理例外で落ちず、日本語の理由で終了コード 1。
// 本物の本番には触らない。hosted の送り先は一時ディレクトリの設定で起動した実物の server.js。

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MCP_ENTRY = path.join(repoRoot, 'mcp', 'server.js');
const CLI_ENTRY = path.join(repoRoot, 'bin', 'tw.js');

const tmpDirs = [];
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-guard-round2-'));
  tmpDirs.push(d);
  return d;
};
after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

const STRIP = ['TW_HOSTED', 'TW_SERVER', 'TW_AI_TOKEN', 'TW_AI_TENANT', 'TW_CONFIG', 'TW_DATA', 'TW_ENV', 'PORT', 'TIKTOK_USERNAME', 'TW_VAULT', 'TW_ADMIN_TOKEN'];
const cleanEnv = (over = {}) => {
  const env = { ...process.env };
  for (const k of STRIP) delete env[k];
  return Object.assign(env, over);
};

// 1人用の形( TW_HOSTED も tenants.json も無い)のローカル環境。hosted なのは送り先のサーバーだけ
function localScenario() {
  const root = tmpDir();
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, fs.readFileSync(path.join(repoRoot, 'config.example.yaml'), 'utf8'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return { root, configPath, dataDir, env: { TW_CONFIG: configPath, TW_DATA: dataDir } };
}

const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

// --- AC-6: hosted の本番サーバーを送り先にしたローカルモードの spin_roulette ---
// hosted と判定の仕方は実装に任せるため、送り先は TW_HOSTED=1 で起動した実物の server.js にする。
// 記録用のプロキシを挟んで、/api/control への POST(認証なし API)が届いていないことを確かめる。

/** 実物の server.js を hosted として一時ポートで起動し、ready を返す */
function startHostedServer(s) {
  const port = 34000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(repoRoot, 'server.js')], {
    cwd: repoRoot,
    env: cleanEnv({ ...s.env, TW_HOSTED: '1', HOST: '127.0.0.1', PORT: String(port) }),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));
  const target = `http://127.0.0.1:${port}`;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`hosted サーバーが起動しません\n${stderr.join('')}`)), 60000);
    const poll = () => {
      const sock = net.connect(port, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); clearTimeout(timer); resolve(target); });
      sock.once('error', () => { sock.destroy(); setTimeout(poll, 100); });
    };
    poll();
  });
  return { child, target, ready };
}

/** リクエストを本物に中継しつつ記録するプロキシ */
function startProxy(target) {
  const hits = [];
  const proxyServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url });
      const nreq = http.request(`${target}${req.url}`, {
        method: req.method,
        headers: { ...req.headers, host: new URL(target).host },
      }, (nres) => {
        res.writeHead(nres.statusCode, nres.headers);
        nres.pipe(res);
      });
      nreq.on('error', () => { try { res.writeHead(502); res.end(); } catch {} });
      if (chunks.length) nreq.write(Buffer.concat(chunks));
      nreq.end();
    });
  });
  return {
    hits,
    served: () => new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${proxyServer.address().port}`))),
    stop: () => new Promise((resolve) => {
      proxyServer.closeAllConnections?.();
      proxyServer.close(() => resolve());
    }),
  };
}

async function withMcp(env, run) {
  const child = spawn(process.execPath, [MCP_ENTRY], { cwd: repoRoot, env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'] });
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));
  let buffer = '';
  const readers = new Map();
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const i = buffer.indexOf('\n');
      if (i === -1) break;
      const raw = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!raw.trim()) continue;
      let msg = null;
      try { msg = JSON.parse(raw); } catch {}
      if (msg && msg.id != null && readers.has(msg.id)) {
        readers.get(msg.id)(msg);
        readers.delete(msg.id);
      }
    }
  });
  const request = (method, params) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        readers.delete(id);
        reject(new Error(`MCP ${method} が応答しません\nstderr: ${stderr.join('')}`));
      }, 60000);
      readers.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  };
  try {
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance-round2', version: '0.0.0' } });
    if (init.error) throw new Error(`initialize 失敗: ${JSON.stringify(init.error)}\nstderr: ${stderr.join('')}`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    return await run({ request });
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

const callTool = async (request, name, args) => {
  const msg = await request('tools/call', { name, arguments: args });
  assert.ok(!msg.error, `tools/call ${name} が失敗: ${JSON.stringify(msg.error)}`);
  const result = msg.result ?? {};
  const text = (result.content ?? []).map((c) => c.text ?? '').join('\n');
  return { isError: result.isError === true, text };
};

function runCliWithCode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], { cwd: repoRoot, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`tw ${args.join(' ')} がタイムアウトしました\n${out}`));
    }, 60000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

test('AC-6 MCP: 送り先が hosted の本番サーバーでも、ローカルモードの spin_roulette は認証なし API を通じずに日本語の理由を返す', async () => {
  const s = localScenario();
  const hosted = startHostedServer(s);
  await hosted.ready;
  const proxy = startProxy(hosted.target);
  const proxyUrl = await proxy.served();
  try {
    await withMcp({ ...s.env, TW_SERVER: proxyUrl }, async ({ request }) => {
      const result = await callTool(request, 'spin_roulette', {});
      assert.ok(result.isError, `spin_roulette: 拒否として返っていません: ${JSON.stringify(result.text)}`);
      assert.ok(KANA_RE.test(result.text), `spin_roulette: 日本語の理由がありません: ${JSON.stringify(result.text)}`);
    });
    const spins = proxy.hits.filter((h) => h.method === 'POST' && h.url.startsWith('/api/control'));
    assert.equal(spins.length, 0, `spin_roulette が本番の認証なし API(/api/control)を通じて実行されました: ${JSON.stringify(proxy.hits)}`);
  } finally {
    await proxy.stop();
    hosted.child.kill();
    await new Promise((resolve) => hosted.child.once('exit', resolve));
  }
});

test('AC-7 CLI: tw unset に引数がないとき、未処理例外で落ちずに日本語の理由を出して終了コード 1', async () => {
  const s = localScenario();
  const { code, out } = await runCliWithCode(['unset'], s.env);
  assert.equal(code, 1, `tw unset: 終了コードが 1 ではありません(実際: ${code})\n${out}`);
  assert.ok(KANA_RE.test(out), `tw unset: 使い方や不足している引数の日本語の理由がありません\n${out}`);
  assert.ok(!/node:internal|UnhandledPromiseRejection|ReferenceError|SyntaxError|at\s+.*\(.+:\d+:\d+\)/.test(out), `tw unset: 未処理例外で落ちています\n${out}`);
});
