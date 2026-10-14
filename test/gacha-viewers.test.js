import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import { Gacha } from '../src/gacha.js';
import { GachaViewers, GachaViewerStore, gachaResetAt } from '../src/gacha-viewers.js';
import { defaultsFor } from '../src/schema.js';
import { createEventBus } from '../src/events.js';
import { normalize, parseText, createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gv-'));

function setup(over = {}, now = () => 1_000) {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const bus = createEventBus();
  const gacha = new Gacha(hub, { bus, random: () => 0 });
  const cfg = { ...defaultsFor('gacha'), rollMs: 1000, revealMs: 500, doneMs: 200, cooldownSec: 0, ...over };
  gacha.setConfig(cfg);
  const dir = tmpDir();
  const file = path.join(dir, 'gacha-viewers.json');
  const store = new GachaViewerStore(file, { now, debounceMs: 60_000 });
  const viewers = new GachaViewers(store, { gacha, bus, now });
  viewers.setConfig(cfg);
  return { hub, gacha, viewers, store, file, dir, bus, cfg };
}

function finish(gacha, t) {
  t.mock.timers.tick(gacha.durations.rollMs);
  t.mock.timers.tick(gacha.durations.revealMs);
  t.mock.timers.tick(gacha.durations.doneMs);
}

const user = { id: 'viewer', name: 'たろう' };
const gift = (coins, id = '5655', name = 'Rose') => ({
  kind: 'gift',
  gift: { id, name, diamonds: coins, count: 1 },
  totalDiamonds: coins,
  user,
});
const chat = (text, who = user) => ({ kind: 'chat', text, user: who });

test('日本時間の0時をまたぐと無料回が戻り、配信開始では戻らない', () => {
  assert.equal(gachaResetAt(Date.parse('2026-03-31T14:30:00.000Z')), Date.parse('2026-03-31T15:00:00.000Z'));
  assert.equal(gachaResetAt(Date.parse('2026-12-31T14:59:00.000Z')), Date.parse('2026-12-31T15:00:00.000Z'));
  assert.equal(gachaResetAt(Date.parse('2026-12-31T15:00:00.000Z')), Date.parse('2027-01-01T15:00:00.000Z'));

  let now = Date.parse('2026-03-31T14:30:00.000Z');
  const { gacha, viewers } = setup({ resetMode: 'daily', freePerReset: 1, cooldownSec: 0 }, () => now);
  try {
    viewers.onEvent(gift(100));
    assert.equal(viewers.spin(user).cost, 'free');
    assert.equal(viewers.public(user.id).free.remaining, 0);
    assert.equal(viewers.public(user.id).paid.credits, 1);
    now = Date.parse('2026-03-31T14:59:59.000Z');
    assert.equal(viewers.public(user.id).free.remaining, 0);
    now = Date.parse('2026-03-31T15:00:00.000Z');
    assert.equal(viewers.public(user.id).free.remaining, 1);
    assert.equal(viewers.public(user.id).free.used, 0);
    assert.equal(viewers.public(user.id).paid.credits, 1);
    viewers.spin(user);
    viewers.onStatus({ mode: 'live' }, { mode: 'idle' });
    assert.equal(viewers.public(user.id).free.remaining, 0);
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('配信が始まるたびに無料回だけ戻り、同じ配信の続きでは戻らない', () => {
  const { gacha, viewers } = setup({ resetMode: 'stream', freePerReset: 2, cooldownSec: 0 });
  try {
    assert.equal(viewers.spin(user).cost, 'free');
    viewers.onEvent(gift(200));
    assert.equal(viewers.public(user.id).paid.credits, 2);
    assert.equal(viewers.public(user.id).free.remaining, 1);
    // 未接続から配信が始まる（idle → connecting → live）
    viewers.onStatus({ mode: 'connecting' }, { mode: 'idle' });
    viewers.onStatus({ mode: 'live' }, { mode: 'connecting' });
    assert.equal(viewers.public(user.id).free.remaining, 2);
    assert.equal(viewers.public(user.id).free.used, 0);
    assert.equal(viewers.public(user.id).paid.credits, 2);
    viewers.spin(user);
    // 途中で切れてつなぎ直しても、失敗を挟んでも戻さない
    viewers.onStatus({ mode: 'connecting' }, { mode: 'live' });
    viewers.onStatus({ mode: 'error' }, { mode: 'connecting' });
    viewers.onStatus({ mode: 'connecting' }, { mode: 'error' });
    viewers.onStatus({ mode: 'live' }, { mode: 'connecting' });
    assert.equal(viewers.public(user.id).free.remaining, 1);
    viewers.onStatus({ mode: 'live' }, { mode: 'live' });
    assert.equal(viewers.public(user.id).free.remaining, 1);
    // 配信終了のあとの新しい配信では無料回だけ戻す
    viewers.onStatus({ mode: 'ended' }, { mode: 'live' });
    viewers.onStatus({ mode: 'connecting' }, { mode: 'ended' });
    viewers.onStatus({ mode: 'live' }, { mode: 'connecting' });
    assert.equal(viewers.public(user.id).free.remaining, 2);
    assert.equal(viewers.public(user.id).paid.credits, 2);
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('フォロー条件は配信中のフォローだけで、新しい配信では外れる', () => {
  const { gacha, viewers } = setup({ freeRequires: 'follow', freePerReset: 2, resetMode: 'daily', cooldownSec: 0 });
  try {
    assert.equal(viewers.spin(user).reason, 'follow');
    viewers.onEvent({ kind: 'follow', user });
    assert.equal(viewers.spin(user).cost, 'free');
    viewers.onStatus({ mode: 'live' }, { mode: 'idle' });
    assert.equal(viewers.public(user.id).free.remaining, 1);
    assert.equal(viewers.spin(user).reason, 'follow');
    viewers.onEvent({ kind: 'follow', user });
    assert.equal(viewers.spin(user).cost, 'free');
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('ギフトはコインごとに回数を足し、端数は繰り越さない', () => {
  const { gacha, viewers } = setup({
    cooldownSec: 0,
    paidRule: { gifts: ['5655'], minCoins: 100, spinsPerCoins: 100 },
  });
  try {
    assert.equal(viewers.onEvent(gift(99, '1', 'Doughnut')), null);
    assert.equal(viewers.onEvent(gift(50)).reason, '端数');
    assert.equal(viewers.onEvent(gift(250)).credits, 2);
    assert.equal(viewers.onEvent(gift(20)).reason, '端数');
    assert.equal(viewers.public(user.id).paid.credits, 2);
    assert.equal(viewers.onEvent(gift(100, '1', 'Doughnut')).credits, 1);
    viewers.setConfig({ ...viewers.config, paidRule: { gifts: [], minCoins: 1, spinsPerCoins: 30 } });
    const again = viewers.onEvent(gift(100, '9', 'Ice'));
    assert.equal(again.credits, 3);
    assert.equal(viewers.onEvent(gift(20, '9', 'Ice')).reason, '端数');
    assert.equal(viewers.public(user.id).paid.credits, 2 + 1 + 3);
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('コメントは無料を先に使い、その次に有料を1回使う', () => {
  const { gacha, viewers } = setup({ freePerReset: 1, cooldownSec: 0, command: '回せ' });
  try {
    viewers.onEvent(gift(100));
    assert.equal(viewers.onEvent(chat('!ガチャ')), null);
    assert.equal(gacha.phase, 'idle');
    const free = viewers.onEvent(chat('  回せ  '));
    assert.equal(free.cost, 'free');
    assert.equal(free.viewer.free.remaining, 0);
    assert.equal(free.viewer.paid.credits, 1);
    assert.equal(gacha.phase, 'rolling');
    const paid = viewers.onEvent(chat('回せ'));
    assert.equal(paid.ok, true);
    assert.equal(paid.queued, true);
    assert.equal(paid.cost, 'paid');
    assert.equal(viewers.public(user.id).paid.credits, 0);
    assert.equal(viewers.public(user.id).paid.used, 1);
    assert.equal(viewers.onEvent(chat('回せ')).reason, 'no-credits');
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('同じ人は最短間隔を空け、ほかの人は待たない', () => {
  let now = 10_000;
  const { gacha, viewers } = setup({ cooldownSec: 5, freePerReset: 3 }, () => now);
  try {
    assert.equal(viewers.spin(user).ok, true);
    const blocked = viewers.spin(user);
    assert.equal(blocked.reason, 'cooldown');
    assert.equal(blocked.waitMs, 5000);
    now = 14_999;
    assert.equal(viewers.spin(user).reason, 'cooldown');
    assert.equal(viewers.spin({ id: 'other', name: 'はな' }).ok, true);
    now = 15_000;
    assert.equal(viewers.spin(user).ok, true);
    assert.equal(viewers.public(user.id).free.used, 2);
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('全体の待ちは20までで、あふれた分は回数を消費しない', () => {
  const { gacha, viewers } = setup({ cooldownSec: 0, freePerReset: 1, rollMs: 60_000 });
  try {
    for (let i = 0; i < 21; i++) {
      const started = viewers.spin({ id: `u${i}`, name: `n${i}` });
      assert.equal(started.ok, true, `${i}:${started.reason}`);
    }
    assert.equal(gacha.snapshot().pending, 20);
    const full = viewers.spin({ id: 'overflow', name: 'あふれた' });
    assert.equal(full.reason, 'full');
    assert.equal(viewers.public('overflow'), null);
    assert.equal(viewers.public('u20').free.used, 1);
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('保存はまとめ、0600 で置き換え、読み直しても直近20件が残る', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = tmpDir();
  const file = path.join(dir, 'nested', 'gacha-viewers.json');
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const bus = createEventBus();
  const gacha = new Gacha(hub, { bus, random: () => 0 });
  const cfg = { ...defaultsFor('gacha'), rollMs: 5, revealMs: 5, doneMs: 5, cooldownSec: 0, freePerReset: 30 };
  gacha.setConfig(cfg);
  const store = new GachaViewerStore(file, { debounceMs: 1000 });
  const viewers = new GachaViewers(store, { gacha, bus, now: () => Date.now() });
  viewers.setConfig(cfg);
  try {
    for (let i = 0; i < 25; i++) {
      assert.equal(viewers.spin(user).ok, true);
      finish(gacha, t);
    }
    assert.equal(fs.existsSync(file), false);
    viewers.onEvent(gift(100));
    store.flush();
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(path.dirname(file)).some((name) => name.includes('.tmp-')), false);
    const loaded = new GachaViewerStore(file);
    const saved = loaded.all()[user.id];
    assert.equal(saved.name, 'たろう');
    assert.equal(saved.free.used, 25);
    assert.equal(saved.paid.credits, 1);
    assert.equal(saved.history.length, 20);
    assert.equal(saved.history[0].label, 'ふつう');
    assert.equal(saved.history.at(-1).cost, 'free');
    const again = new GachaViewers(loaded, { gacha, bus, now: () => Date.now() });
    again.setConfig(cfg);
    const shown = again.public(user.id).history;
    assert.equal(shown.length, 20);
    assert.ok(shown[0].at >= shown.at(-1).at);
    again.close();
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('古い記録と古い設定はエラーにせず既定で補う', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'gacha-viewers.json');
  const history = Array.from({ length: 25 }, (_, i) => ({ tier: 'common', label: String(i), at: `t${i}`, cost: i % 2 ? 'paid' : 'free' }));
  fs.writeFileSync(file, JSON.stringify({
    old: { name: 'たろう' },
    kept: { name: 'はな', free: { used: 2 }, paid: { credits: 4 }, history },
  }));
  const store = new GachaViewerStore(file);
  assert.equal(store.all().old.free.used, 0);
  assert.equal(store.all().old.paid.credits, 0);
  assert.deepEqual(store.all().old.history, []);
  assert.equal(store.all().kept.paid.credits, 4);
  assert.equal(store.all().kept.history.length, 20);
  assert.equal(store.all().kept.history[0].label, '5');
  assert.equal(store.all().kept.history.at(-1).label, '24');
  fs.writeFileSync(path.join(dir, 'bad.json'), '{');
  assert.deepEqual(new GachaViewerStore(path.join(dir, 'bad.json')).all(), {});

  const old = normalize({
    gacha: { enabled: true, minCoins: 50, gifts: ['Rose'], tiers: [{ id: 'common', label: 'ふつう', weight: 3 }] },
  });
  assert.deepEqual(old.errors, []);
  assert.equal(old.config.gacha.minCoins, 50);
  assert.equal(old.config.gacha.freePerReset, 1);
  assert.equal(old.config.gacha.resetMode, 'stream');
  assert.equal(old.config.gacha.freeRequires, 'none');
  assert.equal(old.config.gacha.command, '!ガチャ');
  assert.equal(old.config.gacha.cooldownSec, 5);
  assert.deepEqual(old.config.gacha.paidRule, { gifts: [], minCoins: 100, spinsPerCoins: 100 });
  assert.equal(old.config.gacha.tiers[0].weight, 3);
  assert.deepEqual(old.config.gacha.tiers[0].actions, []);

  const empty = normalize({ gacha: { paidRule: null, freePerReset: null } });
  assert.deepEqual(empty.errors, []);
  assert.equal(empty.config.gacha.freePerReset, 1);
  assert.equal(empty.config.gacha.paidRule.spinsPerCoins, 100);

  const parsed = parseText('gacha:\n  enabled: true\n  minCoins: 10\n  tiers:\n    - {id: common, label: ふつう, weight: 1}\n');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.config.gacha.command, '!ガチャ');
  assert.deepEqual(parsed.config.gacha.tiers[0].actions, []);

  const linked = normalize({
    gacha: { tiers: [{ id: 'legend', label: '激アツ', weight: 1, pity: true, actions: [{ type: 'wins.add', n: 1 }] }] },
  });
  assert.deepEqual(linked.errors, []);
  assert.equal(linked.config.gacha.tiers[0].actions[0].n, 1);
});

test('回数の足し戻しと、開発の有料は無料が残っていても有料を使う', () => {
  let now = 0;
  const { gacha, viewers } = setup({ cooldownSec: 0, freePerReset: 1 }, () => now);
  try {
    assert.equal(viewers.adjust('missing', 1), null);
    assert.throws(() => viewers.adjust(user.id, 0), /整数/);
    viewers.spin(user);
    assert.equal(viewers.adjust(user.id, 1, 'free').free.remaining, 1);
    assert.equal(viewers.adjust(user.id, -1, 'free').free.remaining, 0);
    assert.equal(viewers.adjust(user.id, 2, 'paid').paid.credits, 2);
    assert.equal(viewers.adjust(user.id, -5, 'paid').paid.credits, 0);
    now += 1;
    const paid = viewers.devSpin({ id: 'dev_テスト視聴者', name: 'テスト視聴者' }, true);
    assert.equal(paid.cost, 'paid');
    assert.equal(paid.viewer.free.remaining, 1);
    assert.equal(paid.viewer.paid.credits, 0);
    assert.equal(paid.viewer.paid.used, 1);
    const free = viewers.devSpin({ id: 'dev_テスト視聴者', name: 'テスト視聴者' }, false);
    assert.equal(free.cost, 'free');
    viewers.resetFree();
    assert.equal(viewers.public('dev_テスト視聴者').free.remaining, 1);
    assert.equal(viewers.public('dev_テスト視聴者').paid.used, 1);
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('一覧は最近動いた50人で、読み直したあとも履歴の新しい順', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let now = 0;
  const { gacha, viewers, file } = setup({ cooldownSec: 0, rollMs: 5, revealMs: 5, doneMs: 5 }, () => now);
  try {
    for (let i = 0; i < 55; i++) {
      now = Date.now() + 1;
      assert.equal(viewers.spin({ id: `u${i}`, name: `n${i}` }).ok, true);
      finish(gacha, t);
    }
    const listed = viewers.list();
    assert.equal(listed.length, 50);
    assert.equal(listed[0].userId, 'u54');
    assert.equal(listed.some((viewer) => viewer.userId === 'u0'), false);
    assert.equal(viewers.snapshot().total, 55);
    viewers.close();
  } finally {
    gacha.close();
  }

  const dir = tmpDir();
  const saved = path.join(dir, 'gacha-viewers.json');
  fs.writeFileSync(saved, JSON.stringify({
    old: { name: '古い', free: { used: 0, resetAt: null }, paid: { credits: 5, used: 0 }, history: [{ tier: 'common', label: 'ふつう', at: '2026-01-01T00:00:00.000Z', cost: 'free' }] },
    neu: { name: '新しい', free: { used: 0, resetAt: null }, paid: { credits: 0, used: 0 }, history: [{ tier: 'rare', label: 'レア', at: '2026-06-01T00:00:00.000Z', cost: 'paid' }] },
  }));
  const restored = new GachaViewers(new GachaViewerStore(saved), { gacha: new Gacha(new EventEmitter(), { random: () => 0 }), now: () => Date.parse('2026-06-02T00:00:00.000Z') });
  try {
    assert.equal(restored.list()[0].userId, 'neu');
    assert.equal(restored.list()[0].history[0].label, 'レア');
    assert.equal(restored.list()[1].paid.credits, 5);
  } finally {
    restored.close();
  }
  assert.equal(fs.existsSync(file), true);
});

test('ギフトで直接回る今までのガチャは残り、視聴者の回数とは別', () => {
  const { gacha, viewers } = setup({ minCoins: 100, gifts: [], cooldownSec: 0, paidRule: { gifts: [], minCoins: 100, spinsPerCoins: 100 } });
  try {
    const event = gift(100);
    gacha.onEvent(event);
    viewers.onEvent(event);
    assert.equal(gacha.phase, 'rolling');
    assert.equal(gacha.trigger.kind, 'gift');
    assert.equal(viewers.public(user.id).paid.credits, 1);
    assert.equal(viewers.public(user.id).free.used, 0);
  } finally {
    viewers.close();
    gacha.close();
  }
});

test('コメントの結果で等級の動作が走り、記録に残る', async () => {
  const dir = tmpDir();
  const runtime = createRuntime({
    id: 'gacha-viewers',
    store: createStore(path.join(dir, 'config.yaml')),
    dataDir: dir,
    mediaDirs: [dir],
  });
  try {
    const replaced = runtime.setConfig(['gacha'], {
      ...defaultsFor('gacha'),
      rollMs: 20,
      revealMs: 20,
      doneMs: 10,
      cooldownSec: 0,
      freePerReset: 1,
      tiers: [{ id: 'common', label: 'あたり', weight: 1, pity: false, actions: [{ type: 'wins.add', id: 'default', n: 1 }] }],
    });
    assert.equal(replaced.ok, true, (replaced.errors || []).join('\n'));
    assert.equal(runtime.readWins().default.wins, 0);
    runtime.hub.publish({ kind: 'chat', text: '!ガチャ', user: { id: 'viewer1', name: 'たろう' } });
    const deadline = Date.now() + 1000;
    while (runtime.readWins().default.wins !== 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(runtime.readWins().default.wins, 1);
  } finally {
    await runtime.close();
  }
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'gacha-viewers.json'), 'utf8'));
  assert.equal(saved.viewer1.name, 'たろう');
  assert.equal(saved.viewer1.free.used, 1);
  assert.equal(saved.viewer1.history[0].label, 'あたり');
  assert.equal(saved.viewer1.history[0].cost, 'free');
  assert.equal(fs.statSync(path.join(dir, 'gacha-viewers.json')).mode & 0o777, 0o600);
});

test('架空の視聴者で回す試験は開発のときだけ', async () => {
  const dir = tmpDir();
  const runtime = createRuntime({
    id: 'gacha-viewers-dev',
    store: createStore(path.join(dir, 'config.yaml')),
    dataDir: dir,
    mediaDirs: [dir],
  });
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const beforeEnv = process.env.TW_ENV;
  const beforePort = process.env.PORT;
  const post = (body) => fetch(`http://127.0.0.1:${port}/api/dev/trigger`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: '127.0.0.1' },
    body: JSON.stringify(body),
  });
  try {
    delete process.env.TW_ENV;
    const denied = await post({ target: 'gacha-viewer', name: 'テスト視聴者' });
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /開発環境/);
    process.env.TW_ENV = 'dev';
    process.env.PORT = '3940';
    const paid = await post({ target: 'gacha-viewer', name: '有料さん', paid: true });
    assert.equal(paid.status, 200);
    const paidBody = await paid.json();
    assert.equal(paidBody.gacha.cost, 'paid');
    const paidViewer = paidBody.viewers.find((viewer) => viewer.name === '有料さん');
    assert.equal(paidViewer.free.remaining, 1);
    assert.equal(paidViewer.paid.credits, 0);
    const free = await post({ target: 'gacha-viewer', name: '無料さん', paid: false });
    assert.equal(free.status, 200);
    const freeBody = await free.json();
    assert.equal(freeBody.gacha.cost, 'free');
    assert.equal(freeBody.viewers.find((viewer) => viewer.name === '無料さん').free.remaining, 0);
  } finally {
    if (beforeEnv === undefined) delete process.env.TW_ENV;
    else process.env.TW_ENV = beforeEnv;
    if (beforePort === undefined) delete process.env.PORT;
    else process.env.PORT = beforePort;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await runtime.close();
  }
});
