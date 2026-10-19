// いいね応援ゲージの受け入れテスト。実装前に完成条件を固定する。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { normalize, createStore } from '../../src/config.js';
import { Hub } from '../../src/hub.js';
import { CheerEngine } from '../../src/cheer.js';
import { createRuntime } from '../../src/runtime.js';

const tempDirs = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-cheer-'));
  tempDirs.push(dir);
  return dir;
};
process.once('exit', () => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const baseCheer = (extra = {}) => ({
  title: 'みんなで応援', goal: 500, growth: 1.5, loop: true, fullText: '満タン!',
  fullActions: [], sound: true, volume: 0.3, color: 'accent', fullColor: 'gold', ...extra,
});

function client() {
  const sent = [];
  return { readyState: 1, sent, send: (text) => sent.push(JSON.parse(text)), on() {} };
}

function like(hub, count, testEvent = false) {
  hub.publish({ kind: 'like', count, ...(testEvent ? { test: true } : {}) });
}

function setup(config = {}, onFull = null) {
  const hub = new Hub();
  const connected = client();
  hub.addClient(connected);
  const engine = new CheerEngine(hub, { onFull });
  engine.setConfig({ default: baseCheer(config) });
  return { hub, connected, engine };
}

test('AC-1: cheers の設定を検証し、壊れた値を日本語で保存しない', () => {
  const results = [
    normalize({ cheers: { default: { goal: 0 } } }),
    normalize({ cheers: { default: { growth: 0.5 } } }),
    normalize({ cheers: { default: { fullActions: [{ type: '知らない動作' }] } } }),
  ];
  for (const result of results) {
    assert.ok(result.errors.length);
    assert.ok(result.errors.some((message) => /[ぁ-んァ-ヶ一-龠]/u.test(message)));
  }
});

test('AC-2・3: いいねを足し、満タン後の目標と余りを更新する', () => {
  const { hub, engine } = setup();
  engine.start?.('default');
  for (let i = 0; i < 100; i += 1) like(hub, 1);
  assert.equal(engine.snapshot().default.value, 100);
  like(hub, 400);
  assert.deepEqual(engine.snapshot().default, { ...engine.snapshot().default, value: 0, goal: 750, round: 1, full: false });
  const events = [];
  const second = setup({ goal: 500, growth: 1 }, (event) => events.push(event));
  like(second.hub, 1200);
  assert.equal(events.length, 1);
  assert.equal(second.engine.snapshot().default.value, 700);
});

test('AC-4: loop false は満タンのまま止まる', () => {
  const { hub, engine } = setup({ loop: false });
  like(hub, 500);
  const full = engine.snapshot().default;
  like(hub, 100);
  assert.deepEqual(engine.snapshot().default, full);
});

test('AC-5・6: 動作を満タンごとに一度だけ動かし、加減算とリセットを行う', () => {
  const calls = [];
  const { engine } = setup({ fullActions: [{ type: 'gacha.start' }] }, (payload) => {
    calls.push(payload);
    throw new Error('動作側の失敗');
  });
  engine.fill('default');
  assert.equal(calls.length, 1);
  engine.add('default', 50);
  engine.add('default', -20);
  assert.equal(engine.snapshot().default.value, 30);
  engine.add('default', 3);
  engine.reset('default');
  assert.deepEqual(engine.snapshot().default, { ...engine.snapshot().default, value: 0, round: 0, full: false, goal: 500 });
});

test('AC-7・8: テスト送信と公開状態を分離し、記録とユーザー情報を持たない', () => {
  const { hub, engine, connected } = setup();
  like(hub, 10, true);
  assert.equal(engine.snapshot().default.value, 10);
  hub.setStatus({ mode: 'live' });
  assert.equal(engine.snapshot().default.value, 0);
  like(hub, 1, true);
  assert.equal(engine.snapshot().default.value, 0);
  const serialized = JSON.stringify({ snapshot: engine.snapshot(), messages: connected.sent });
  assert.doesNotMatch(serialized, /ユーザー|利用者|名前|user-id/i);
});

test('AC-9・10: HTTP操作と利用不可状態を扱う', async () => {
  const dir = tempDir();
  const store = createStore(path.join(dir, 'config.yaml'));
  store.replaceText('cheers:\n  default:\n    goal: 500\n');
  const runtime = createRuntime({ id: 'local', store, dataDir: path.join(dir, 'data'), mediaDirs: [dir] });
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const add = await fetch(`${base}/api/cheer/default/add?value=50`);
    assert.equal(add.status, 200);
    assert.equal((await fetch(`${base}/api/cheer`)).status, 200);
    assert.equal((await fetch(`${base}/api/cheer/default/fill`)).status, 200);
    assert.equal((await fetch(`${base}/api/cheer/default/reset`)).status, 200);
    const control = await fetch(`${base}/api/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: 'cheer', action: 'add', data: { id: 'default', value: 2 } }) });
    assert.equal(control.status, 200);
    assert.doesNotMatch(fs.readdirSync(path.join(dir, 'data')).join('\n'), /cheer/i);
  } finally {
    await runtime.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
