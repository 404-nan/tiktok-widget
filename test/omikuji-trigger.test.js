// おみくじのきっかけ：ギフトを指定したら、そのギフトでだけ引く（コイン条件より優先）。
// 指定が空なら、今までどおりコインの条件で引く。ガチャ側の「どちらかで回す」は変えない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gacha } from '../src/gacha.js';
import { defaultsFor } from '../src/schema.js';

function setup(name, over = {}) {
  const w = new Gacha({ broadcast: () => {} }, { name, random: () => 0.5 });
  w.setConfig({ ...defaultsFor(name), ...over });
  return w;
}

const giftEvent = (name, id, totalDiamonds) => ({
  kind: 'gift',
  totalDiamonds,
  gift: { id, name },
  user: { id: 'u1', name: 'ゆず' },
});

test('ギフトを指定したおみくじは、コインを満たす別のギフトでは引かない', () => {
  const omikuji = setup('omikuji', { displayMode: 'short', gifts: ['Rosa'], minCoins: 10 });
  omikuji.onEvent(giftEvent('Rose', '5655', 10)); // バラ10個分。コインは満たすが指定外
  assert.equal(omikuji.seq, 0);
  assert.equal(omikuji.phase, 'idle');
  omikuji.close();
});

test('指定したギフトなら、コインが少なくても引く', () => {
  const omikuji = setup('omikuji', { displayMode: 'short', gifts: ['Rosa'], minCoins: 10 });
  omikuji.onEvent(giftEvent('Rosa', '8913', 1));
  assert.equal(omikuji.seq, 1);
  omikuji.close();
});

test('ギフトが空のおみくじは、今までどおりコインの条件で引く', () => {
  const omikuji = setup('omikuji', { displayMode: 'short', gifts: [], minCoins: 10 });
  omikuji.onEvent(giftEvent('Rose', '5655', 1));
  assert.equal(omikuji.seq, 0);
  omikuji.onEvent(giftEvent('Rose', '5655', 10));
  assert.equal(omikuji.seq, 1);
  omikuji.close();
});

test('ガチャは今までどおり（ギフト指定とコイン条件のどちらかで回す）', () => {
  const gacha = setup('gacha', { gifts: ['Rosa'], minCoins: 10 });
  gacha.onEvent(giftEvent('Rose', '5655', 10));
  assert.equal(gacha.seq, 1);
  gacha.close();
});

const comboEvent = (name, id, count, perGift) => ({
  kind: 'gift',
  totalDiamonds: count * perGift,
  gift: { id, name, count },
  user: { id: 'u1', name: 'ゆず' },
});

test('おみくじは連打（コンボ）の回数ぶん続けて引く', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup('omikuji', { displayMode: 'short', gifts: [], minCoins: 10 });
  omikuji.onEvent(comboEvent('Rose', '5655', 10, 1)); // バラ10連打＝10コインで条件を満たす
  assert.equal(omikuji.seq, 1);
  assert.equal(omikuji.snapshot().pending, 9);
  for (let i = 0; i < 80 && (omikuji.phase !== 'idle' || omikuji.seq < 10); i++) t.mock.timers.tick(500);
  assert.equal(omikuji.phase, 'idle');
  assert.equal(omikuji.seq, 10);
  omikuji.close();
});

test('ギフト指定のあるおみくじも、連打は回数ぶん引く', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup('omikuji', { displayMode: 'short', gifts: ['Rosa'], minCoins: 10 });
  omikuji.onEvent(comboEvent('Rosa', '8913', 3, 1));
  assert.equal(omikuji.seq, 1);
  assert.equal(omikuji.snapshot().pending, 2);
  omikuji.close();
});

test('ガチャは連打でも1回だけ（おみくじだけの作り）', () => {
  const gacha = setup('gacha', { gifts: [], minCoins: 10 });
  gacha.onEvent(comboEvent('Rose', '5655', 5, 2));
  assert.equal(gacha.seq, 1);
  assert.equal(gacha.snapshot().pending, 0);
  gacha.close();
});
