// P3 の重ね引き継ぎを、実サーバー2つと配信者モードの管理APIで確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { Hub } from '../src/hub.js';

const root = path.resolve(import.meta.dirname, '..');
const TOKEN = 'handoff-test-token';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('P3: 2台の引き継ぎで1000件のギフトが画面にちょうど1回届き、集計が一致する', { timeout: 90_000 }, async () => {
  let old = await startServer('old');
  let green = null;
  const screen = new Screen();
  const expected = new Map();
  const addExpected = (key, n) => {
    if (!expected.has(key)) expected.set(key, { diamonds: n % 3 + 1, user: `Viewer ${n % 4}` });
  };

  try {
    await screen.connect(old.baseUrl);
    const epoch = screen.epoch;

    // 引き継ぎ前は古い側が普通に適用し、画面へ届く。
    for (let i = 0; i < 400; i++) addExpected(`pre-${i}`, i);
    await publishMany([...expected.values()].map((spec, i) => ({ server: old, key: `pre-${i}`, n: i })));
    await screen.waitForKeyCount(400);
    assert.equal(screen.cursor, 400);

    // P2 で古い側を落として起こし直しても、集計・seq・epoch と直近の key が残る。
    old = await old.restart();
    await screen.connect(old.baseUrl, { epoch, since: screen.cursor });
    assert.equal(screen.hello.gap, false);
    assert.equal(screen.received.size, 400);

    green = await startServer('green', {
      TW_HANDOFF_FROM: old.baseUrl,
      TW_HANDOFF_TOKEN: TOKEN,
      TW_HANDOFF_SETTLE_MS: '0',
    });

    // 新しい側の準備中に届いた分は、いったんためて引き継ぎ後に適用する。
    const earlyNew = [];
    for (let i = 0; i < 25; i++) {
      const n = 700 + i;
      const key = `new-${i}`;
      addExpected(key, n);
      earlyNew.push({ server: green, key, n });
    }
    await publishMany(earlyNew);
    await waitForTargetReady(green);

    const begin = await postJson(`${old.baseUrl}/admin/api/handoff/begin`, {}, adminHeaders());
    assert.equal(begin.status, 200);
    assert.equal(begin.body.local.lastSeq, 400);
    assert.equal(begin.body.local.snapshot.hub.state.gifts, 400);
    assert.ok(begin.body.local.appliedKeys.includes('pre-0'), '直近10分に適用した key を返す');

    const beforeOverlap = await readJson(`${old.baseUrl}/api/status`);
    assert.equal(beforeOverlap.state.gifts, 400, 'begin 後の古い側は集計を止める');

    // 古い側だけ・新しい側だけ・両方に届く出来事を、速い連打で混ぜる。
    const overlap = [];
    for (let i = 0; i < 150; i++) {
      const n = 400 + i;
      const key = `both-${i}`;
      addExpected(key, n);
      overlap.push({ server: old, key, n }, { server: green, key, n });
    }
    for (let i = 0; i < 150; i++) {
      const n = 550 + i;
      const key = `old-${i}`;
      addExpected(key, n);
      overlap.push({ server: old, key, n });
    }
    for (let i = 25; i < 100; i++) {
      const n = 700 + i;
      const key = `new-${i}`;
      addExpected(key, n);
      overlap.push({ server: green, key, n });
    }
    overlap.push({ server: green, key: 'pre-0', n: 0 }); // begin 前に古い側が適用済み。新しい側では重複にする
    await publishMany(overlap);
    await waitForGifts(green, 800);

    const oldAfterOverlap = await readJson(`${old.baseUrl}/api/status`);
    assert.equal(oldAfterOverlap.state.gifts, 400, '古い側は stream へ流すだけで適用しない');

    const finish = await postJson(`${old.baseUrl}/admin/api/handoff/finish`, {}, adminHeaders());
    assert.equal(finish.status, 200);
    assert.equal(finish.body.ok, true);
    assert.ok(finish.body.movedClients >= 1);
    await screen.waitForMoved();

    // 経路が新しい側へ切り替わったあとの画面再接続を、同じ epoch/cursor で再現する。
    await screen.connect(green.baseUrl, { epoch, since: screen.cursor });
    assert.equal(screen.hello.gap, false, '切替で取りこせないほど古い隙間ができない');
    await screen.waitForKeyCount(800);

    for (let i = 0; i < 200; i++) {
      const n = 800 + i;
      addExpected(`post-${i}`, n);
    }
    await publishMany(Array.from({ length: 200 }, (_, i) => ({ server: green, key: `post-${i}`, n: 800 + i })));
    await screen.waitForKeyCount(1000);

    assert.equal(expected.size, 1000);
    assert.deepEqual([...screen.received.keys()].sort(), [...expected.keys()].sort());
    assert.deepEqual([...screen.received.entries()].filter(([, count]) => count !== 1), []);

    const finalStatus = await readJson(`${green.baseUrl}/api/status`);
    const expectedCoins = [...expected.values()].reduce((sum, spec) => sum + spec.diamonds, 0);
    assert.equal(finalStatus.state.gifts, 1000);
    assert.equal(finalStatus.state.diamonds, expectedCoins);
    const expectedByUser = new Map();
    for (const spec of expected.values()) expectedByUser.set(spec.user, (expectedByUser.get(spec.user) ?? 0) + spec.diamonds);
    const actualRanking = finalStatus.state.topGifters.map((row) => [row.user.name, row.diamonds]).sort(([a], [b]) => a.localeCompare(b));
    const expectedRanking = [...expectedByUser].sort(([a], [b]) => a.localeCompare(b));
    assert.deepEqual(actualRanking, expectedRanking);
  } finally {
    screen.close();
    await Promise.all([old.stop(), green?.stop()]);
  }
});

