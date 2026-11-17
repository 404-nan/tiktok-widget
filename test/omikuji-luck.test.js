// おみくじの luckBoost：配信中の視聴者ごとのギフト量で大吉の重みだけを上げる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Gacha, rollTier } from '../src/gacha.js';
import { Hub } from '../src/hub.js';
import { defaultsFor } from '../src/schema.js';

const tiers = [
  { id: 'daikichi', label: '大吉', weight: 10, pity: true },
  { id: 'kichi', label: '吉', weight: 90, pity: false },
];

function setup(hub, over = {}, random = () => 0.1005) {
  const omikuji = new Gacha(hub, { name: 'omikuji', random });
  omikuji.setConfig({
    ...defaultsFor('omikuji'),
    displayMode: 'short',
    tiers,
    luckBoost: true,
    luckUnitCoins: 100,
    luckStepPct: 10,
    luckMaxSteps: 3,
    ...over,
  });
  return omikuji;
}

test('luckBoost が無効なら、重みは今までどおり変わらない', () => {
  const base = rollTier(tiers, 0, 0, () => 0.11);
  const disabled = rollTier(tiers, 0, 0, () => 0.11, { daikichiWeightPct: 0 });
  assert.equal(disabled.tier.id, base.tier.id);
  assert.equal(disabled.pityCount, base.pityCount);

  const hub = new EventEmitter();
  hub.broadcast = () => {};
  hub.gifters = new Map([['u1', { diamonds: 999 }]]);
  const omikuji = setup(hub, { luckBoost: false });
  omikuji.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(omikuji.tier.id, 'kichi');
  omikuji.close();
});

test('投げたコインで段が増え、luckMaxSteps で止まる', () => {
  assert.equal(rollTier(tiers, 0, 0, () => 0.1005, { daikichiWeightPct: 10 }).tier.id, 'daikichi');
  assert.equal(rollTier(tiers, 0, 0, () => 0.1005, { daikichiWeightPct: 30 }).tier.id, 'daikichi');
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  hub.gifters = new Map([['u1', { diamonds: 999 }]]);
  const omikuji = setup(hub);
  omikuji.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(omikuji.tier.id, 'daikichi');
  omikuji.close();

  const capped = setup(hub, {}, () => 0.13);
  capped.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(capped.tier.id, 'kichi', '4段目相当には上がらず、3段で止まる');
  capped.close();
});

test('大吉の元の重みが0なら、何段上げても出ない', () => {
  const zero = tiers.map((tier) => tier.id === 'daikichi' ? { ...tier, weight: 0 } : tier);
  for (const pct of [0, 10, 1000]) assert.notEqual(rollTier(zero, 0, 0, () => 0, { daikichiWeightPct: pct }).tier.id, 'daikichi');
});

test('確率の上昇は視聴者ごとに独立する', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  hub.gifters = new Map([
    ['u1', { diamonds: 300 }],
    ['u2', { diamonds: 0 }],
  ]);
  const omikuji = setup(hub);
  omikuji.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(omikuji.tier.id, 'daikichi');
  omikuji.close();

  const second = setup(hub);
  second.start({ kind: 'gift', user: { id: 'u2', name: '二郎' } });
  assert.equal(second.tier.id, 'kichi');
  second.close();
});

test('配信終了後の既存の配信区切りリセットで、次の抽選は0コインから計算する', () => {
  const hub = new Hub();
  const omikuji = setup(hub);
  hub.setStatus({ mode: 'live' });
  hub.publish({ kind: 'gift', user: { id: 'u1', name: '一郎' }, gift: { id: '1', name: 'Rose', diamonds: 300, count: 1 }, totalDiamonds: 300 });
  assert.equal(hub.gifters.get('u1').diamonds, 300);
  hub.setStatus({ mode: 'ended' });
  hub.reset();
  assert.equal(hub.gifters.size, 0);
  omikuji.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(omikuji.tier.id, 'kichi');
  omikuji.close();
});

test('luckBoost は天井の数え・発動を変えない', () => {
  const boosted = rollTier(tiers, 2, 2, () => 0.99, { daikichiWeightPct: 30 });
  assert.equal(boosted.tier.id, 'daikichi');
  assert.equal(boosted.forced, true);
  assert.equal(boosted.pityCount, 0);
  const normal = rollTier(tiers, 0, 2, () => 0.99, { daikichiWeightPct: 30 });
  assert.equal(normal.pityCount, 1);
  assert.equal(normal.forced, false);
});
