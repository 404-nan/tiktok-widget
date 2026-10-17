import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MCP_ENTRY = path.join(repoRoot, 'mcp', 'server.js');
const CLI_ENTRY = path.join(repoRoot, 'bin', 'tw.js');

const tmpDirs = [];
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-guard-ac-'));
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

const EXAMPLE_YAML = () => fs.readFileSync(path.join(repoRoot, 'config.example.yaml'), 'utf8');
const readConfig = (p) => fs.readFileSync(p, 'utf8');

// 本番と同じ形: config は root/config.yaml、データは root/data。tenants.json はそのデータの場所に置く
function scenario({ hosted = false, tenants = false } = {}) {
  const root = tmpDir();
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, EXAMPLE_YAML());
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const env = { TW_CONFIG: configPath, TW_DATA: dataDir };
  if (tenants) fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({ tenants: [], global: { access: {} } }));
  if (hosted) env.TW_HOSTED = '1';
  return { root, configPath, dataDir, env, original: EXAMPLE_YAML() };
}

const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const REMOTE_HINT = (text) =>
  String(text)
    .split('\n')
    .some((line) => line.includes('/ai/v1') && line.includes('TW_SERVER') && line.includes('TW_AI_TOKEN'));

function startRecorder() {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? null });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, source: 'recorder', status: 'acceptance-live', state: { topGifters: [] }, timers: {}, rush: {} }));
    });
  });
  return {
    hits,
    count: (url) => hits.filter((h) => h.url === url).length,
    start: () => new Promise((resolve, reject) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
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
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  try {
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance', version: '0.0.0' } });
    if (init.error) throw new Error(`initialize 失敗: ${JSON.stringify(init.error)}\nstderr: ${stderr.join('')}`);
    notify('notifications/initialized', {});
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

const toolNames = async (request) => {
  const list = await request('tools/list', {});
  assert.ok(!list.error, `tools/list が失敗: ${JSON.stringify(list.error)}`);
  return new Set((list.result?.tools ?? []).map((t) => t.name));
};

function runCli(args, env) {
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
    child.on('close', () => { clearTimeout(timer); resolve(out); });
  });
}

function assertWriteRefusedMCP(result, configPath, original, label) {
  assert.ok(result.isError, `${label}: 拒否として返っていません: ${JSON.stringify(result.text)}`);
  assert.ok(KANA_RE.test(result.text), `${label}: 日本語の理由がありません: ${JSON.stringify(result.text)}`);
  assert.ok(REMOTE_HINT(result.text), `${label}: 理由に TW_SERVER と TW_AI_TOKEN を付けて /ai/v1 を使うリモートモードが1行で書かれていません: ${JSON.stringify(result.text)}`);
  assert.equal(readConfig(configPath), original, `${label}: 設定ファイルが書き換わってしまいました`);
}

function assertWriteRefusedCLI(output, configPath, original, label) {
  assert.ok(KANA_RE.test(output), `${label}: 日本語の理由が出ていません\n${output}`);
  assert.ok(REMOTE_HINT(output), `${label}: 理由に TW_SERVER と TW_AI_TOKEN を付けて /ai/v1 を使うリモートモードが1行で書かれていません\n${output}`);
  assert.equal(readConfig(configPath), original, `${label}: 設定ファイルが書き換わってしまいました\n${output}`);
}

const WRITE_CALLS = [
  ['set_config', () => ({ path: 'theme.accent', value: '#AA3344' })],
  ['merge_config', () => ({ path: 'roulettes.reward', value: { duration: 8 } })],
  ['delete_config', () => ({ path: 'theme.accent' })],
  ['replace_config', () => ({ yaml: 'theme:\n  accent: "#11AA22"\n' })],
];

// --- AC-1 / AC-2: 設定の書き換えを止める ---

test('AC-1/AC-2 MCP: TW_HOSTED=1 のとき set/merge/delete/replace は保存せず、日本語の理由(代替方法を1行で)を返す', async () => {
  const s = scenario({ hosted: true });
  await withMcp(s.env, async ({ request }) => {
    for (const [name, args] of WRITE_CALLS) {
      const before = readConfig(s.configPath);
      const result = await callTool(request, name, args());
      assertWriteRefusedMCP(result, s.configPath, before, name);
      assert.equal(before, s.original, `${name}: 前提が崩れています`);
    }
  });
});

test('AC-1/AC-2 MCP: データの場所に tenants.json があるとき set/merge/delete/replace は保存せず、理由を返す', async () => {
  const s = scenario({ tenants: true });
  await withMcp(s.env, async ({ request }) => {
    for (const [name, args] of WRITE_CALLS) {
      const before = readConfig(s.configPath);
      const result = await callTool(request, name, args());
      assertWriteRefusedMCP(result, s.configPath, before, name);
      assert.equal(before, s.original, `${name}: 前提が崩れています`);
    }
  });
});

test('AC-1/AC-2 CLI: TW_HOSTED=1 のとき tw set/merge/unset は保存せず、理由を出す', async () => {
  const s = scenario({ hosted: true });
  for (const [name, args] of [['set', ['set', 'theme.accent', '#AA3344']], ['merge', ['merge', 'roulettes.reward', '{duration: 3}']], ['unset', ['unset', 'theme.accent']]]) {
    assertWriteRefusedCLI(await runCli(args, s.env), s.configPath, s.original, `tw ${name}`);
  }
});

test('AC-1/AC-2 CLI: tenants.json があるとき tw set/merge/unset は保存せず、理由を出す', async () => {
  const s = scenario({ tenants: true });
  for (const [name, args] of [['set', ['set', 'theme.accent', '#AA3344']], ['merge', ['merge', 'roulettes.reward', '{duration: 3}']], ['unset', ['unset', 'theme.accent']]]) {
    assertWriteRefusedCLI(await runCli(args, s.env), s.configPath, s.original, `tw ${name}`);
  }
});

// --- AC-3: テスト送信・ルーレットを止める ---

const SEND_CALLS = [['test_event', { kind: 'gift', giftName: 'Rose' }], ['spin_roulette', {}]];

test('AC-3 MCP: TW_HOSTED=1 のとき test_event/spin_roulette は送らずに日本語の理由を返す', async () => {
  const s = scenario({ hosted: true });
  const rec = startRecorder();
  const url = await rec.start();
  try {
    await withMcp({ ...s.env, TW_SERVER: url }, async ({ request }) => {
      for (const [name, args] of SEND_CALLS) {
        const result = await callTool(request, name, args);
        assert.ok(result.isError, `${name}: 拒否として返っていません: ${JSON.stringify(result.text)}`);
        assert.ok(KANA_RE.test(result.text), `${name}: 日本語の理由がありません: ${JSON.stringify(result.text)}`);
      }
    });
    assert.equal(rec.count('/api/simulate'), 0, `test_event が送信先に届いています: ${JSON.stringify(rec.hits)}`);
    assert.equal(rec.count('/api/control'), 0, `spin_roulette が送信先に届いています: ${JSON.stringify(rec.hits)}`);
  } finally {
    await rec.stop();
  }
});

test('AC-3 MCP: tenants.json があるとき test_event/spin_roulette は送らずに理由を返す', async () => {
  const s = scenario({ tenants: true });
  const rec = startRecorder();
  const url = await rec.start();
  try {
    await withMcp({ ...s.env, TW_SERVER: url }, async ({ request }) => {
      for (const [name, args] of SEND_CALLS) {
        const result = await callTool(request, name, args);
        assert.ok(result.isError, `${name}: 拒否として返っていません: ${JSON.stringify(result.text)}`);
        assert.ok(KANA_RE.test(result.text), `${name}: 日本語の理由がありません: ${JSON.stringify(result.text)}`);
      }
    });
    assert.equal(rec.count('/api/simulate'), 0, `test_event が送信先に届いています: ${JSON.stringify(rec.hits)}`);
    assert.equal(rec.count('/api/control'), 0, `spin_roulette が送信先に届いています: ${JSON.stringify(rec.hits)}`);
  } finally {
    await rec.stop();
  }
});

test('AC-3 CLI: TW_HOSTED=1 のとき tw test/spin は送らずに理由を出す', async () => {
  const s = scenario({ hosted: true });
  const rec = startRecorder();
  const url = await rec.start();
  try {
    const testOut = await runCli(['test', 'gift', 'Rose', '1'], { ...s.env, TW_SERVER: url });
    const spinOut = await runCli(['spin'], { ...s.env, TW_SERVER: url });
    assert.equal(rec.count('/api/simulate'), 0, `tw test が送信先に届いています: ${JSON.stringify(rec.hits)}\n${testOut}`);
    assert.equal(rec.count('/api/control'), 0, `tw spin が送信先に届いています: ${JSON.stringify(rec.hits)}\n${spinOut}`);
    assert.ok(KANA_RE.test(testOut), `tw test の理由が出ていません\n${testOut}`);
    assert.ok(KANA_RE.test(spinOut), `tw spin の理由が出ていません\n${spinOut}`);
  } finally {
    await rec.stop();
  }
});

test('AC-3 CLI: tenants.json があるとき tw test/spin は送らずに理由を出す', async () => {
  const s = scenario({ tenants: true });
  const rec = startRecorder();
  const url = await rec.start();
  try {
    const testOut = await runCli(['test', 'gift', 'Rose', '1'], { ...s.env, TW_SERVER: url });
    const spinOut = await runCli(['spin'], { ...s.env, TW_SERVER: url });
    assert.equal(rec.count('/api/simulate'), 0, `tw test が送信先に届いています: ${JSON.stringify(rec.hits)}\n${testOut}`);
    assert.equal(rec.count('/api/control'), 0, `tw spin が送信先に届いています: ${JSON.stringify(rec.hits)}\n${spinOut}`);
    assert.ok(KANA_RE.test(testOut), `tw test の理由が出ていません\n${testOut}`);
    assert.ok(KANA_RE.test(spinOut), `tw spin の理由が出ていません\n${spinOut}`);
  } finally {
    await rec.stop();
  }
});

test('AC-3 分からないとき(サーバーが止まっている): test_event/spin_roulette は今までどおりのエラー', async () => {
  const s = scenario();
  const rec = startRecorder();
  const url = await rec.start();
  await rec.stop();
  await withMcp({ ...s.env, TW_SERVER: url }, async ({ request }) => {
    const r1 = await callTool(request, 'test_event', { kind: 'gift', giftName: 'Rose' });
    const r2 = await callTool(request, 'spin_roulette', {});
    for (const [name, r] of [['test_event', r1], ['spin_roulette', r2]]) {
      assert.ok(r.isError, `${name}: エラーになっていません: ${JSON.stringify(r.text)}`);
      assert.match(r.text, /接続できません/, `${name}: 今までどおりの接続エラーではありません: ${JSON.stringify(r.text)}`);
      assert.ok(!REMOTE_HINT(r.text), `${name}: 接続できないだけで拒否の理由を返しています: ${JSON.stringify(r.text)}`);
    }
  });
});

test('AC-3 分からないとき(サーバーが止まっている): tw test/spin は今までどおりのエラー', async () => {
  const s = scenario();
  const rec = startRecorder();
  const url = await rec.start();
  await rec.stop();
  const testOut = await runCli(['test', 'gift', 'Rose', '1'], { ...s.env, TW_SERVER: url });
  const spinOut = await runCli(['spin'], { ...s.env, TW_SERVER: url });
  assert.match(testOut, /接続できません/, `tw test: 今までどおりの接続エラーではありません\n${testOut}`);
  assert.match(spinOut, /接続できません/, `tw spin: 今までどおりの接続エラーではありません\n${spinOut}`);
});

// --- AC-4: 1人用( TW_HOSTED 無し・tenants.json 無し)は今までどおり ---

test('AC-4 MCP: 1人用では set/merge/delete/replace が今までどおり保存される', async () => {
  const s = scenario();
  await withMcp(s.env, async ({ request }) => {
    for (const [name, args] of WRITE_CALLS) {
      const before = readConfig(s.configPath);
      const result = await callTool(request, name, args());
      assert.ok(!result.isError, `${name}: 拒否されました: ${JSON.stringify(result.text)}`);
      assert.notEqual(readConfig(s.configPath), before, `${name}: 設定ファイルが保存されていません`);
    }
  });
});

test('AC-4 CLI: 1人用では tw set/merge/unset が今までどおり保存される', async () => {
  const s = scenario();
  for (const [name, args] of [['set', ['set', 'theme.accent', '#AA3344']], ['merge', ['merge', 'roulettes.reward', '{duration: 3}']], ['unset', ['unset', 'theme.accent']]]) {
    const before = readConfig(s.configPath);
    await runCli(args, s.env);
    assert.notEqual(readConfig(s.configPath), before, `tw ${name}: 保存されていません`);
  }
});

test('AC-4 MCP: 1人用では test_event/spin_roulette が今までどおり送られる', async () => {
  const s = scenario();
  const rec = startRecorder();
  const url = await rec.start();
  try {
    await withMcp({ ...s.env, TW_SERVER: url }, async ({ request }) => {
      const r1 = await callTool(request, 'test_event', { kind: 'gift', giftName: 'Rose' });
      const r2 = await callTool(request, 'spin_roulette', {});
      assert.ok(!r1.isError && !r2.isError, `送れていません: ${JSON.stringify([r1, r2])}`);
    });
    assert.equal(rec.count('/api/simulate'), 1, `test_event が送れていません: ${JSON.stringify(rec.hits)}`);
    assert.equal(rec.count('/api/control'), 1, `spin_roulette が送れていません: ${JSON.stringify(rec.hits)}`);
  } finally {
    await rec.stop();
  }
});

test('AC-4 CLI: 1人用では tw test/spin が今までどおり送られる', async () => {
  const s = scenario();
  const rec = startRecorder();
  const url = await rec.start();
  try {
    await runCli(['test', 'gift', 'Rose', '1'], { ...s.env, TW_SERVER: url });
    await runCli(['spin'], { ...s.env, TW_SERVER: url });
    assert.equal(rec.count('/api/simulate'), 1, `tw test が送れていません: ${JSON.stringify(rec.hits)}`);
    assert.equal(rec.count('/api/control'), 1, `tw spin が送れていません: ${JSON.stringify(rec.hits)}`);
  } finally {
    await rec.stop();
  }
});

// --- AC-5: リモートモード(TW_AI_TOKEN と TW_SERVER)は変えない ---

test('AC-5 MCP: リモートモードは AI 用の道具を出し、書き換えもテスト送信も /ai/v1 に Bearer で行く', async () => {
  const s = scenario({ hosted: true });
  const rec = startRecorder();
  const url = await rec.start();
  try {
    const env = { ...s.env, TW_SERVER: url, TW_AI_TOKEN: 'acceptance-test-token' };
    await withMcp(env, async ({ request }) => {
      const names = await toolNames(request);
      for (const wanted of ['dry_run', 'undo', 'list_changes', 'request_billing_change']) {
        assert.ok(names.has(wanted), `リモートモードの道具 ${wanted} がありません: ${JSON.stringify([...names])}`);
      }
      const status = await callTool(request, 'get_status', {});
      assert.ok(status.text.includes('acceptance-live'), `get_status の返事が /ai/v1 から来ていません: ${JSON.stringify(status.text)}`);
      const set = await callTool(request, 'set_config', { path: 'theme.accent', value: '#AA3344' });
      assert.ok(!set.isError, `リモートモードの set_config が拒否されました: ${JSON.stringify(set.text)}`);
      assert.equal(readConfig(s.configPath), s.original, `リモートモードなのにローカルの設定ファイルが書き換わりました`);
      const send = await callTool(request, 'test_event', { kind: 'gift', giftName: 'Rose' });
      assert.ok(!send.isError, `リモートモードの test_event が拒否されました: ${JSON.stringify(send.text)}`);
    });
    assert.ok(rec.hits.some((h) => h.url === '/ai/v1/status' && h.auth === 'Bearer acceptance-test-token'), `/ai/v1/status に Bearer トークン付きで行っていません: ${JSON.stringify(rec.hits)}`);
    assert.ok(rec.hits.some((h) => h.url === '/ai/v1/config/set' && h.method === 'POST' && h.auth === 'Bearer acceptance-test-token'), `/ai/v1/config/set に Bearer トークン付きで行っていません: ${JSON.stringify(rec.hits)}`);
    assert.ok(rec.hits.some((h) => h.url === '/ai/v1/test/event' && h.method === 'POST' && h.auth === 'Bearer acceptance-test-token'), `/ai/v1/test/event に Bearer トークン付きで行っていません: ${JSON.stringify(rec.hits)}`);
  } finally {
    await rec.stop();
  }
});
