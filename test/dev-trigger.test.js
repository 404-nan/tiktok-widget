import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function listen(runtime, role) {
  const app = express();
  app.use(express.json());
  if (role) app.use((req, _res, next) => { req.role = role; next(); });
  app.use(runtime.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function close(server, runtime) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await runtime.close();
}

test('開発用トリガーは本番で 403、開発ではボス・ガチャ・動作が動く', async () => {
  const dir = tmp('tw-dev-trigger-');
  const runtime = createRuntime({ id: 'test', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  const before = process.env.TW_ENV;
  const post = (body) => fetch(`http://127.0.0.1:${port}/api/dev/trigger`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  try {
    delete process.env.TW_ENV;
    const denied = await post({ target: 'gacha' });
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /テスト送信は開発環境でだけ使えます/);
    process.env.TW_ENV = 'dev';
    const gacha = await post({ target: 'gacha' });
    assert.equal(gacha.status, 200);
    const gachaBody = await gacha.json();
    assert.equal(gachaBody.gacha.phase, 'rolling');
    const state = await fetch(`http://127.0.0.1:${port}/api/gacha`);
    assert.equal(state.status, 200);
    assert.equal((await state.json()).phase, 'rolling');
    const damage = await post({ target: 'boss', action: 'damage', id: 'default', amount: 100 });
    assert.equal(damage.status, 200);
    assert.equal((await damage.json()).boss.default.hp, 9900);
    const heal = await post({ target: 'boss', action: 'heal', id: 'default', amount: 40 });
    assert.equal(heal.status, 200);
    assert.equal((await heal.json()).boss.default.hp, 9940);
    const action = await post({ target: 'roulette-action', actions: [{ type: 'wins.add', id: 'default', n: 1 }] });
    assert.equal(action.status, 200);
    const bad = await post({ target: 'media', mediaId: 'missing' });
    assert.equal(bad.status, 400);
  } finally {
    if (before === undefined) delete process.env.TW_ENV;
    else process.env.TW_ENV = before;
    await close(server, runtime);
  }
});

test('メディアのアップロード・再生・確認と、OBS は読む・ack だけ', async () => {
  const dir = tmp('tw-dev-media-');
  const runtime = createRuntime({ id: 'test', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  const before = process.env.TW_ENV;
  try {
    process.env.TW_ENV = 'dev';
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const uploaded = await fetch(`http://127.0.0.1:${port}/api/media-alerts?name=花.png`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: png,
    });
    assert.equal(uploaded.status, 200);
    const item = (await uploaded.json()).item;
    assert.equal(item.kind, 'image');
    const played = await fetch(`http://127.0.0.1:${port}/api/dev/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'media', mediaId: item.id }),
    });
    assert.equal(played.status, 200);
    const token = (await played.json()).media.token;
    const file = await fetch(`http://127.0.0.1:${port}/api/media-alerts/${item.id}/file`);
    assert.equal(file.status, 200);
    assert.equal(Buffer.from(await file.arrayBuffer()).equals(png), true);
    const acked = await fetch(`http://127.0.0.1:${port}/api/media-alerts/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal((await acked.json()).ok, true);
    const removed = await fetch(`http://127.0.0.1:${port}/api/media-alerts/${item.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
  } finally {
    if (before === undefined) delete process.env.TW_ENV;
    else process.env.TW_ENV = before;
    await close(server, runtime);
  }

  const obsRuntime = createRuntime({ id: 'obs', store: createStore(path.join(dir, 'obs.yaml')), dataDir: path.join(dir, 'obs'), mediaDirs: [dir] });
  const obs = await listen(obsRuntime, 'obs');
  try {
    assert.equal((await fetch(`http://127.0.0.1:${obs.port}/api/gacha`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${obs.port}/api/media-alerts`)).status, 200);
    const ack = await fetch(`http://127.0.0.1:${obs.port}/api/media-alerts/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'none' }),
    });
    assert.equal(ack.status, 200);
    const denied = await fetch(`http://127.0.0.1:${obs.port}/api/dev/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'gacha' }),
    });
    assert.equal(denied.status, 403);
    const del = await fetch(`http://127.0.0.1:${obs.port}/api/media-alerts/abcdefabcdefabcd`, { method: 'DELETE' });
    assert.equal(del.status, 403);
  } finally {
    await close(obs.server, obsRuntime);
  }
});
