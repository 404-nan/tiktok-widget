// tw-guard 3巡目(カード docs/cards/tw-guard.md の「3巡目」)の受け入れテスト。
// AC-8: 1人用環境で TW_SERVER の送り先が hosted だと分かった test_event / tw test は、
//       リクエストを送らず日本語で理由を返す。
// AC-9: TW_SERVER の /api/me が 5xx などの異常な応答を返したときは、hosted か判定
//       できないまま /api/control を送信せず、今までどおりのエラーを返す。
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-guard-round3-'));
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
const REMOTE_HINT = (text) =>
  String(text)
    .split('\n')
    .some((line) => line.includes('/ai/v1') && line.includes('TW_SERVER') && line.includes('TW_AI_TOKEN'));

// --- AC-8: hosted だと分かった送り先への test_event ---

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
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance-round3', version: '0.0.0' } });
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

test('AC-8 MCP: 1人用で送り先が hosted の本番サーバーのとき、test_event はリクエストを送らず日本語の理由を返す', async () => {
  const s = localScenario();
  const hosted = startHostedServer(s);
  await hosted.ready;
  const proxy = startProxy(hosted.target);
  const proxyUrl = await proxy.served();
  try {
    await withMcp({ ...s.env, TW_SERVER: proxyUrl }, async ({ request }) => {
      const result = await callTool(request, 'test_event', { kind: 'gift', giftName: 'Rose' });
      assert.ok(result.isError, `test_event: 拒否として返っていません: ${JSON.stringify(result.text)}`);
      assert.ok(KANA_RE.test(result.text), `test_event: 日本語の理由がありません: ${JSON.stringify(result.text)}`);
    });
    const sends = proxy.hits.filter((h) => h.url.startsWith('/api/simulate'));
    assert.equal(sends.length, 0, `test_event が本番の /api/simulate に送られました: ${JSON.stringify(proxy.hits)}`);
  } finally {
    await proxy.stop();
    hosted.child.kill();
    await new Promise((resolve) => hosted.child.once('exit', resolve));
  }
});

test('AC-8 CLI: 1人用で送り先が hosted の本番サーバーのとき、tw test はリクエストを送らず日本語の理由を出す', async () => {
  const s = localScenario();
  const hosted = startHostedServer(s);
  await hosted.ready;
  const proxy = startProxy(hosted.target);
  const proxyUrl = await proxy.served();
  try {
    const { out } = await runCliWithCode(['test', 'gift', 'Rose', '1'], { ...s.env, TW_SERVER: proxyUrl });
    assert.ok(KANA_RE.test(out), `tw test: 日本語の理由が出ていません\n${out}`);
    const sends = proxy.hits.filter((h) => h.url.startsWith('/api/simulate'));
    assert.equal(sends.length, 0, `tw test が本番の /api/simulate に送られました: ${JSON.stringify(proxy.hits)}\n${out}`);
  } finally {
    await proxy.stop();
    hosted.child.kill();
    await new Promise((resolve) => hosted.child.once('exit', resolve));
  }
});

// --- AC-9: /api/me が異常な応答のときは /api/control を送らず今までどおりのエラー ---

/** /api/me が 5xx を返し、その他も 5xx を返す記録用サーバー */
function startBrokenMeServer() {
  const hits = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url });
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: '点検中です' }));
    });
  });
  return {
    hits,
    start: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    stop: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

// 「今までどおりのエラー」= ガードの拒否(リモートモードの代替方法を書いた理由)ではなく、
// サーバーの状態をそのまま伝える通常のエラー。点検中 / HTTP 50x / 接続できません のどれかの形。
const PLAIN_ERROR_RE = /接続できません|HTTP\s*\d{3}|点検中です/;

test('AC-9 MCP: /api/me が 5xx のとき、spin_roulette は /api/control を送らず今までどおりのエラーを返す', async () => {
  const s = localScenario();
  const rec = startBrokenMeServer();
  const url = await rec.start();
  try {
    await withMcp({ ...s.env, TW_SERVER: url }, async ({ request }) => {
      const result = await callTool(request, 'spin_roulette', {});
      assert.ok(result.isError, `spin_roulette: エラーになっていません: ${JSON.stringify(result.text)}`);
      assert.ok(PLAIN_ERROR_RE.test(result.text), `spin_roulette: 今までどおりのエラーではありません(ガードの拒否など別の文): ${JSON.stringify(result.text)}`);
      assert.ok(!REMOTE_HINT(result.text), `spin_roulette: 判定できないのにガードの拒否を返しています: ${JSON.stringify(result.text)}`);
    });
    const spins = rec.hits.filter((h) => h.method === 'POST' && h.url.startsWith('/api/control'));
    assert.equal(spins.length, 0, `spin_roulette が判定できないまま /api/control を送信しました: ${JSON.stringify(rec.hits)}`);
  } finally {
    await rec.stop();
  }
});

test('AC-9 CLI: /api/me が 5xx のとき、tw spin は /api/control を送らず今までどおりのエラーを出す', async () => {
  const s = localScenario();
  const rec = startBrokenMeServer();
  const url = await rec.start();
  try {
    const { code, out } = await runCliWithCode(['spin'], { ...s.env, TW_SERVER: url });
    assert.ok(code !== 0, `tw spin: エラーとして終わっていません(終了コード ${code})\n${out}`);
    assert.ok(PLAIN_ERROR_RE.test(out), `tw spin: 今までどおりのエラーではありません(ガードの拒否など別の文)\n${out}`);
    assert.ok(!REMOTE_HINT(out), `tw spin: 判定できないのにガードの拒否を返しています\n${out}`);
    const spins = rec.hits.filter((h) => h.method === 'POST' && h.url.startsWith('/api/control'));
    assert.equal(spins.length, 0, `tw spin が判定できないまま /api/control を送信しました: ${JSON.stringify(rec.hits)}\n${out}`);
  } finally {
    await rec.stop();
  }
});
