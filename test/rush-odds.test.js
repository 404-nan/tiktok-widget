import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { normalize } from '../src/config.js';
import { effectiveItems, pickWeighted, RouletteEngine } from '../src/roulette.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('rushOdds と rushWeight が無くても、今までと同じ設定になる', () => {
  const { config, errors, warnings } = normalize({ roulettes: { a: { items: ['歌う*2', { label: '変顔' }] } } });
  assert.deepEqual(errors, []);
  assert.equal(config.roulettes.a.rushOdds, false);
  assert.deepEqual(config.roulettes.a.items, [
    { label: '歌う', weight: 2 },
    { label: '変顔', weight: 1 },
  ]);
  assert.equal(config.roulettes.a.items[0].rushWeight, undefined);
  assert.ok(!warnings.some((w) => w.includes('rushWeight') || w.includes('rushOdds')));
});

test('rushWeight は 0 以上なら残り、空欄は書かなかったことにする', () => {
  const { config, errors, warnings } = normalize({
    roulettes: {
      a: {
        rushOdds: 'true',
        items: [
          { label: 'A', weight: 2, rushWeight: 5 },
          { label: 'B', weight: 1, rushWeight: 0 },
          { label: 'C', rushWeight: '' },
          { label: 'D', weight: '1.5', rushWeight: '2.5' },
          { label: 'E', mystery: 1 },
        ],
      },
    },
  });
  assert.deepEqual(errors, []);
  assert.equal(config.roulettes.a.rushOdds, true);
  assert.equal(config.roulettes.a.items[0].weight, 2);
  assert.equal(config.roulettes.a.items[0].rushWeight, 5);
  assert.equal(config.roulettes.a.items[1].rushWeight, 0);
  assert.equal(config.roulettes.a.items[1].weight, 1);
  assert.equal(config.roulettes.a.items[2].rushWeight, undefined);
  assert.equal(config.roulettes.a.items[2].weight, 1);
  assert.equal(config.roulettes.a.items[3].weight, 1.5);
  assert.equal(config.roulettes.a.items[3].rushWeight, 2.5);
  assert.ok(warnings.some((w) => w.includes('mystery')));
  assert.ok(!warnings.some((w) => w.includes('rushWeight')));
});

test('rushWeight が負や数値でないときは日本語でエラーにする', () => {
  const bad = normalize({ roulettes: { a: { items: [{ label: 'A', rushWeight: -1 }, { label: 'B', rushWeight: 'たくさん' }] } } });
  assert.ok(bad.errors.some((e) => e.includes('items[0].rushWeight') && e.includes('0 以上の数にしてください')));
  assert.ok(bad.errors.some((e) => e.includes('items[1].rushWeight') && e.includes('0 以上の数にしてください')));
  assert.equal(bad.config.roulettes.a.items[0].rushWeight, undefined);
  assert.equal(bad.config.roulettes.a.items[0].weight, 1);
  assert.equal(bad.config.roulettes.a.rushOdds, false);
});

test('effectiveItems は RUSH 中かつ rushOdds のときだけ weight を差し替える', () => {
  const raw = { label: 'A', weight: 1, rushWeight: 9 };
  const r = { rushOdds: true, items: [raw, { label: 'B', weight: 3 }, { label: 'C', weight: 2, rushWeight: 0 }] };
  const off = effectiveItems(r, false);
  assert.equal(off[0].weight, 1);
  assert.equal(off[2].weight, 2);
  assert.equal(raw.weight, 1);
  const noFlag = effectiveItems({ ...r, rushOdds: false }, true);
  assert.equal(noFlag[0].weight, 1);
  assert.equal(noFlag[1].weight, 3);
  const on = effectiveItems(r, true);
  assert.equal(on[0].weight, 9);
  assert.equal(on[0].baseWeight, 1);
  assert.equal(on[0].index, 0);
  assert.equal(on[1].weight, 3); // rushWeight が無いのでいつものまま
  assert.equal(on[1].index, 1);
  assert.equal(on[2].weight, 0);
  assert.equal(on[2].index, 2);
  assert.equal(raw.weight, 1);
});