test('P3: 配信者モードの begin は全配信者を返し、後から作った runtime もためる', { timeout: 30_000 }, async () => {
  const server = await startServer('hosted', { TW_HOSTED: '1' });
  let stream = null;
  try {
    const denied = await postJson(`${server.baseUrl}/admin/api/handoff/begin`, {});
    assert.equal(denied.status, 401, '管理合言葉なしでは始められない');

    const created = await postJson(`${server.baseUrl}/admin/api/tenants`, { name: '引継テスト' }, adminHeaders());
    assert.equal(created.status, 200);
    const tenant = created.body.tenant;
    const ownerKey = new URL(tenant.urls.dashboard).pathname.split('/')[2];
    assert.ok(ownerKey);

    const begin = await postJson(`${server.baseUrl}/admin/api/handoff/begin`, {}, adminHeaders());
    assert.equal(begin.status, 200);
    assert.equal(begin.body.ok, true);
    assert.ok(begin.body.tenants[tenant.id], 'begin の応答に全配信者が入る');
    assert.equal(begin.body.tenants[tenant.id].lastSeq, 0);

    stream = await openHandoffStream(server.baseUrl);
    const messages = [];
    stream.on('message', (raw) => messages.push(JSON.parse(String(raw))));
    await once(stream, 'open');
    await waitFor(() => messages.some((message) => message.type === 'catchup'), 'handoff stream catchup');
    const sent = await postJson(`${server.baseUrl}/t/${ownerKey}/api/simulate`, giftBody({ key: 'tenant-after-begin-1', n: 1 }));
    assert.equal(sent.status, 200);
    await waitFor(() => messages.some((message) => message.type === 'event' && message.tenant === tenant.id && message.key === 'tenant-after-begin-1'), 'tenant event stream');

    const status = await readJson(`${server.baseUrl}/t/${ownerKey}/api/status`);
    assert.equal(status.state.gifts, 0, 'begin 後に作られた配信者 runtime も適用しない');
  } finally {
    stream?.close();
    await server.stop();
  }
});



test('P3: Hub の intercept は集計・再送・購読側へ届けず、bypass では key を記録する', () => {
  const hub = new Hub();
  const heard = [];
  hub.on('event', (event) => heard.push(event));
  hub.on('testEvent', (event) => heard.push(event));
  hub.setPublishInterceptor(() => true);
  assert.equal(hub.publish({ kind: 'gift', user: { id: 'u', name: 'u' }, gift: { id: 'g', name: 'g', diamonds: 1, count: 1 }, totalDiamonds: 1, eventId: 'held-1' }), false);
  assert.equal(hub.seq, 0);
  assert.equal(hub.state.gifts, 0);
  assert.equal(hub.replayRing.length, 0);
  assert.deepEqual(heard, []);

  assert.equal(hub.publish({ kind: 'gift', user: { id: 'u', name: 'u' }, gift: { id: 'g', name: 'g', diamonds: 1, count: 1 }, totalDiamonds: 1, eventId: 'held-1' }, { bypassInterceptor: true }), true);
  assert.equal(hub.seq, 1);
  assert.equal(hub.state.gifts, 1);
  assert.ok(hub.appliedKeysSince(Date.now() - 60_000).includes('held-1'));
});

test('P3: moved を受けたウィジェットは同じURLへすぐつなぎ直す', () => {
  const overlay = fs.readFileSync(path.join(root, 'public/widgets/lib/overlay.js'), 'utf8');
  assert.match(overlay, /msg\.type === 'moved'/);
  assert.match(overlay, /moved \? 0 : reconnectDelay/);
  const replaySocket = fs.readFileSync(path.join(root, 'public/widgets/lib/replay-socket.js'), 'utf8');
  assert.match(replaySocket, /message\.type === 'moved'/);
  assert.match(replaySocket, /moved \? 0 : delay/);
});

class Screen {
  constructor() {
    this.received = new Map();
    this.cursor = 0;
    this.epoch = null;
    this.hello = null;
    this.moved = [];
    this.ws = null;
    this.notify = null;
  }

