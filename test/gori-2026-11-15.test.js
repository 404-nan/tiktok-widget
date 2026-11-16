// 2026-11-15 の直し:
// - 天井の対象の重みが 0 でも、天井に届けばその運勢が出る（重み 0 は「通常は出ない、天井でのみ出す」）
// - おみくじ10連（専用ギフト／連打のまとめ。保証は付けない）
// - カードめくり: 結果の段階では並びを渡し、外れたら当たりの場所が分かる。結果は記録口へ渡る
import test from 'node:test';
import assert from 'node:assert/strict';
import { Gacha } from '../src/gacha.js';
import { CardDraw } from '../src/card-draw.js';
import { defaultsFor } from '../src/schema.js';

function setupOmikuji(over = {}, random = () => 0.999) {
  const sent = [];
  const omikuji = new Gacha({ broadcast: (m) => sent.push(m) }, { name: 'omikuji', random });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, displayMode: 'short', ...over });
  return { omikuji, sent };
}

const rose = (over = {}) => ({
  kind: 'gift',
  totalDiamonds: 10,
  gift: { id: '1', name: 'Rose' },
  user: { id: 'u1', name: 'ゆず' },
  ...over,
});

function drawOnce(t, omikuji, ev) {
  omikuji.onEvent(ev);
  t.mock.timers.tick(400);
  assert.equal(omikuji.phase, 'reveal');
  const seen = { tier: omikuji.tier?.id, forced: omikuji.forced };
  t.mock.timers.tick(2550);
  t.mock.timers.tick(500);
  t.mock.timers.tick(100);
  assert.equal(omikuji.phase, 'idle');
  return seen;
}

test('重み 0 の大吉は、天井に届いても出ない（天井は発動せず、数えは増え続ける）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = [
    { id: 'daikichi', label: '大吉', weight: 0, pity: true },
    { id: 'kichi', label: '吉', weight: 100, pity: false },
  ];
  const { omikuji } = setupOmikuji({ tiers, pity: 2 }, () => 0.5);
  assert.equal(drawOnce(t, omikuji, rose()).tier, 'kichi');
  assert.equal(drawOnce(t, omikuji, rose()).tier, 'kichi');
  const third = drawOnce(t, omikuji, rose());
  assert.equal(third.tier, 'kichi');
  assert.equal(third.forced, false);
  assert.equal(omikuji.snapshot().pityCount, 3);
  omikuji.close();
});

test('10連ギフトで10回ぶんがまとめて出る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setupOmikuji({ tenGifts: ['TenRose'] });
  omikuji.onEvent(rose({ gift: { id: '2', name: 'TenRose' } }));
  assert.equal(omikuji.phase, 'ten');
  const snap = omikuji.snapshot();
  assert.equal(snap.results.length, 10);
  assert.ok(snap.results.every((r) => r.tier && typeof r.tier.label === 'string'));
  t.mock.timers.tick(6000);
  assert.equal(omikuji.phase, 'done');
  t.mock.timers.tick(500);
  t.mock.timers.tick(100);
  assert.equal(omikuji.phase, 'idle');
  omikuji.close();
});

test('通常ギフトを指定している設定でも、10連ギフトは10連になる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  // 彼の実設定の形: 通常は Rosa だけ、10連は Galaxy
  const { omikuji } = setupOmikuji({ gifts: ['Rosa'], tenGifts: ['Galaxy'] });
  omikuji.onEvent(rose({ gift: { id: '2', name: 'Galaxy' } }));
  assert.equal(omikuji.phase, 'ten');
  assert.equal(omikuji.snapshot().results.length, 10);
  omikuji.close();
});

test('連打12回は、10連まとめ1つと通常2回になる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setupOmikuji({ tenBatch: true });
  omikuji.onEvent(rose({ totalDiamonds: 120, gift: { id: '1', name: 'Rose', count: 12 } }));
  assert.equal(omikuji.phase, 'ten');
  assert.equal(omikuji.snapshot().pending, 2);
  for (let i = 0; i < 60 && (omikuji.phase !== 'idle' || omikuji.seq < 3); i++) t.mock.timers.tick(500);
  assert.equal(omikuji.phase, 'idle');
  assert.equal(omikuji.seq, 3);
  omikuji.close();
});

