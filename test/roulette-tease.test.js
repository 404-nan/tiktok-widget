// 「当たりそうで当たらない」マス: 結果は変えずに、近くで止まりかけて外れる演出だけを足す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spinFx } from '../src/roulette.js';

const items = ['A', 'B', 'C', { label: '激辛', tease: true }, 'E', 'F'].map((it) => (typeof it === 'string' ? { label: it } : it));
const r = { items, chance: true };

test('隣が「当たりそうで当たらない」なら、その境目ギリギリで外す', () => {
  // 針の下は index の大きいほうから小さいほうへ流れる
  const passed = spinFx(r, 2, () => 0.5); // 激辛(3)を通り過ぎた直後で止まる
  assert.ok(passed.chance && passed.land > 0.9);
  const coming = spinFx(r, 4, () => 0.5); // 次が激辛(3)なのに、その手前で止まる
  assert.ok(coming.chance && coming.land < 0.1);
});

test('2〜3つ手前なら、その上で止まりかけてから流れる(結果は変えない)', () => {
  const fx = spinFx(r, 1, () => 0.5);
  assert.deepEqual(fx.tease, { at: 3 });
  assert.ok(fx.chance);
});

test('結果がそのマス自身や、遠いとき、演出を切っているときは何もしない', () => {
  assert.equal(spinFx(r, 3, () => 0.5).tease, null);
  assert.equal(spinFx({ ...r, chance: false }, 1, () => 0.5).tease, null);
});
