import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Gacha, rollTier } from '../src/gacha.js';
import { defaultsFor } from '../src/schema.js';
import { createEventBus } from '../src/events.js';

function setup(over = {}, random = () => 0) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  const bus = createEventBus();
  const gacha = new Gacha(hub, { bus, random });
  gacha.setConfig({ ...defaultsFor('gacha'), rollMs: 1000, revealMs: 500, doneMs: 200, ...over });
  return { hub, gacha, sent, bus };
}

function finish(gacha, t) {
  t.mock.timers.tick(gacha.durations.rollMs);
  t.mock.timers.tick(gacha.durations.revealMs);
  t.mock.timers.tick(gacha.durations.doneMs);
}

test('重みで引き、天井は指定回数の外れの次', () => {
  const tiers = defaultsFor('gacha').tiers;
  assert.equal(rollTier(tiers, 0, 0, () => 0).tier.id, 'common');
  assert.equal(rollTier(tiers, 0, 0, () => 0.99).tier.id, 'legend');
  assert.equal(rollTier(tiers, 1, 2, () => 0).tier.id, 'common');
  const forced = rollTier(tiers, 2, 2, () => 0);
  assert.equal(forced.tier.id, 'legend');
  assert.equal(forced.forced, true);
  assert.equal(forced.pityCount, 0);
  const miss = rollTier(tiers, 0, 2, () => 0);
  assert.equal(miss.pityCount, 1);
});

test('待機→回転→結果→終了。長さをイベントに載せる', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { gacha, sent, bus } = setup();
  const names = [];
  bus.on('*', (e) => names.push(e.type));
  const started = gacha.start({ kind: 'dev' });
  assert.equal(started.phase, 'rolling');
  assert.equal(gacha.snapshot().phase, 'rolling');
  assert.equal(gacha.snapshot().tier, null);
  assert.equal(sent[0].type, 'gacha');
  assert.deepEqual(sent[0].durations, { rollMs: 1000, revealMs: 500, doneMs: 200 });
  assert.equal(names[0], 'gacha.start');
  assert.equal(names[1], 'gacha.rolling');
  t.mock.timers.tick(1000);
  assert.equal(gacha.phase, 'reveal');
  assert.equal(gacha.snapshot().tier.id, 'common');
  assert.equal(sent.at(-1).event, 'reveal');
  t.mock.timers.tick(500);
  assert.equal(gacha.phase, 'done');
  t.mock.timers.tick(200);
  assert.equal(gacha.phase, 'idle');
  assert.equal(names.includes('gacha.idle'), true);
  gacha.close();
});

test('天井 2 なら 2 回外した次が確定。重なった回は終わるまで待つ', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { gacha } = setup({ pity: 2 });
  gacha.start({ kind: 'a' });
  assert.equal(gacha.tier.id, 'common');
  assert.equal(gacha.pityCount, 1);
  const queued = gacha.start({ kind: 'b' });
  assert.equal(queued.queued, true);
  finish(gacha, t);
  assert.equal(gacha.phase, 'rolling');
  assert.equal(gacha.trigger.kind, 'b');
  assert.equal(gacha.tier.id, 'common');
  assert.equal(gacha.pityCount, 2);
  finish(gacha, t);
  gacha.start({ kind: 'c' });
  assert.equal(gacha.tier.id, 'legend');
  assert.equal(gacha.forced, true);
  assert.equal(gacha.pityCount, 0);
  gacha.close();
});

test('ギフト ID か最低コインで回り、表示名は日本語。オフなら null', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { gacha } = setup({ minCoins: 100, gifts: ['5655'], pity: 0 });
  gacha.onEvent({ kind: 'gift', gift: { id: '5655', name: 'Rose', count: 1 }, totalDiamonds: 1, user: { name: 'たろう' } });
  assert.equal(gacha.phase, 'rolling');
  assert.equal(gacha.trigger.giftLabel, 'バラ');
  finish(gacha, t);
  gacha.onEvent({ kind: 'gift', gift: { id: '1', name: 'Doughnut' }, totalDiamonds: 99 });
  assert.equal(gacha.phase, 'idle');
  gacha.onEvent({ kind: 'gift', gift: { id: '1', name: 'Doughnut' }, totalDiamonds: 100 });
  assert.equal(gacha.phase, 'rolling');
  gacha.close();

  const off = setup({ enabled: false, minCoins: 1 });
  assert.equal(off.gacha.start({ kind: 'action' }), null);
  off.gacha.onEvent({ kind: 'gift', gift: { id: '1', name: 'Rose' }, totalDiamonds: 999 });
  assert.equal(off.gacha.phase, 'idle');
  off.gacha.close();
});

test('close すると段階は進まない', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { gacha } = setup();
  gacha.start({ kind: 'dev' });
  gacha.close();
  t.mock.timers.tick(10000);
  assert.equal(gacha.phase, 'rolling');
});
