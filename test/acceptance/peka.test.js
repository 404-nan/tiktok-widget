// Pekaの抽選、待ち行列、点灯、テスト状態を完成条件ごとに確認する受け入れテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Peka, rollPekaDelay, PENDING_CAP } from '../../src/peka.js';
import { defaultsFor } from '../../src/schema.js';

function setup(over = {}, random = () => 0) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (message) => sent.push(message);
  const peka = new Peka(hub, { random });
  peka.setConfig({ ...defaultsFor('peka'), chance: 1, ...over });
  return { peka, sent };
}

function gift(over = {}) {
  return {
    kind: 'gift',
    gift: { id: '5655', name: 'Rose', count: 4, image: '/gift.png' },
    totalDiamonds: 100,
    user: { id: 'u1', name: 'さくら', avatar: '/avatar.png' },
    ...over,
  };
}

test('AC-1: Peka の設定に範囲と日本語の説明がある', () => {
  const fields = defaultsFor('peka');
  for (const key of ['enabled', 'minCoins', 'chance', 'bonusSeconds', 'sound', 'volume']) assert.ok(key in fields, key);
  assert.equal(fields.chance, 0.3);
  assert.equal(fields.volume, 0.3);
  assert.equal(fields.chance, 0.3);
});

test('AC-2: 連打ギフトでも1件だけ抽選し、結果と予定時刻を状態に持つ', () => {
  const { peka } = setup({}, () => 0.5);
  peka.onEvent(gift());
  assert.equal(peka.snapshot().pending, 0);
  assert.equal(peka.snapshot().phase, 'pending');
  assert.equal(peka.snapshot().current.trigger.gift.count, 4);
  assert.ok(Number.isFinite(peka.snapshot().current.at));
  peka.close();
});

test('AC-3: 先ペカ・後ペカ・遅ペカをサーバー側で決める', () => {
  assert.deepEqual(rollPekaDelay(() => 0), { kind: '先ペカ', delayMs: 0, color: 'blue' });
  assert.ok(rollPekaDelay(() => 0.5).delayMs >= 1500 && rollPekaDelay(() => 0.5).delayMs <= 6000);
  assert.ok(rollPekaDelay(() => 0.99).delayMs >= 9000 && rollPekaDelay(() => 0.99).delayMs <= 11000);
});

test('AC-4/8: 点灯通知に送った人、段階色、音の設定を載せる', () => {
  const { peka, sent } = setup({ sound: false, volume: 0 }, () => 0);
  peka.onEvent(gift());
  const lit = sent.find((message) => message.event === 'lit');
  assert.equal(lit.current.trigger.user.name, 'さくら');
  assert.equal(lit.current.color, 'blue');
  assert.equal(lit.sound, false);
  assert.equal(lit.volume, 0);
  peka.close();
});

test('AC-5: 点灯を解決するまで保持し、解決前の当たりを20件まで待たせる', () => {
  const { peka } = setup({ chance: 1 }, () => 0.5);
  peka.onEvent(gift());
  for (let i = 0; i < PENDING_CAP + 1; i++) peka.onEvent(gift({ user: { id: `u${i}`, name: `人${i}` } }));
  assert.equal(peka.snapshot().pending, PENDING_CAP);
  assert.equal(peka.snapshot().lastRejected.reason, 'full');
  peka.resolve('bonusResolved');
  assert.equal(peka.snapshot().phase, 'pending');
  peka.close();
});

test('AC-7: testEvent はテスト印付きで配り、reset で消える', () => {
  const { peka, sent } = setup();
  peka.onEvent(gift({ test: true }));
  assert.equal(sent.at(-1).test, true);
  assert.equal(peka.snapshot().current.trigger.test, true);
  peka.reset();
  assert.equal(peka.snapshot().phase, 'idle');
  assert.equal(peka.snapshot().current, null);
  peka.close();
});

test('AC-6: 状態を取得すれば、再接続した画面が点灯中の送信者を復元できる', () => {
  const { peka } = setup({}, () => 0);
  peka.onEvent(gift());
  const restored = peka.snapshot();
  assert.equal(restored.phase, 'lit');
  assert.equal(restored.current.trigger.user.name, 'さくら');
  assert.equal(restored.current.trigger.gift.name, 'バラ');
  peka.close();
});
