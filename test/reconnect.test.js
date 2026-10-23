import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { ControlEvent } from 'tiktok-live-connector';
import { TikTokSource } from '../src/tiktok.js';
import { createRuntime } from '../src/runtime.js';
import { createStore } from '../src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WATCHDOG_MS = 3 * 60 * 1000;

// 擬似タイマーはプロセス全体で1つ。テストが重ならないように順番に実行する
let tail = Promise.resolve();
function serial(name, fn) {
  test(name, async (t) => {
    const gate = tail;
    let open;
    tail = new Promise((resolve) => { open = resolve; });
    await gate;
    try {
      await fn(t);
    } finally {
      open();
    }
  });
}

async function flush() {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
}

function fakeHub() {
  return {
    status: { mode: 'idle', username: null, message: '' },
    setStatus(patch) { this.status = { ...this.status, ...patch }; },
    publish() {},
  };
}

// fail 回までは「配信前」、その次からつながる
function installation({ fail = 0 } = {}) {
  const conns = [];
  const usernames = [];
  let n = 0;
  const createConnection = (username) => {
    usernames.push(username);
    const conn = new EventEmitter();
    const attempt = ++n;
    conn.closed = false;
    conn.connect = () => (
      attempt <= fail
        ? Promise.reject(new Error("The user isn't online"))
        : Promise.resolve({ roomId: `room-${attempt}` })
    );
    conn.disconnect = () => {
      conn.closed = true;
      return Promise.resolve();
    };
    conns.push(conn);
    return conn;
  };
  return { conns, usernames, createConnection };
}

async function withTimers(t, fn) {
  const logs = [];
  const origLog = console.log;
  const origRandom = Math.random;
  console.log = (...args) => logs.push(args.join(' '));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await fn(logs);
  } finally {
    console.log = origLog;
    Math.random = origRandom;
    t.mock.timers.reset();
  }
}

function scheduledSeconds(logs) {
  return logs
    .filter((line) => line.includes('秒後に再接続します'))
    .map((line) => Number(line.match(/(\d+(?:\.\d+)?)秒後/)[1]));
}

serial('切断されると再接続し、つながったら待ちを最初に戻す', async (t) => {
  await withTimers(t, async (logs) => {
    const box = installation();
    const hub = fakeHub();
    const src = new TikTokSource(hub, null, { createConnection: box.createConnection, jitter: 0 });
    await src.connect('@live_user');
    assert.deepEqual(box.usernames, ['live_user']);
    assert.equal(hub.status.mode, 'live');
    assert.match(logs.join('\n'), /@live_user に接続します/);
    assert.match(logs.join('\n'), /接続しました（room room-1）/);

    box.conns[0].emit(ControlEvent.DISCONNECTED, { code: 1006, reason: 'socket hang up' });
    const text = logs.join('\n');
    assert.match(text, /切断しました（socket hang up（1006））/);
    assert.match(text, /socket hang up（1006） → 5秒後に再接続します（1回目）/);
    assert.equal(src.stay, true);
    assert.equal(box.conns.length, 1);

    t.mock.timers.tick(5_000);
    await flush();
    assert.equal(box.conns.length, 2);
    assert.equal(hub.status.mode, 'live');
    assert.match(logs.join('\n'), /@live_user に再接続します（socket hang up（1006））/);
    assert.match(logs.join('\n'), /接続しました（room room-2）/);

    box.conns[1].emit(ControlEvent.DISCONNECTED, 'again');
    assert.equal(scheduledSeconds(logs).at(-1), 5);
    assert.match(logs.at(-1), /1回目/);
    await src.disconnect();
  });
});