  async connect(baseUrl, { epoch = null, since = null } = {}) {
    this.close();
    const params = new URLSearchParams();
    if (epoch && since != null) {
      params.set('epoch', epoch);
      params.set('since', String(since));
    }
    const url = `${baseUrl.replace(/^http/, 'ws')}/ws${params.size ? `?${params}` : ''}`;
    this.ws = new WebSocket(url);
    const opened = new Promise((resolve, reject) => {
      this.ws.once('error', reject);
      const onMessage = (raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === 'hello') {
          this.hello = message;
          this.epoch = message.epoch;
          resolve();
        }
      };
      this.ws.on('message', onMessage);
    });
    this.ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'event' && message.event?.key) {
        this.received.set(message.event.key, (this.received.get(message.event.key) ?? 0) + 1);
        this.cursor = Math.max(this.cursor, message.event.id);
        this.notify?.();
      }
      if (message.type === 'moved') {
        this.moved.push(message);
        this.notify?.();
      }
    });
    await opened;
  }

  async waitForKeyCount(count) {
    await waitFor(() => this.received.size >= count, `${count} screen events`);
  }

  async waitForMoved() {
    await waitFor(() => this.moved.length > 0, 'moved message');
  }

  close() {
    if (!this.ws) return;
    try { this.ws.terminate(); } catch {}
    this.ws = null;
  }
}

async function startServer(name, extraEnv = {}, existing = null) {
  const tempRoot = existing?.tempRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), `tw-handoff-${name}-`));
  const dataDir = existing?.dataDir ?? path.join(tempRoot, 'data');
  const configFile = existing?.configFile ?? path.join(tempRoot, 'config.yaml');
  fs.mkdirSync(dataDir, { recursive: true });
  if (!existing) fs.copyFileSync(path.join(root, 'config.example.yaml'), configFile);
  const port = await freePort();
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    TW_DATA: dataDir,
    TW_CONFIG: configFile,
    TW_HOSTED: '0',
    TW_ADMIN_TOKEN: TOKEN,
    TW_RENTAL_AUTOCONNECT: '0',
    TW_RESUME_CONNECT: '0',
    ...extraEnv,
  };
  for (const key of ['TIKTOK_USERNAME', 'TW_VAULT']) delete env[key];
  if (!extraEnv.TW_HANDOFF_FROM) delete env.TW_HANDOFF_FROM;
  if (!extraEnv.TW_HANDOFF_TOKEN) delete env.TW_HANDOFF_TOKEN;
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += String(data); });
  child.stderr.on('data', (data) => { output += String(data); });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => {
      try { return (await fetch(`${baseUrl}/healthz`)).ok; } catch { return false; }
    }, `${name} server start`);
  } catch (error) {
    child.kill();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(`${error.message}\n${output}`);
  }
  const server = {
    baseUrl,
    port,
    dataDir,
    tempRoot,
    configFile,
    output: () => output,
    async restart() {
      await server.stop({ keep: true });
      return startServer(name, extraEnv, { tempRoot, dataDir, configFile });
    },
    async stop({ keep = false } = {}) {
      if (child.exitCode == null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await Promise.race([exited, wait(2_000).then(() => child.kill())]);
      }
      if (!keep) fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
  return server;
}

function giftBody({ key, n }) {
  return {
    kind: 'gift',
    giftName: 'Handoff test gift',
    diamonds: n % 3 + 1,
    count: 1,
    senderName: `Viewer ${n % 4}`,
    eventId: key,
  };
}

async function publishMany(items) {
  for (let at = 0; at < items.length; at += 20) {
    await Promise.all(items.slice(at, at + 20).map(async ({ server, key, n }) => {
      const response = await postJson(`${server.baseUrl}/api/simulate`, giftBody({ key, n }));
      assert.equal(response.status, 200, `${key}: ${JSON.stringify(response.body)}`);
    }));
  }
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function readJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  return response.json();
}

function adminHeaders() {
  return { 'x-admin-token': TOKEN };
}

async function waitForGifts(server, count) {
  await waitFor(async () => {
    try {
      const status = await readJson(`${server.baseUrl}/api/status`);
      return status.state.gifts >= count;
    } catch {
      return false;
    }
  }, `${count} applied gifts`);
}

async function waitForTargetReady(server) {
  let last = null;
  await waitFor(async () => {
    try {
      const status = await readJson(`${server.baseUrl}/admin/api/handoff/status`, adminHeaders());
      last = status;
      if (status.target?.state === 'error') throw new Error(`handoff target error: ${status.target.error}`);
      return status.target?.state === 'ready';
    } catch (error) {
      if (error.message?.startsWith('handoff target error')) throw error;
      return false;
    }
  }, 'handoff target ready');
  return last;
}

async function openHandoffStream(baseUrl) {
  const url = `${baseUrl.replace(/^http/, 'ws')}/admin/api/handoff/stream`;
  return new WebSocket(url, { headers: adminHeaders() });
}

async function waitFor(condition, label, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await condition()) return;
    await wait(25);
  }
  throw new Error(`timed out: ${label}`);
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
