// キー付きギフト1000件を、画面再接続・サーバー再起動・2台移行の途中で流し、
// 画面へちょうど1回ずつ届くことと、コイン・ランキングの一致を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

const root = path.resolve(import.meta.dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TOTAL = 1000;
const USER_COUNT = 4;

const coinFor = (index) => (index % 3) + 1;
const userFor = (index) => `Viewer ${index % USER_COUNT}`;
const keyFor = (index) => `exactly-once-gift-${index}`;

test('キー付きギフト1000件は再接続・再起動・2台移行でもちょうど1回届き集計が一致する', { timeout: 120_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gift-exactly-once-'));
  const dataA = path.join(dir, 'data-a');
  const dataB = path.join(dir, 'data-b');
  const configA = path.join(dir, 'config-a.yaml');
  const configB = path.join(dir, 'config-b.yaml');
  fs.mkdirSync(dataA, { recursive: true });
  fs.copyFileSync(path.join(root, 'config.example.yaml'), configA);
  fs.copyFileSync(path.join(root, 'config.example.yaml'), configB);

  const portA = await freePort();
  const portB = await freePort();
  const serverA = { port: portA, dataDir: dataA, configFile: configA, child: null, errors: '' };
  const serverB = { port: portB, dataDir: dataB, configFile: configB, child: null, errors: '' };
  let client = null;
  let epoch = null;
  let cursor = 0;
  let lastHello = null;
  let lastState = null;
  const received = new Map();
  const deliveries = [];
  const gaps = [];

  async function start(server) {
    const env = {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(server.port),
      TW_DATA: server.dataDir,
      TW_CONFIG: server.configFile,
      TW_HOSTED: '0',
      TW_ADMIN_TOKEN: 'test-only-token',
    };
    server.errors = '';
    server.child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
    server.child.stderr.on('data', (data) => { server.errors += String(data); });
    const base = `http://127.0.0.1:${server.port}`;
    for (let attempt = 0; attempt < 300; attempt++) {
      if (server.child.exitCode != null) throw new Error(`server exited: ${server.errors}`);
      try {
        if ((await fetch(`${base}/healthz`)).ok) return base;
      } catch {}
      await wait(50);
    }
    throw new Error(`server did not start: ${server.errors}`);
  }

  async function stop(server, signal = 'SIGTERM') {
    if (!server.child || server.child.exitCode != null) return;
    const exited = once(server.child, 'exit');
    server.child.kill(signal);
    await exited;
    server.child = null;
  }

  async function connect(port, since = null) {
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
          if (message.gap && since != null) gaps.push({ seq: message.seq, since, port });
          resolve(message);
        }
        if (message.type === 'event' && message.event?.kind === 'gift') {
          const key = message.event.key;
          received.set(key, (received.get(key) ?? 0) + 1);
          deliveries.push({ key, id: message.event.id, replay: message.replay === true, port });
          cursor = Math.max(cursor, message.event.id);
          lastState = message.state;
        }
      });
      socket.once('error', reject);
    });
    await hello;
    return socket;
  }

  async function closeClient() {
    if (!client || client.readyState === WebSocket.CLOSED) return;
    const closed = once(client, 'close');
    client.close();
    await closed;
  }

  async function publish(port, index) {
    const response = await fetch(`http://127.0.0.1:${port}/api/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'gift',
        giftName: 'Exactly once test gift',
        diamonds: coinFor(index),
        count: 1,
        senderName: userFor(index),
        eventId: keyFor(index),
        source: 'tiktok',
      }),
    });
    assert.equal(response.status, 200, `gift ${index}: ${await response.text()}`);
  }

  async function publishBoth(firstPort, secondPort, index) {
    // 2台が重なっている間は、同じキーを必ず同じ順番で両側へ届ける。
    await publish(firstPort, index);
    await publish(secondPort, index);
  }

  async function waitFor(check, label, timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < end) {
      try {
        if (await check()) return;
      } catch (error) {
        lastError = error;
      }
      await wait(20);
    }
    throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`);
  }

  async function waitForCursor(expected, label) {
    await waitFor(() => cursor >= expected, `${label} (cursor=${cursor}, expected=${expected})`);
  }

  async function reconnect(port, expectedSeq, label) {
    await closeClient();
    client = await connect(port, cursor);
    assert.equal(lastHello.gap, false, `${label}: replay gap`);
    await waitForCursor(expectedSeq, label);
  }

  async function status(port) {
    const response = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.equal(response.status, 200);
    return response.json();
  }

  async function expectServerGifts(port, expected, label) {
    await waitFor(async () => (await status(port)).state?.gifts === expected, `${label}: server gifts`);
  }

  try {
    await start(serverA);
    client = await connect(portA);
    epoch = lastHello.epoch;
    assert.equal(cursor, 0);

    // 画面再接続をくり返しながら、最初の180件を片側へ流す。
    for (let i = 0; i < 180; i++) {
      await publish(portA, i);
      if ((i + 1) % 60 === 0) await reconnect(portA, i + 1, `reconnect before ${i + 1}`);
    }
    await waitForCursor(180, 'first 180 gifts');

    // 画面が外れている間に20件ため、SIGKILL で落として再起動する。
    // 500ms の状態保存を待たずに落とすので、先書きしていなければここで抜ける。
    await closeClient();
    for (let i = 180; i < 200; i++) await publish(portA, i);
    await stop(serverA, 'SIGKILL');
    await start(serverA);
    client = await connect(portA, cursor);
    assert.equal(lastHello.epoch, epoch);
    assert.equal(lastHello.gap, false);
    await waitForCursor(200, 'restart replay');

    // 引き続き片側へ流し、450件目までで移行の土台をコピーする。
    for (let i = 200; i < 450; i++) {
      await publish(portA, i);
      if ((i + 1) % 60 === 0) await reconnect(portA, i + 1, `reconnect before migration ${i + 1}`);
    }
    await waitForCursor(450, 'before migration copy');
    fs.cpSync(dataA, dataB, { recursive: true });
    await start(serverB);

    // 2台が同時に受け取る期間。画面はまだ古い側につないだままにする。
    for (let i = 450; i < 530; i++) {
      await publishBoth(portA, portB, i);
      if ((i + 1) % 60 === 0) await reconnect(portA, i + 1, `overlap reconnect ${i + 1}`);
    }
    await waitForCursor(530, 'overlap gifts');

    // 同じキーの再送は、両側とも新しいギフトとして数えてはいけない。
    for (let i = 480; i < 510; i++) await publishBoth(portA, portB, i);
    await wait(250);
    await expectServerGifts(portA, 530, 'old side duplicate resend');
    await expectServerGifts(portB, 530, 'new side duplicate resend');

    // 古い側を止め、画面は新しい側へつなぎ直す。epoch と seq が引き継がれていれば抜けだけ再送される。
    await stop(serverA);
    client = await connect(portB, cursor);
    assert.equal(lastHello.epoch, epoch);
    assert.equal(lastHello.gap, false);
    assert.equal(lastHello.seq, 530);
    await waitForCursor(530, 'migration cutover replay');

    // 新しい側だけへ流す。途中でもう一度再起動し、その間の20件を再送させる。
    for (let i = 530; i < 760; i++) {
      await publish(portB, i);
      if ((i + 1) % 60 === 0) await reconnect(portB, i + 1, `new side reconnect ${i + 1}`);
    }
    await closeClient();
    for (let i = 760; i < 780; i++) await publish(portB, i);
    await stop(serverB, 'SIGKILL');
    await start(serverB);
    client = await connect(portB, cursor);
    assert.equal(lastHello.epoch, epoch);
    assert.equal(lastHello.gap, false);
    await waitForCursor(780, 'second restart replay');

    for (let i = 780; i < TOTAL; i++) {
      await publish(portB, i);
      if ((i + 1) % 60 === 0) await reconnect(portB, i + 1, `final reconnect ${i + 1}`);
    }

    // 移行後の再送でも二重配送にならないことを確かめる。
    for (let i = 900; i < 950; i++) await publish(portB, i);
    await wait(300);
    await waitFor(() => received.size === TOTAL, `received unique gifts (got ${received.size})`);
    await waitForCursor(TOTAL, 'all gifts');
    await expectServerGifts(portB, TOTAL, 'final total');

    const duplicateKeys = [...received.entries()].filter(([, count]) => count !== 1);
    assert.deepEqual(duplicateKeys, [], `duplicate or missing delivery counts; sample deliveries=${JSON.stringify(deliveries.slice(-30))}`);
    assert.deepEqual(gaps, []);

    const finalStatus = await status(portB);
    const expectedCoins = Array.from({ length: TOTAL }, (_, i) => coinFor(i)).reduce((sum, value) => sum + value, 0);
    assert.equal(finalStatus.state.diamonds, expectedCoins);
    assert.equal(finalStatus.state.gifts, TOTAL);
    assert.equal(lastState?.diamonds, expectedCoins);
    assert.equal(lastState?.gifts, TOTAL);

    const expectedByUser = new Map();
    for (let i = 0; i < TOTAL; i++) {
      const user = userFor(i);
      expectedByUser.set(user, (expectedByUser.get(user) ?? 0) + coinFor(i));
    }
    const actualRanking = finalStatus.state.topGifters.map((row) => [row.user.name, row.diamonds]).sort(([a], [b]) => a.localeCompare(b));
    const expectedRanking = [...expectedByUser].sort(([a], [b]) => a.localeCompare(b));
    assert.deepEqual(actualRanking, expectedRanking);

    console.log(JSON.stringify({
      ok: true,
      totalGifts: TOTAL,
      uniqueDelivered: received.size,
      duplicateKeys: duplicateKeys.length,
      replayDeliveries: deliveries.filter((item) => item.replay).length,
      coinTotal: finalStatus.state.diamonds,
      ranking: Object.fromEntries(expectedByUser),
      reconnectGaps: gaps.length,
    }));
  } finally {
    client?.terminate();
    await stop(serverA).catch(() => {});
    await stop(serverB).catch(() => {});
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