serial('disconnect() は予約した再接続と監視を止める', async (t) => {
  await withTimers(t, async (logs) => {
    const seen = [];
    const orig = global.setTimeout;
    global.setTimeout = (fn, ms, ...rest) => {
      const timer = orig(fn, ms, ...rest);
      const mark = { ms, unrefed: false };
      const unref = timer.unref?.bind(timer);
      timer.unref = () => {
        mark.unrefed = true;
        return unref ? unref() : timer;
      };
      seen.push(mark);
      return timer;
    };
    const box = installation();
    const hub = fakeHub();
    const src = new TikTokSource(hub, null, { createConnection: box.createConnection, jitter: 0 });
    try {
      await src.connect('live_user');
      assert.ok(seen.some((timer) => timer.ms === WATCHDOG_MS && timer.unrefed));
      box.conns[0].emit(ControlEvent.DISCONNECTED, { reason: 'bye' });
      assert.ok(seen.some((timer) => timer.ms === 5_000 && timer.unrefed));
      assert.equal(src.stay, true);
      await src.disconnect();
      assert.equal(src.stay, false);
      assert.match(logs.join('\n'), /切断しました（手動）/);
      t.mock.timers.tick(WATCHDOG_MS + 60_000);
      await flush();
      assert.equal(box.conns.length, 1);
      box.conns[0].emit(ControlEvent.DISCONNECTED, 'late');
      t.mock.timers.tick(60_000);
      await flush();
      assert.equal(box.conns.length, 1);
    } finally {
      await src.disconnect().catch(() => {});
    }
  });
});

serial('イベントが3分来ないと切り直す。イベントが来ればやり直し', async (t) => {
  await withTimers(t, async (logs) => {
    const box = installation();
    const hub = fakeHub();
    const src = new TikTokSource(hub, null, { createConnection: box.createConnection, jitter: 0 });
    await src.connect('quiet');
    const fired = () => logs.some((line) => line.includes('イベントが3分来ない'));

    t.mock.timers.tick(WATCHDOG_MS - 1);
    await flush();
    assert.equal(fired(), false);
    assert.equal(box.conns.length, 1);

    box.conns[0].emit('ping');
    t.mock.timers.tick(WATCHDOG_MS - 1);
    await flush();
    assert.equal(fired(), false);
    assert.equal(box.conns.length, 1);

    t.mock.timers.tick(1);
    await flush();
    assert.equal(fired(), true);
    assert.match(logs.join('\n'), /切断しました（イベントが3分来ない）/);
    assert.match(logs.join('\n'), /イベントが3分来ない → 5秒後に再接続します/);
    assert.equal(box.conns[0].closed, true);
    assert.equal(box.conns.length, 1);

    t.mock.timers.tick(5_000);
    await flush();
    assert.equal(box.conns.length, 2);
    assert.equal(hub.status.mode, 'live');
    assert.equal(src.stay, true);
    await src.disconnect();
  });
});

serial('配信前の失敗でも再接続を続け、待ちは 5,10,20,40,60 秒で頭打ち', async (t) => {
  await withTimers(t, async (logs) => {
    const box = installation({ fail: Number.POSITIVE_INFINITY });
    const hub = fakeHub();
    const src = new TikTokSource(hub, null, { createConnection: box.createConnection, jitter: 0 });
    await assert.rejects(() => src.connect('soon'), /まだ配信が始まっていません。配信が始まると、自動でつながります/);
    assert.equal(src.stay, true);
    assert.equal(src.username, 'soon');
    assert.match(logs.join('\n'), /@soon に接続します/);

    const steps = [5_000, 10_000, 20_000, 40_000, 60_000];
    for (const step of steps) {
      t.mock.timers.tick(step);
      await flush();
    }
    assert.deepEqual(scheduledSeconds(logs), [5, 10, 20, 40, 60, 60]);
    const failed = logs.filter((line) => line.includes('再接続に失敗しました'));
    assert.equal(failed.length, 5);
    assert.match(failed[0], /まだ配信が始まっていません/);
    await src.disconnect();

    const again = installation({ fail: 1 });
    const hub2 = fakeHub();
    const logs2 = [];
    const orig = console.log;
    console.log = (...args) => logs2.push(args.join(' '));
    try {
      const src2 = new TikTokSource(hub2, null, { createConnection: again.createConnection, jitter: 0 });
      await assert.rejects(() => src2.connect('@soon'), /自動でつながります/);
      assert.equal(src2.stay, true);
      await src2.connect('soon');
      assert.equal(src2.stay, true);
      assert.equal(again.conns.length, 2);
      assert.equal(hub2.status.mode, 'live');
      t.mock.timers.tick(60_000);
      await flush();
      assert.equal(again.conns.length, 2);
      await src2.disconnect();
    } finally {
      console.log = orig;
    }
  });
});

