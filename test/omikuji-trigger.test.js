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