test('10連に保証はない: 天井の対象が出なくても、最後の1つは通常の抽選のまま', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setupOmikuji({ tenGifts: ['TenRose'] }, () => 0.999);
  omikuji.onEvent(rose({ gift: { id: '2', name: 'TenRose' } }));
  const results = omikuji.snapshot().results;
  assert.equal(results.length, 10);
  assert.ok(results.every((r) => r.forced === false), '強制で差し替えられる結果はない');
  assert.notEqual(results.at(-1).tier.id, 'daikichi');
  assert.equal(omikuji.snapshot().pityCount, 10, '数えは10回ぶん進み、保証で 0 には戻らない');
  omikuji.close();
});

test('10連でも、重み 0 の大吉は出ない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = [
    { id: 'daikichi', label: '大吉', weight: 0, pity: true },
    { id: 'kichi', label: '吉', weight: 100, pity: false },
  ];
  const { omikuji } = setupOmikuji({ tiers, tenGifts: ['TenRose'] }, () => 0.5);
  omikuji.onEvent(rose({ gift: { id: '2', name: 'TenRose' } }));
  const results = omikuji.snapshot().results;
  assert.equal(results.length, 10);
  assert.ok(results.every((r) => r.tier.id === 'kichi' && r.forced === false));
  omikuji.close();
});

test('テストの10連では天井の数えが進まない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setupOmikuji({ tenGifts: ['TenRose'], pity: 900 }, () => 0.5);
  omikuji.onEvent(rose({ gift: { id: '2', name: 'TenRose' }, test: true }));
  assert.equal(omikuji.phase, 'ten');
  assert.equal(omikuji.snapshot().pityCount, 0);
  omikuji.close();
});

test('カードめくり: 外れたら結果の段階で並びが渡り、選んだ位置はハズレに合う', async () => {
  const sent = [];
  const results = [];
  const queue = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9]; // 最初の7つは並び替え、最後は結果（0.9 → ハズレ）
  const draw = new CardDraw({ broadcast: (m) => sent.push(m) }, {
    random: () => (queue.length ? queue.shift() : 0.5),
    onResult: (r) => results.push(r),
  });
  draw.setConfig({ minCoins: 10, winRate: 0.5, count: 8, showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0, winLabel: '大吉', loseLabel: '大凶' });
  draw.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Rose' }, user: { id: 'u1', name: 'ゆず' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'pick');
  const pickMsg = sent.filter((m) => m.phase === 'pick').at(-1);
  assert.equal(pickMsg.round.faces, null); // 配ったあとは並びを渡さない
  draw.onEvent({ kind: 'chat', text: '1', user: { id: 'u1', name: 'ゆず' } });
  assert.equal(draw.phase, 'reveal');
  const last = sent.at(-1);
  assert.equal(last.round.result.win, false);
  assert.deepEqual(last.round.faces, [false, true, true, false, true, false, true, false]);
  assert.equal(results.length, 1);
  assert.equal(results[0].win, false);
  assert.equal(results[0].label, '大凶');
  assert.equal(results[0].user, 'ゆず');
  assert.equal(results[0].test, false);
  draw.close();
});

test('カードめくり: テスト送信のギフトは、結果にテスト印が付く（記録側で除くため）', async () => {
  const results = [];
  const draw = new CardDraw({ broadcast: () => {} }, { random: () => 0.1, onResult: (r) => results.push(r) });
  draw.setConfig({ minCoins: 10, winRate: 0.5, showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  draw.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Rose' }, user: { id: 'u1', name: 'ゆず' }, test: true });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'pick');
  draw.onEvent({ kind: 'chat', text: '2', user: { id: 'u1', name: 'ゆず' } });
  assert.equal(draw.phase, 'reveal');
  assert.equal(results.length, 1);
  assert.equal(results[0].test, true);
  draw.close();
});
