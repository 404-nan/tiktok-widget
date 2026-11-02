// カード docs/cards/gacha-viewers-demo.md の AC-1〜4 を、実ランタイム(createRuntime)で確かめる。
// AC-5(npm test 全体・README の行)は全体テストと目で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { createRuntime } from '../../src/runtime.js';
import { createStore } from '../../src/config.js';
import { defaultsFor } from '../../src/schema.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gvd-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const gachaConfig = () => ({
  ...defaultsFor('gacha'),
  rollMs: 20,
  revealMs: 20,
  doneMs: 10,
  cooldownSec: 0,
  freePerReset: 1,
  minCoins: 100, // ギフトで演出そのものを回す条件(視聴者の有料回の paidRule とは別)
  paidRule: { ...defaultsFor('gacha').paidRule, minCoins: 100, spinsPerCoins: 100, gifts: [] },
});

function start(dir = tmpDir()) {
  const runtime = createRuntime({ id: 'gvd', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  return { runtime, dir, file: path.join(dir, 'gacha-viewers.json') };
}

function startWithGacha() {
  const started = start();
  const replaced = started.runtime.setConfig(['gacha'], gachaConfig());
  assert.equal(replaced.ok, true, (replaced.errors || []).join('\n'));
  return started;
}

const gift = (user, extra = {}) => ({
  kind: 'gift',
  gift: { id: '5655', name: 'Rose', diamonds: 100, count: 1 },
  totalDiamonds: 100,
  user,
  ...extra,
});
const chat = (user, extra = {}) => ({ kind: 'chat', text: '!ガチャ', user, ...extra });

// 保存は少し遅れてまとめて書かれるので、待ってから閉じて、ファイルの中身を返す。
async function savedAfterClose(runtime, file) {
  await sleep(300);
  await runtime.close();
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

async function getViewersApi(runtime) {
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/gacha-viewers`, { headers: { host: '127.0.0.1' } });
    return await res.json();
  } finally {
    server.close();
  }
}

test('AC-1 test: true のイベントでは、視聴者の記録(人数・無料回・有料回)が増えない', async () => {
  const { runtime, file } = startWithGacha();
  const user = { id: 'viewer_with_test_flag', name: 'テスト印' };
  runtime.hub.publish(gift(user, { test: true }));
  runtime.hub.publish(chat(user, { test: true }));
  assert.deepEqual(Object.keys(await savedAfterClose(runtime, file)), []);
});

test('AC-1 user.id が demo_ で始まるイベントでは、視聴者の記録が増えない', async () => {
  const { runtime, file } = startWithGacha();
  const user = { id: 'demo_taro', name: 'デモ太郎' };
  runtime.hub.publish(gift(user));
  runtime.hub.publish(chat(user));
  assert.deepEqual(Object.keys(await savedAfterClose(runtime, file)), []);
});

test('AC-2 本物の視聴者のギフトとコメントは、今までどおり記録され、回せる', async () => {
  const { runtime, file } = startWithGacha();
  const user = { id: 'viewer1', name: '本物さん' };
  runtime.hub.publish(gift(user));
  runtime.hub.publish(chat(user));
  const data = await savedAfterClose(runtime, file);
  assert.equal(data.viewer1.name, '本物さん');
  assert.equal(data.viewer1.paid.credits, 1); // ギフト100コインで有料1回を足した
  assert.equal(data.viewer1.free.used, 1); // コメントで無料1回を回した
});

test('AC-3 デモのギフトでも、ガチャの演出が hub へ今までどおり流れる', async () => {
  const { runtime } = startWithGacha();
  const sent = [];
  const original = runtime.hub.broadcast.bind(runtime.hub);
  runtime.hub.broadcast = (message) => {
    if (message?.type === 'gacha') sent.push({ event: message.event, userId: message.trigger?.user?.id });
    return original(message);
  };
  try {
    runtime.hub.publish(gift({ id: 'demo_taro', name: 'デモ太郎' }, { test: true }));
    const deadline = Date.now() + 1000;
    while (!sent.some((m) => m.event === 'done') && Date.now() < deadline) await sleep(20);
    const events = sent.map((m) => m.event);
    for (const name of ['rolling', 'reveal', 'done']) assert.ok(events.includes(name), `${name} が流れない: ${events.join(',')}`);
    assert.ok(sent.some((m) => m.userId === 'demo_taro'));
  } finally {
    await runtime.close();
  }
});

test('AC-4 保存済みに demo_ の人がいても、一覧の API には出さず、保存の中身は変えない', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'gacha-viewers.json');
  const person = (name) => ({ name, free: { used: 1, resetAt: null }, paid: { credits: 2, used: 0 }, history: [] });
  fs.writeFileSync(file, `${JSON.stringify({ demo_taro: person('デモ太郎'), viewer1: person('本物さん') }, null, 2)}\n`);
  const { runtime } = start(dir);
  try {
    const body = await getViewersApi(runtime);
    assert.deepEqual(body.viewers.map((v) => v.userId), ['viewer1']);
  } finally {
    await runtime.close();
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).demo_taro, person('デモ太郎'));
});
