// カード docs/cards/obs-attempt-count.md の完成条件(AC-1〜AC-5)を確かめる受け入れテスト。AC-6 は npm test 全体で見る。
// AC-1〜3 は Hub と History をそのまま組み、AC-4・5 は実物の server.js を hosted で一時ポートに起こして upgrade を送る。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Hub } from '../../src/hub.js';
import { History } from '../../src/history.js';
import { cleanEnv, repoRoot } from '../helpers/guard-harness.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- AC-1〜3: 配信の記録 ----------
function fakeClient(role) {
  const ws = new EventEmitter();
  ws.role = role;
  ws.readyState = 1;
  ws.send = () => {};
  ws.close = () => ws.emit('close');
  return ws;
}

// 配信を始め、steps の順に接続(open)・切断(close)してから配信を終え、保存された記録を返す
function streamWith(steps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-attempt-'));
  const hub = new Hub();
  const history = new History(hub, dir, { id: 'tenant1' });
  clearInterval(history.timer);
  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.publish({ kind: 'viewers', viewers: 10 }); // 何も起きなかった配信は保存されないため
  for (const step of steps) {
    if (step.open) {
      step.ws = fakeClient(step.open);
      hub.addClient(step.ws);
    } else {
      step.close.ws.close();
    }
  }
  hub.setStatus({ mode: 'idle' });
  const [saved] = history.list();
  const record = history.get(saved.id);
  fs.rmSync(dir, { recursive: true, force: true });
  return record;
}

test('AC-1 配信中に obs 役が2回つながると obsConnects が 2 になる', () => {
  const first = { open: 'obs' };
  const record = streamWith([first, { close: first }, { open: 'obs' }]);
  assert.equal(record.obsConnects, 2);
});

test('AC-2 preview 役の接続は obsConnects に入らない', () => {
  const p = { open: 'preview' };
  const onlyPreview = streamWith([p, { close: p }, { open: 'preview' }]);
  assert.strictEqual(onlyPreview.obsConnects, 0);
  const o = { open: 'obs' };
  const mixed = streamWith([{ open: 'preview' }, o, { close: o }, { open: 'obs' }]);
  assert.strictEqual(mixed.obsConnects, 2);
});

test('AC-3 obs が1回もつながらなかった配信は obsConnects が 0(未記録ではない)', () => {
  const record = streamWith([]);
  assert.strictEqual(record.obsConnects, 0);
  assert.strictEqual(record.widgetMs, 0);
});

// ---------- AC-4・5: 断った upgrade の journal ----------
const children = [];
const roots = [];
after(() => {
  for (const c of children) c.kill();
  for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

async function bootServer() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-attempt-srv-'));
  roots.push(root);
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, '');
  const probe = net.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => resolve(probe.address().port)));
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, [path.join(repoRoot, 'server.js')], {
    cwd: repoRoot,
    env: cleanEnv({ TW_CONFIG: configPath, TW_DATA: dataDir, TW_ENV: 'dev', TW_RESUME_CONNECT: '0', TW_ADMIN_TOKEN: 'admin-token-for-test', TW_HOSTED: '1', HOST: '127.0.0.1', PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const out = [];
  child.stdout.on('data', (d) => out.push(String(d)));
  child.stderr.on('data', (d) => out.push(String(d)));
  for (let i = 0; i < 600; i++) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('error', () => { s.destroy(); resolve(false); });
    });
    if (ok) break;
    await sleep(100);
  }
  return { port, lines: () => out.join('').split('\n').filter((l) => l.includes('ws rejected')) };
}

// 生の upgrade を1回送り、サーバーが切るまで待つ
function upgrade(port, urlPath) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => {
      s.write(`GET ${urlPath} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    s.on('error', () => {});
    s.on('close', resolve);
    setTimeout(() => { s.destroy(); resolve(); }, 3000);
  });
}

test('AC-4 無効な鍵の upgrade は `ws rejected: no-tenant` を出し、鍵の文字列は入らない', async () => {
  const srv = await bootServer();
  const secret = 'zzbadkey1234567890abcdef';
  await upgrade(srv.port, `/t/${secret}/ws`);
  await sleep(500);
  const lines = srv.lines();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /ws rejected: no-tenant/);
  assert.equal(lines[0].includes(secret), false);
});

test('AC-5 同じ理由で1分に何回断っても出る行は1行', async () => {
  const srv = await bootServer();
  for (let i = 0; i < 6; i++) await upgrade(srv.port, `/t/badkey${i}aaaaaaaaaaaaaaaa/ws`);
  await sleep(500);
  const lines = srv.lines().filter((l) => l.includes('no-tenant'));
  assert.equal(lines.length, 1);
});
