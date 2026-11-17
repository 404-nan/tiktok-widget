// おみくじの短い表示: 番号選びを飛ばし、固定の短い段階で結果を出す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gacha } from '../src/gacha.js';
import { defaultsFor } from '../src/schema.js';

function setup(over = {}, random = () => 0) {
  const sent = [];
  const omikuji = new Gacha({ broadcast: (message) => sent.push(message) }, { name: 'omikuji', random });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, ...over });
  return { omikuji, sent };
}

const gift = () => ({
  kind: 'gift',
  totalDiamonds: 10,
  gift: { id: '1', name: 'Rose' },
  user: { id: 'u1', name: 'ゆず' },
});

test('おみくじの表示初期値は短い型・シンプルで、ガチャには項目がない', () => {
  assert.equal(defaultsFor('omikuji').displayMode, 'short');
  assert.equal(defaultsFor('omikuji').resultFont, 'simple');
  assert.equal(defaultsFor('omikuji').tempo, 'quick');
  assert.equal('displayMode' in defaultsFor('gacha'), false);
  assert.equal('tempo' in defaultsFor('gacha'), false);
});

// 大吉を外した運勢（weight 0 は抽選から外れる）で、結果を中吉に固定する
const noDaikichi = () => defaultsFor('omikuji').tiers.map((t) => (t.id === 'daikichi' ? { ...t, weight: 0 } : t));

test('短い型は番号選びなしで固定時間を使い、payload に表示設定を載せる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, sent } = setup({ displayMode: 'short', resultFont: 'brush', pickMode: 'streamer', rollMs: 9999, tiers: noDaikichi() });

  omikuji.onEvent(gift());
  assert.equal(omikuji.phase, 'rolling');
  // 既定のテンポ quick の長さ
  assert.deepEqual(omikuji.durations, { rollMs: 300, revealMs: 800, doneMs: 300, daikichiRevealMs: 2550 });
  assert.equal(omikuji.snapshot().displayMode, 'short');
  assert.equal(omikuji.snapshot().resultFont, 'brush');
  assert.equal(sent.at(-1).displayMode, 'short');
  assert.equal(sent.at(-1).resultFont, 'brush');

  t.mock.timers.tick(300);
  assert.equal(omikuji.phase, 'reveal');
  t.mock.timers.tick(800);
  assert.equal(omikuji.phase, 'done');
  t.mock.timers.tick(300);
  assert.equal(omikuji.phase, 'idle');
  omikuji.close();
});

test('短い型のテンポは quick が今までの速さ、slow はもっと遅い', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const quick = setup({ displayMode: 'short', tempo: 'quick', tiers: noDaikichi() });
  quick.omikuji.onEvent(gift());
  assert.deepEqual(quick.omikuji.durations, { rollMs: 300, revealMs: 800, doneMs: 300, daikichiRevealMs: 2550 });
  quick.omikuji.close();
  const slow = setup({ displayMode: 'short', tempo: 'slow', tiers: noDaikichi() });
  slow.omikuji.onEvent(gift());
  assert.deepEqual(slow.omikuji.durations, { rollMs: 550, revealMs: 1500, doneMs: 500, daikichiRevealMs: 4050 });
  slow.omikuji.close();
});

test('大吉のときだけ、結果の表示が見せ場の長さ（2550）続く', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const onlyDaikichi = defaultsFor('omikuji').tiers.map((tier) => ({ ...tier, weight: tier.id === 'daikichi' ? 1 : 0 }));
  const { omikuji } = setup({ displayMode: 'short', tempo: 'quick', tiers: onlyDaikichi });
  omikuji.onEvent(gift());
  t.mock.timers.tick(300);
  assert.equal(omikuji.phase, 'reveal');
  assert.equal(omikuji.tier.id, 'daikichi');
  t.mock.timers.tick(1700);
  assert.equal(omikuji.phase, 'reveal');
  t.mock.timers.tick(851);
  assert.equal(omikuji.phase, 'done');
  omikuji.close();
});

test('表示設定が長い型なら従来どおり番号待ちになる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ displayMode: 'long' });
  omikuji.onEvent(gift());
  assert.equal(omikuji.phase, 'pick');
  omikuji.close();
});