test('weight 0 は飛ばし、合計 0 なら通常の weight に戻す', () => {
  const skipped = [
    { label: 'A', weight: 0, index: 0, baseWeight: 1 },
    { label: 'B', weight: 4, index: 1, baseWeight: 1 },
  ];
  assert.equal(pickWeighted(skipped, () => 0).label, 'B');
  assert.equal(pickWeighted(skipped, () => 0.99).index, 1);

  const fallen = effectiveItems({
    rushOdds: true,
    items: [
      { label: 'A', weight: 1, rushWeight: 0 },
      { label: 'B', weight: 3, rushWeight: 0 },
    ],
  }, true);
  assert.equal(fallen[0].weight, 0);
  assert.equal(fallen[1].weight, 0);
  assert.equal(pickWeighted(fallen, () => 0.2).label, 'A');
  assert.equal(pickWeighted(fallen, () => 0.3).label, 'B');
  assert.equal(pickWeighted(fallen, () => 0.2).index, 0);
});

test('RUSH 中の重みどおりに当たる（10万回・±1.5%）', () => {
  const items = effectiveItems({
    rushOdds: true,
    items: [
      { label: 'A', weight: 1, rushWeight: 1 },
      { label: 'B', weight: 1, rushWeight: 3 },
      { label: 'C', weight: 5, rushWeight: 0 },
    ],
  }, true);
  const n = 100000;
  const counts = { A: 0, B: 0, C: 0 };
  const random = mulberry32(0xc0ffee);
  for (let i = 0; i < n; i++) counts[pickWeighted(items, random).label]++;
  assert.equal(counts.C, 0);
  assert.ok(Math.abs(counts.A / n - 0.25) < 0.015, `A ${(counts.A / n) * 100}%`);
  assert.ok(Math.abs(counts.B / n - 0.75) < 0.015, `B ${(counts.B / n) * 100}%`);

  // 全部 0 のときは通常の 1:3 に戻る
  const back = effectiveItems({
    rushOdds: true,
    items: [
      { label: 'A', weight: 1, rushWeight: 0 },
      { label: 'B', weight: 3, rushWeight: 0 },
    ],
  }, true);
  const again = { A: 0, B: 0 };
  const random2 = mulberry32(7);
  for (let i = 0; i < n; i++) again[pickWeighted(back, random2).label]++;
  assert.ok(Math.abs(again.A / n - 0.25) < 0.015, `fallback A ${(again.A / n) * 100}%`);
  assert.ok(Math.abs(again.B / n - 0.75) < 0.015, `fallback B ${(again.B / n) * 100}%`);
});

test('エンジンは RUSH の状態で確率を切り替え、当たりの位置は元の並び', (t) => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const rush = { state: { active: false }, snapshot() { return { active: this.state.active }; } };
  const eng = new RouletteEngine(hub, {
    isRushActive: () => rush.snapshot().active === true || rush.state.active === true,
  });
  t.after(() => eng.clear());
  const items = [
    { label: 'いつも', weight: 1, rushWeight: 0 },
    { label: '確変', weight: 0, rushWeight: 4 },
  ];
  eng.setConfig({ roulettes: { r: { rushOdds: true, duration: 0, hold: 0, items } } });

  const off = eng.spin('r');
  assert.equal(off.label, 'いつも');
  assert.equal(off.index, 0);
  assert.equal(items[0].weight, 1);

  rush.state.active = true;
  const on = eng.spin('r');
  assert.equal(on.label, '確変');
  assert.equal(on.index, 1);

  eng.setIsRushActive(() => false);
  assert.equal(eng.spin('r').index, 0);

  // rushOdds が false なら、RUSH 中でもいつもの weight
  eng.setIsRushActive(() => true);
  eng.setConfig({ roulettes: { r: { rushOdds: false, duration: 0, hold: 0, items } } });
  const plain = eng.spin('r');
  assert.equal(plain.label, 'いつも');
  assert.equal(plain.index, 0);
});