serial('再接続の待ちは ±20%。retryDelays を渡すと短い待ちでつながる', async (t) => {
  await withTimers(t, async (logs) => {
    const seen = [];
    const orig = global.setTimeout;
    global.setTimeout = (fn, ms, ...rest) => {
      const timer = orig(fn, ms, ...rest);
      seen.push(ms);
      return timer;
    };
    Math.random = () => 0;
    const low = installation({ fail: Number.POSITIVE_INFINITY });
    const src = new TikTokSource(fakeHub(), null, { createConnection: low.createConnection });
    await assert.rejects(() => src.connect('low'));
    assert.equal(seen.at(-1), 4_000);
    assert.equal(scheduledSeconds(logs).at(-1), 4);
    await src.disconnect();

    Math.random = () => 1;
    const high = installation({ fail: Number.POSITIVE_INFINITY });
    const src2 = new TikTokSource(fakeHub(), null, { createConnection: high.createConnection });
    await assert.rejects(() => src2.connect('high'));
    assert.equal(seen.at(-1), 6_000);
    assert.equal(scheduledSeconds(logs).at(-1), 6);
    await src2.disconnect();
  });

  const box = installation({ fail: 1 });
  const hub = fakeHub();
  const src = new TikTokSource(hub, null, { createConnection: box.createConnection, retryDelays: [30], jitter: 0, watchdogMs: 60_000 });
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await assert.rejects(() => src.connect('fast'), /自動でつながります/);
    assert.match(logs.join('\n'), /0\.03秒後に再接続します/);
    const start = Date.now();
    while (box.conns.length < 2 && Date.now() - start < 1_000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(box.conns.length, 2);
    assert.equal(hub.status.mode, 'live');
    assert.ok(Date.now() - start < 500);
    assert.equal(src.stay, true);
  } finally {
    await src.disconnect();
    console.log = origLog;
  }
});

