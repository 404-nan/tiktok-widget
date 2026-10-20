import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rouletteFor, pickWeighted, RouletteEngine } from '../src/roulette.js';
import { EventEmitter } from 'node:events';
import { giftUserName } from '../public/widgets/lib/roulette-gift.js';

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

test('重みに比例して当たる', () => {
  const items = [{ label: 'a', weight: 1 }, { label: 'b', weight: 3 }];
  assert.equal(pickWeighted(items, () => 0.2).label, 'a');
  assert.equal(pickWeighted(items, () => 0.3).label, 'b');
});

test('ギフトした人の名前があるときだけ出す（手動は出さない）', () => {
  assert.equal(giftUserName({ user: { name: 'さくら', avatar: 'https://x/a.jpg' } }), 'さくら');
  assert.equal(giftUserName({ user: { name: '<b>xss</b>' } }), '<b>xss</b>');
  assert.equal(giftUserName({ user: { name: '' } }), '');
  assert.equal(giftUserName({ user: {} }), '');
  assert.equal(giftUserName(null), '');
  assert.equal(giftUserName({}), '');
  const name = giftUserName({ user: { name: 'たろう' } });
  assert.equal(name ? `${name}さんのギフトで回転中` : '', 'たろうさんのギフトで回転中');
  assert.equal(name ? `${name}さんのギフト` : '', 'たろうさんのギフト');
});

test('連打 ×5 は既定で5回まわす（perCount: false なら1回）', () => {
  const spinsFor = (perCount) => {
    const hub = new EventEmitter();
    let spins = 0;
    hub.broadcast = (m) => { if (m.type === 'roulette') spins++; };
    const engine = new RouletteEngine(hub);
    engine.setConfig({ roulettes: { r: { gifts: ['Rose'], duration: 1, hold: 1, items: [{ label: 'a', weight: 1 }], ...(perCount == null ? {} : { perCount }) } } });
    hub.emit('event', { kind: 'gift', gift: { name: 'Rose', id: '1', count: 5 }, totalDiamonds: 5 });
    engine.clear();
    return spins;
  };
  assert.equal(spinsFor(undefined), 5);
  assert.equal(spinsFor(false), 1);
});
