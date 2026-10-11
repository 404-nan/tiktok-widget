import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rouletteFor } from '../public/widgets/lib/roulette.js';

const gift = (name, totalDiamonds) => ({ kind: 'gift', gift: { name, id: '1' }, totalDiamonds });
const roulettes = [
  { id: 'coins', gifts: [], minCoins: 100, maxCoins: 0, events: [] },
  { id: 'rose', gifts: ['Rose'], minCoins: 0, maxCoins: 0, events: [] },
  { id: 'mid', gifts: [], minCoins: 10, maxCoins: 99, events: ['follow'] },
];

test('ギフト名の指定はコイン数の条件より優先される', () => {
  assert.equal(rouletteFor(roulettes, gift('rose', 500)).id, 'rose');
});

test('コイン数の範囲で選ぶ', () => {
  assert.equal(rouletteFor(roulettes, gift('Doughnut', 30)).id, 'mid');
  assert.equal(rouletteFor(roulettes, gift('Corgi', 299)).id, 'coins');
  assert.equal(rouletteFor(roulettes, gift('GG', 1)), undefined);
});

test('フォローで回るルーレット', () => {
  assert.equal(rouletteFor(roulettes, { kind: 'follow', user: {} }).id, 'mid');
  assert.equal(rouletteFor(roulettes, { kind: 'share', user: {} }), undefined);
});