serial('接続ルートは成功でも失敗でもつなぎ続け、切断でやめる', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-reconnect-route-'));
  const stayed = [];
  const origConnect = TikTokSource.prototype.connect;
  const origDisconnect = TikTokSource.prototype.disconnect;
  let fail = true;
  TikTokSource.prototype.connect = async function (username) {
    const name = String(username ?? '').replace(/^@/, '').trim();
    this.username = name;
    this.stay = true;
    if (fail) throw new Error('まだ配信が始まっていません。配信が始まると、自動でつながります');
  };
  TikTokSource.prototype.disconnect = async function () {
    this.stay = false;
    this.username = null;
  };
  let server;
  let rt;
  try {
    rt = createRuntime({
      id: 'route',
      store: createStore(path.join(dir, 'config.yaml')),
      dataDir: dir,
      mediaDirs: [dir],
      setStayConnected: (handle) => stayed.push(handle),
    });
    const app = express();
    app.use(express.json());
    app.use(rt.router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const post = async (urlPath, body) => {
      const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      return { status: res.status, data: await res.json() };
    };

    const empty = await post('/api/connect', { username: '   ' });
    assert.equal(empty.status, 400);
    assert.deepEqual(stayed, []);

    const offline = await post('/api/connect', { username: '@off' });
    assert.equal(offline.status, 502);
    assert.match(offline.data.error, /自動でつながります/);
    assert.deepEqual(stayed, ['off']);

    fail = false;
    const ok = await post('/api/connect', { username: 'on' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.ok, true);
    assert.deepEqual(stayed, ['off', 'on']);

    const bye = await post('/api/disconnect');
    assert.equal(bye.status, 200);
    assert.deepEqual(stayed, ['off', 'on', null]);
  } finally {
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    if (rt) await rt.close().catch(() => {});
    TikTokSource.prototype.connect = origConnect;
    TikTokSource.prototype.disconnect = origDisconnect;
  }
});

test('stayConnected はファイルに残り、再起動時は2秒ずつ戻す', () => {
  const script = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock } from 'node:test';
import { TikTokSource } from ${JSON.stringify(path.join(root, 'src/tiktok.js'))};
import { Tenants } from ${JSON.stringify(path.join(root, 'src/tenants.js'))};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-resume-'));
process.env.TW_RESUME_CONNECT = '0';
process.env.TW_RENTAL_AUTOCONNECT = '0';
const first = new Tenants({ dir });
const a = first.create({ name: 'A' });
const b = first.create({ name: 'B' });
const c = first.create({ name: 'C' });
const fresh = first.create({ name: 'D' });
assert.equal(first.get(fresh.id).stayConnected, null);
first.get(a.id).stayConnected = 'alpha';
first.get(b.id).enabled = false;
first.get(b.id).stayConnected = 'skipme';
first.get(c.id).stayConnected = 'gamma';
first.setGuideDone(a.id, true);
const saved = JSON.parse(fs.readFileSync(path.join(dir, 'tenants.json'), 'utf8'));
assert.equal(saved.tenants.find((t) => t.id === a.id).stayConnected, 'alpha');
assert.equal(saved.tenants.find((t) => t.id === c.id).stayConnected, 'gamma');
assert.equal(saved.tenants.find((t) => t.id === fresh.id).stayConnected, null);

const calls = [];
const logs = [];
console.log = (...args) => logs.push(args.join(' '));
TikTokSource.prototype.connect = async function (username) { calls.push(username); };
delete process.env.TW_RESUME_CONNECT;
mock.timers.enable({ apis: ['setTimeout'] });
const again = new Tenants({ dir });
assert.equal(again.get(a.id).stayConnected, 'alpha');
assert.equal(again.get(c.id).stayConnected, 'gamma');
const joined = logs.join('\\n');
assert.match(joined, new RegExp(a.id + ' @alpha'));
assert.match(joined, new RegExp(c.id + ' @gamma（2秒後）'));
assert.doesNotMatch(joined, /skipme/);
assert.deepEqual(calls, []);
mock.timers.tick(0);
assert.deepEqual(calls, ['alpha']);
mock.timers.tick(1999);
assert.deepEqual(calls, ['alpha']);
mock.timers.tick(1);
assert.deepEqual(calls, ['alpha', 'gamma']);
process.stdout.write('RESUME_OK\\n');
process.exit(0);
`;
  const file = path.join(os.tmpdir(), `tw-resume-${process.pid}.mjs`);
  fs.writeFileSync(file, script);
  try {
    const result = spawnSync(process.execPath, [file], {
      encoding: 'utf8',
      timeout: 30_000,
      cwd: root,
      env: { ...process.env, TW_RESUME_CONNECT: '0', TW_RENTAL_AUTOCONNECT: '0' },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /RESUME_OK/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

serial('waitAllowed が偽なら、配信前の失敗のあと試すのを止め、wake() で再開する', async (t) => {
  await withTimers(t, async (logs) => {
    const box = installation({ fail: 1 });
    const hub = fakeHub();
    let widgetOpen = false;
    const src = new TikTokSource(hub, null, { createConnection: box.createConnection, jitter: 0, waitAllowed: () => widgetOpen });
    await src.connect('@quiet_user').catch(() => {});
    assert.equal(src.parked, true);
    assert.equal(hub.status.mode, 'idle');
    assert.match(hub.status.message, /OBS のウィジェットを開くと/);
    t.mock.timers.tick(120_000);
    await flush();
    assert.equal(box.conns.length, 1, '待っているあいだは接続を試さない');
    assert.equal(scheduledSeconds(logs).length, 0);

    widgetOpen = true;
    assert.equal(src.wake(), true);
    await flush();
    assert.equal(box.conns.length, 2);
    assert.equal(hub.status.mode, 'live');
    assert.equal(src.parked, false);
    assert.equal(src.wake(), false, 'つながっているときは何もしない');
    await src.disconnect();
  });
});

serial('waitAllowed が真なら、今までどおり配信前も試し続ける', async (t) => {
  await withTimers(t, async (logs) => {
    const box = installation({ fail: 2 });
    const hub = fakeHub();
    const src = new TikTokSource(hub, null, { createConnection: box.createConnection, jitter: 0, waitAllowed: () => true });
    await src.connect('@busy_user').catch(() => {});
    assert.equal(src.parked, false);
    t.mock.timers.tick(5_000);
    await flush();
    t.mock.timers.tick(10_000);
    await flush();
    assert.equal(box.conns.length, 3);
    assert.equal(hub.status.mode, 'live');
    await src.disconnect();
  });
});

serial('disconnect() のあとは wake() しても接続しない', async (t) => {
  await withTimers(t, async () => {
    const box = installation({ fail: 1 });
    const hub = fakeHub();
    const src = new TikTokSource(hub, null, { createConnection: box.createConnection, jitter: 0, waitAllowed: () => false });
    await src.connect('@gone_user').catch(() => {});
    await src.disconnect();
    assert.equal(src.wake(), false);
    await flush();
    assert.equal(box.conns.length, 1);
  });
});
