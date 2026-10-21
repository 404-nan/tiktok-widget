import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rouletteFor, pickWeighted, RouletteEngine, spinFx, CHANCE_MS } from '../src/roulette.js';
import { normalize } from '../src/config.js';
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
  const spinsFor = (perCount, count = 5) => {
    const hub = new EventEmitter();
    let spins = 0;
    hub.broadcast = (m) => { if (m.type === 'roulette') spins++; };
    const engine = new RouletteEngine(hub);
    engine.setConfig({ roulettes: { r: { gifts: ['Rose'], duration: 1, hold: 1, items: [{ label: 'a', weight: 1 }], ...(perCount == null ? {} : { perCount }) } } });
    hub.emit('event', { kind: 'gift', gift: { name: 'Rose', id: '1', count }, totalDiamonds: 5 });
    engine.clear();
    return spins;
  };
  assert.equal(spinsFor(undefined), 5);
  assert.equal(spinsFor(false), 1);
  assert.equal(spinsFor(undefined, 99), 99); // 上限なし。投げた分は全部回す
});

test('win: true の項目が出ると、結果に win が付く（カットインの大当たり用）', async () => {
  const { config, errors, warnings } = normalize({ roulettes: { r: { duration: 1, hold: 1, items: [{ label: '大当たり', win: true }] } } });
  assert.deepEqual([errors, warnings.filter((w) => w.includes('win'))], [[], []]);
  assert.equal(config.roulettes.r.items[0].win, true);
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const engine = new RouletteEngine(hub);
  engine.setConfig(config);
  assert.equal(engine.spin('r').win, true);
  engine.clear();
});

// 0: ハズレ / 1: 当たり / 2: ハズレ / 3: ハズレ / 4: ハズレ。針の下は index の大きいほうから小さいほうへ流れる
const ring = { items: [{ label: 'a' }, { label: '当たり', win: true }, { label: 'b' }, { label: 'c' }, { label: 'd' }] };
const fixed = (x) => () => x;

test('当たりの隣はギリギリ演出: 次が当たりなら手前で、通り過ぎたなら抜けたところで止まる', () => {
  const before = spinFx(ring, 2, fixed(0.5)); // 次に来るのが 1（当たり）
  assert.ok(before.chance);
  assert.ok(before.land < 0.1);
  const after = spinFx(ring, 0, fixed(0.5)); // 通り過ぎたのが 1（当たり）
  assert.ok(after.chance);
  assert.ok(after.land > 0.9);
  assert.equal(after.kakutei, null); // ハズレに確定演出は出ない
});

test('当たりから遠い項目・当たりの項目がない・chance: false は普通に止まる', () => {
  const far = spinFx(ring, 3, fixed(0.5));
  assert.equal(far.chance, null);
  assert.ok(far.land > 0.1 && far.land < 0.9);
  assert.equal(spinFx({ items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] }, 0, fixed(0.5)).chance, null);
  assert.equal(spinFx({ ...ring, chance: false }, 2, fixed(0.5)).chance, null);
});

test('当たりはときどきギリギリで入り、ときどき確定演出が付く', () => {
  const lucky = spinFx(ring, 1, fixed(0.1));
  assert.ok(lucky.chance);
  assert.ok(lucky.land > 0.9); // 隣からギリギリ入る
  assert.ok(lucky.kakutei);
  const plain = spinFx(ring, 1, fixed(0.9));
  assert.equal(plain.chance, null);
  assert.equal(plain.kakutei, null);
});

test('ギリギリ演出のぶん、結果が出るのが遅れる', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const engine = new RouletteEngine(hub, { random: fixed(0.5) });
  // 2（当たりの隣）だけが出るようにする
  const items = ring.items.map((it, i) => ({ ...it, weight: i === 2 ? 1 : 0 }));
  engine.setConfig({ roulettes: { r: { duration: 2, hold: 1, items } } });
  engine.active = 'r';
  const spin = engine.spin('r', null);
  engine.clear();
  assert.equal(spin.index, 2);
  assert.ok(spin.chance);
  assert.equal(spin.spinMs, 2000 + CHANCE_MS);
});

test('ルーレットの形（casino / slot / judo）を設定でき、結果に形が付く（カットインの見た目用）', () => {
  for (const style of ['casino', 'slot', 'slot3', 'judo']) {
    const { config, errors } = normalize({ roulettes: { r: { style, duration: 1, hold: 1, items: [{ label: '当たり', win: true }, 'ハズレ'] } } });
    assert.deepEqual(errors, []);
    assert.equal(config.roulettes.r.style, style);
    const hub = new EventEmitter();
    hub.broadcast = () => {};
    const engine = new RouletteEngine(hub);
    engine.setConfig(config);
    assert.equal(engine.spin('r').style, style);
    engine.clear();
  }
});
