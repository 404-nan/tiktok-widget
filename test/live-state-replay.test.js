// 一時サーバーでイベント再送、SIGTERM 保存、再起動後の復元を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { emptyState } from '../src/hub.js';

const root = path.resolve(import.meta.dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function writeSavedLiveState(dir, { roomId, epoch = 'saved-epoch' }) {
  const state = emptyState();
  state.follows = 1;
  const message = {
    type: 'event',
    event: { id: 1, kind: 'follow', key: 'saved-event', ts: 1 },
    state,
  };
  fs.writeFileSync(path.join(dir, 'live-state.json'), JSON.stringify({
    hub: {
      state,
      gifters: [],
      likers: [],
      recentChats: [],
      seq: 1,
      epoch,
      replayRing: [message],
    },
    status: { roomId },
  }));
}

function fakeSocket() {
  const sent = [];
  return {
    readyState: 1,
    sent,
    role: 'obs',
    send(text) { sent.push(JSON.parse(text)); },
    on() {},
  };
}

function makeRuntime(dir) {
  return createRuntime({
    id: 'room-check',
    store: createStore(path.join(dir, 'config.yaml')),
    dataDir: dir,
    mediaDirs: [dir],
  });
}

test('保存時と違う room ID で live になったら、前の配信を再送しない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-live-room-new-'));
  writeSavedLiveState(dir, { roomId: 'room-old' });
  const runtime = makeRuntime(dir);
  try {
    assert.equal(runtime.hub.epoch, 'saved-epoch');
    runtime.hub.setStatus({ mode: 'live', roomId: 'room-new' });
    assert.notEqual(runtime.hub.epoch, 'saved-epoch');
    assert.equal(runtime.hub.seq, 0);
    assert.deepEqual(runtime.hub.replayRing, []);
    assert.equal(runtime.hub.state.follows, 0);

    const ws = fakeSocket();
    runtime.hub.addClient(ws, { since: 0, epoch: 'saved-epoch' });
    assert.equal(ws.sent[0].gap, true);
    assert.deepEqual(ws.sent.filter((message) => message.type === 'event'), []);
  } finally {
    await runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('保存時と同じ room ID で live になったら、続きから再送する', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-live-room-same-'));
  writeSavedLiveState(dir, { roomId: 'room-same' });
  const runtime = makeRuntime(dir);
  try {
    runtime.hub.setStatus({ mode: 'live', roomId: 'room-same' });
    assert.equal(runtime.hub.epoch, 'saved-epoch');
    assert.equal(runtime.hub.seq, 1);
    assert.equal(runtime.hub.replayRing.length, 1);
    assert.equal(runtime.hub.state.follows, 1);

    const ws = fakeSocket();
    runtime.hub.addClient(ws, { since: 0, epoch: 'saved-epoch' });
    assert.equal(ws.sent[0].gap, false);
    const replayed = ws.sent.filter((message) => message.type === 'event');
    assert.equal(replayed.length, 1);
    assert.equal(replayed[0].event.key, 'saved-event');
    assert.equal(replayed[0].replay, true);
  } finally {
    await runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('実サーバーは1000件を再送し、SIGTERM 後も集計・seq・epoch を復元する', { timeout: 60_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-live-state-'));
  const dataDir = path.join(dir, 'data');
  const configFile = path.join(dir, 'config.yaml');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(path.join(root, 'config.example.yaml'), configFile);
  const port = await freePort();
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    TW_DATA: dataDir,
    TW_CONFIG: configFile,
    TW_HOSTED: '0',
    TW_ADMIN_TOKEN: 'test-only-token',
  };
  let child;
  let client;
  const received = new Map();
  const replayed = new Set();
  let epoch;
  let cursor = 0;
  let lastHello;

  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', (data) => { errors += String(data); });
    const base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 300; attempt++) {
      if (child.exitCode != null) throw new Error(`server exited: ${errors}`);
      try {
        if ((await fetch(`${base}/healthz`)).ok) return base;
      } catch {}
      await wait(50);
    }
    throw new Error(`server did not start: ${errors}`);
  }

  async function connect(base, since = null) {
    const params = new URLSearchParams();
    if (since != null && epoch) {
      params.set('since', String(since));
      params.set('epoch', epoch);
    }
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws${params.size ? `?${params}` : ''}`);
    const hello = new Promise((resolve, reject) => {
      socket.on('message', (raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === 'hello') {
          lastHello = message;
          resolve(message);
        }
        if (message.type === 'event') {
          const key = message.event.key;
          received.set(key, (received.get(key) ?? 0) + 1);
          if (message.replay) replayed.add(key);
          cursor = Math.max(cursor, message.event.id);
        }
      });
      socket.once('error', reject);
    });
    await hello;
    return socket;
  }

  async function publish(base, index) {
    const response = await fetch(`${base}/api/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'gift',
        giftName: 'Replay test gift',
        diamonds: index % 3 + 1,
        count: 1,
        senderName: `Viewer ${index % 4}`,
        eventId: `gift-${index}`,
      }),
    });
    assert.equal(response.status, 200);
  }

  async function waitForReceived(count) {
    for (let attempt = 0; attempt < 500 && received.size < count; attempt++) await wait(10);
    assert.equal(received.size, count);
  }

  async function stop() {
    if (!child || child.exitCode != null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }

  try {
    let base = await start();
    client = await connect(base);
    epoch = lastHello.epoch;
    cursor = lastHello.seq;
    for (let startAt = 0; startAt < 1000; startAt += 50) {
      if (startAt > 0) {
        client.close();
        await once(client, 'close');
      }
      for (let i = startAt; i < startAt + 50; i++) await publish(base, i);
      if (startAt > 0) client = await connect(base, cursor);
      await waitForReceived(startAt + 50);
    }
    assert.equal(received.size, 1000);
    assert.ok([...received.values()].every((count) => count === 1));
    assert.ok(replayed.size > 0);

    client.close();
    await once(client, 'close');
    for (let i = 1000; i < 1010; i++) await publish(base, i);
    await stop();

    base = await start();
    client = await connect(base, cursor);
    assert.equal(lastHello.epoch, epoch);
    assert.equal(lastHello.seq, 1010);
    await waitForReceived(1010);
    for (let i = 1010; i < 1015; i++) await publish(base, i);
    await waitForReceived(1015);

    client.close();
    await once(client, 'close');
    client = await connect(base, cursor);
    assert.equal(lastHello.seq, 1015);
    assert.deepEqual([...received.values()].filter((count) => count !== 1), []);
    const expectedCoins = Array.from({ length: 1015 }, (_, i) => i % 3 + 1).reduce((sum, value) => sum + value, 0);
    assert.equal(lastHello.state.diamonds, expectedCoins);
    assert.equal(lastHello.state.gifts, 1015);
    const expectedByUser = new Map();
    for (let i = 0; i < 1015; i++) {
      const user = `Viewer ${i % 4}`;
      expectedByUser.set(user, (expectedByUser.get(user) ?? 0) + i % 3 + 1);
    }
    const actualRanking = lastHello.state.topGifters.map((row) => [row.user.name, row.diamonds]).sort(([a], [b]) => a.localeCompare(b));
    const expectedRanking = [...expectedByUser].sort(([a], [b]) => a.localeCompare(b));
    assert.deepEqual(actualRanking, expectedRanking);

    client.terminate();
    await stop();
    const stateFile = path.join(dataDir, 'live-state.json');
    assert.equal(fs.statSync(stateFile).mode & 0o777, 0o600);
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(saved.hub.seq, 1015);
    assert.equal(saved.hub.epoch, epoch);
  } finally {
    client?.terminate();
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
