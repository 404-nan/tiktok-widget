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
import { ReplayCursor } from '../public/widgets/lib/replay-cursor.js';

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

test('since 付きで gap を返したら、内部 ID と件数だけを警告に残す', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-replay-gap-log-'));
  const runtime = createRuntime({
    id: 'tenant-internal',
    store: createStore(path.join(dir, 'config.yaml')),
    dataDir: dir,
    mediaDirs: [dir],
  });
  const originalWarn = console.warn;
  const lines = [];
  console.warn = (...args) => lines.push(args.join(' '));
  try {
    runtime.hub.addClient(fakeSocket(), { since: 0, epoch: 'another-process' });
    assert.equal(runtime.hub.replayGapCount, 1);
    assert.deepEqual(lines, ['[replay-gap] tenant=tenant-internal count=1']);
  } finally {
    console.warn = originalWarn;
    await runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('保存時と違う room ID で live になったら、前の配信を再送しない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-live-room-new-'));
  writeSavedLiveState(dir, { roomId: 'room-old' });
  const runtime = makeRuntime(dir);
  try {
    assert.equal(runtime.hub.epoch, 'saved-epoch');
    runtime.hub.setStatus({ mode: 'live', roomId: 'room-new' });
    assert.notEqual(runtime.hub.epoch, 'saved-epoch');
    assert.ok(runtime.hub.seq >= 0, '連番は新しい配信のものだけを数える');
    assert.equal(runtime.hub.replayRing.some((message) => message.event?.key === 'saved-event'), false);
    assert.equal(runtime.hub.state.follows, 0);

    const ws = fakeSocket();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      runtime.hub.addClient(ws, { since: 0, epoch: 'saved-epoch' });
    } finally {
      console.warn = originalWarn;
    }
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
    assert.ok(runtime.hub.seq >= 1);
    assert.equal(runtime.hub.replayRing[0].seq, 1, '前の形の保存ファイルは event.id を seq として読む');
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
        if (Number.isSafeInteger(message.seq)) cursor = Math.max(cursor, message.seq);
        if (message.type === 'event') {
          const key = message.event.key;
          received.set(key, (received.get(key) ?? 0) + 1);
          if (message.replay) replayed.add(key);
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
    assert.ok(lastHello.seq >= 1010, '連番は生の出来事と派生の知らせを合わせて進む');
    await waitForReceived(1010);
    for (let i = 1010; i < 1015; i++) await publish(base, i);
    await waitForReceived(1015);

    client.close();
    await once(client, 'close');
    client = await connect(base, cursor);
    assert.ok(lastHello.seq >= 1015, '追加送信ぶんも同じ連番で進む');
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
    assert.equal(saved.hub.seq, lastHello.seq);
    assert.equal(saved.hub.epoch, epoch);
  } finally {
    client?.terminate();
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('派生の知らせもライブ状態へ保存し、再起動後に seq つきで再送する', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-live-derived-replay-'));
  let runtime = makeRuntime(dir);
  try {
    runtime.hub.publish({ kind: 'follow', eventId: 'before-derived' });
    runtime.hub.broadcast({ type: 'combo', combo: { active: [], last: null }, event: { id: 'combo-missed', kind: 'hit' } });
    const comboSeq = runtime.hub.replayRing.find((message) => message.type === 'combo')?.seq;
    assert.ok(Number.isSafeInteger(comboSeq));
    await runtime.close();

    runtime = makeRuntime(dir);
    const restored = runtime.hub.replayRing.find((message) => message.type === 'combo');
    assert.equal(restored?.seq, comboSeq);

    const ws = fakeSocket();
    runtime.hub.addClient(ws, { since: comboSeq - 1, epoch: runtime.hub.epoch });
    const replayed = ws.sent.filter((message) => message.type === 'combo');
    assert.equal(replayed.length, 1);
    assert.equal(replayed[0].seq, comboSeq);
    assert.equal(replayed[0].replay, true);
  } finally {
    await runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('画面役は切断を繰り返しても派生の知らせをちょうど1回ずつ受ける', { timeout: 60_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-derived-exactly-once-'));
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
  let monitor;
  let screen;
  const watched = new Set(['combo', 'stepup', 'swarm']);
  const monitorSeen = new Map();
  const screenSeen = new Map();
  const cursor = new ReplayCursor();
  let randomSeed = 42;
  const random = () => {
    randomSeed = (randomSeed * 1103515245 + 12345) >>> 0;
    return randomSeed / 0x100000000;
  };

  function remember(map, message) {
    if (!watched.has(message.type) || !Number.isSafeInteger(message.seq)) return;
    const key = `${message.type}:${message.seq}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

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

  async function connectMonitor(base) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const opened = new Promise((resolve, reject) => {
      socket.on('message', (raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === 'hello') resolve();
        remember(monitorSeen, message);
      });
      socket.once('error', reject);
    });
    await opened;
    return socket;
  }

  async function connectScreen(base) {
    const params = new URLSearchParams();
    if (cursor.epoch && cursor.lastSeq != null) {
      params.set('since', String(cursor.lastSeq));
      params.set('epoch', cursor.epoch);
    }
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws${params.size ? `?${params}` : ''}`);
    const opened = new Promise((resolve, reject) => {
      socket.on('message', (raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === 'hello') {
          cursor.hello(message);
          resolve();
          return;
        }
        if (!cursor.accept(message)) return;
        remember(screenSeen, message);
      });
      socket.once('error', reject);
    });
    await opened;
    return socket;
  }

  async function closeScreen() {
    if (!screen || screen.readyState === WebSocket.CLOSED) return;
    const closed = once(screen, 'close');
    screen.close();
    await closed;
  }

  async function publish(base, index) {
    const response = await fetch(`${base}/api/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'gift',
        giftName: 'Replay test gift',
        diamonds: 5,
        count: 1,
        senderName: 'Replay viewer',
        eventId: `derived-${index}`,
      }),
    });
    assert.equal(response.status, 200);
  }

  async function stop() {
    if (!child || child.exitCode != null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }

  try {
    const base = await start();
    monitor = await connectMonitor(base);
    screen = await connectScreen(base);
    let connected = true;
    let untilDisconnect = 5 + Math.floor(random() * 8);
    let disconnectedFor = 0;
    for (let i = 0; i < 300; i++) {
      await publish(base, i);
      if (connected) {
        untilDisconnect -= 1;
        if (untilDisconnect === 0) {
          await closeScreen();
          connected = false;
          disconnectedFor = 2 + Math.floor(random() * 5);
        }
      } else {
        disconnectedFor -= 1;
        if (disconnectedFor === 0) {
          screen = await connectScreen(base);
          connected = true;
          untilDisconnect = 5 + Math.floor(random() * 8);
        }
      }
      if (i % 25 === 0) await wait(5);
    }
    if (!connected) screen = await connectScreen(base);
    await wait(300);

    for (const type of watched) {
      assert.ok([...monitorSeen.keys()].some((key) => key.startsWith(`${type}:`)), `${type} が出ている`);
    }
    assert.deepEqual([...monitorSeen.entries()].filter(([, count]) => count !== 1), [], '基準側が重複なく受ける');
    assert.deepEqual([...screenSeen.entries()].filter(([, count]) => count !== 1), [], '画面役が同じ seq を重複して受けない');
    assert.deepEqual([...screenSeen.keys()].sort((a, b) => a - b), [...monitorSeen.keys()].sort((a, b) => a - b), '画面役が受けた派生の知らせはサーバーが出したものと一致する');
  } finally {
    screen?.terminate();
    monitor?.terminate();
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
