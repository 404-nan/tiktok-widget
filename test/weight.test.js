import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHT_INPUT, parseWeight, stepUp } from '../public/dashboard/weight.js';

test('当たりやすさの ▲ は 1 → 2 → 3 と整数で進む（前は 1 → 1.1 → 2.1 になっていた）', () => {
  let v = 1;
  const seen = [];
  for (let i = 0; i < 3; i++) seen.push((v = stepUp(v, WEIGHT_INPUT)));
  assert.deepEqual(seen, [2, 3, 4]);
  assert.equal(stepUp(3, WEIGHT_INPUT, -1), 2);
  // 前の設定（min 0.1・step 1）だと、ずれていたことの確認
  assert.equal(stepUp(1, { min: '0.1', step: '1' }), 1.1);
});

test('当たりやすさは 0 以下や空では保存しない。小数は手で入れられる', () => {
  assert.equal(parseWeight('2'), 2);
  assert.equal(parseWeight('0.5'), 0.5);
  assert.equal(parseWeight('0'), null);
  assert.equal(parseWeight(''), null);
  assert.equal(parseWeight('-1'), null);
  assert.equal(parseWeight('abc'), null);
});
