import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giftNameJa } from '../public/widgets/lib/gift-names.js';
import { giftMatches, giftDisplayName } from '../src/gifts.js';

test('Heart Me は ID・英語名・空白なしのどれでもハートミー', () => {
  assert.equal(giftNameJa('7934'), 'ハートミー');
  assert.equal(giftNameJa('Heart Me'), 'ハートミー');
  assert.equal(giftNameJa('HeartMe'), 'ハートミー');
  assert.equal(giftNameJa({ id: '7934', name: 'Heart Me' }), 'ハートミー');
  assert.equal(giftDisplayName({ id: '7934', name: 'Heart Me' }), 'ハートミー');
  assert.equal(giftDisplayName({ name: 'HeartMe' }), 'ハートミー');
});

test('Doughnut の表示はドーナツ', () => {
  assert.equal(giftNameJa('Doughnut'), 'ドーナツ');
  assert.equal(giftNameJa({ id: '5879', name: 'Doughnut' }), 'ドーナツ');
  assert.equal(giftDisplayName({ id: '5879', name: 'Doughnut' }), 'ドーナツ');
});

test('ルーレットのヒントは日本語名で出す', async () => {
  globalThis.window = globalThis;
  globalThis.location = { pathname: '/', search: '' };
  const { hintFor } = await import('../public/widgets/lib/roulette.js');
  assert.equal(hintFor({ gifts: ['HeartMe'], minCoins: 0, events: [], name: 'ガチャ' }), 'ハートミーでガチャ');
});

test('設定の HeartMe は実ギフト Heart Me に合う', () => {
  assert.equal(giftMatches({ id: '7934', name: 'Heart Me' }, ['HeartMe']), true);
  assert.equal(giftMatches({ id: '7934', name: 'HeartMe' }, ['Heart Me']), true);
});
