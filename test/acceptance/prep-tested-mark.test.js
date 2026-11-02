// カード docs/cards/prep-tested-mark.md の完成条件 AC-1〜3 を確かめる受け入れテスト。AC-4 は目で見る、AC-5 は npm test 全体なので書かない。
// 実物の createRuntime を一時フォルダで起こし、本番と同じ入口 POST /api/demo(mode: 'demo')と、配信中のテスト送信で preparation.json を見る。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRuntime } from '../../src/runtime.js';
import { createStore } from '../../src/config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const giftTest = { kind: 'gift', test: true, user: { id: 'u1', name: 'a' }, gift: { id: 1, name: 'Rose', diamonds: 1 }, count: 1 };

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-prep-tested-'));
  let clock = 1000;
  const runtime = createRuntime({ id: 'prep', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir], now: () => clock });
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const demo = (on) => fetch(`${base}/api/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) });
  const testedAt = () => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'preparation.json'), 'utf8')).testedAt; } catch { return null; }
  };
  const waitTested = async () => {
    const end = Date.now() + 3000;
    while (Date.now() < end && !testedAt()) await sleep(50);
    return testedAt();
  };
  const close = async () => {
    await runtime.close();
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { runtime, demo, testedAt, waitTested, close, setClock: (n) => { clock = n; } };
}

test('AC-1 /api/demo でデモを動かすと、preparation.json の testedAt に時刻が入る', async () => {
  const t = await boot();
  try {
    assert.equal(t.testedAt() ?? null, null);
    const res = await t.demo(true);
    assert.equal(res.status, 200);
    assert.equal(t.runtime.hub.status.mode, 'demo');
    assert.equal(await t.waitTested(), 1000);
  } finally {
    await t.demo(false);
    await t.close();
  }
});

test('AC-2 配信中のテスト送信でも testedAt が入り、2回目で時刻は変わらない', async () => {
  const t = await boot();
  try {
    t.runtime.hub.setStatus({ mode: 'live', username: 'someone', message: '' });
    t.runtime.hub.publish({ ...giftTest });
    assert.equal(t.testedAt(), 1000);
    t.setClock(2000);
    t.runtime.hub.publish({ ...giftTest });
    assert.equal(t.testedAt(), 1000);
  } finally {
    await t.close();
  }
});

test('AC-2 デモで一度入った testedAt は、次のデモで変わらない', async () => {
  const t = await boot();
  try {
    await t.demo(true);
    assert.equal(await t.waitTested(), 1000);
    await t.demo(false);
    t.setClock(5000);
    await t.demo(true);
    await sleep(1600);
    assert.equal(t.testedAt(), 1000);
  } finally {
    await t.demo(false);
    await t.close();
  }
});

test('AC-3 デモでは、配信中のテスト送信のときだけ動く処理(testEvent の受け手)は動かない', async () => {
  const t = await boot();
  try {
    let received = 0;
    t.runtime.hub.on('testEvent', () => { received += 1; });
    await t.demo(true);
    await t.waitTested();
    await sleep(1600);
    assert.equal(received, 0, 'デモのイベントが testEvent として配られた');
  } finally {
    await t.demo(false);
    await t.close();
  }
});

test('AC-3 デモの数字は、配信につないだあとの統計に残らない', async () => {
  const t = await boot();
  try {
    await t.demo(true);
    await t.waitTested();
    await sleep(1600);
    await t.demo(false);
    t.runtime.hub.setStatus({ mode: 'live', username: 'someone', message: '' });
    const state = t.runtime.hub.state;
    const total = (JSON.stringify(state).match(/\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0);
    assert.equal(total, 0, `統計にデモの数字が残っている: ${JSON.stringify(state).slice(0, 200)}`);
  } finally {
    await t.close();
  }
});
