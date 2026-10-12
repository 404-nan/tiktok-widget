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

test('ギフトの検索は、ひらがな・カタカナ・英語の大文字小文字・数字の ID でも当たる', async () => {
  const { norm } = await import('../public/dashboard/gift-picker.js');
  assert.equal(norm('バラ'), norm('ばら'));
  assert.equal(norm('Rose'), 'rose');
  assert.equal(norm('ＲＯＳＥ'), 'rose');
  assert.equal(norm(5655), '5655');
});

test('配信中のテストギフトでもルーレットは回るが、結果は記録へ渡さない', async () => {
  const { EventEmitter } = await import('node:events');
  const { RouletteEngine } = await import('../src/roulette.js');
  const hub = new EventEmitter(); const sent = []; hub.broadcast = (m) => sent.push(m);
  const eng = new RouletteEngine(hub);
  eng.setConfig({ roulettes: { r: { trigger: 'gift', gifts: [], duration: 0, hold: 0, items: [{ label: 'A', weight: 1 }] } } });
  let emitted = 0; hub.on('roulette', () => emitted++);
  eng.spin('r', null, { dry: true });
  assert.ok(sent.some((m) => m.type === 'roulette'));
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(emitted, 0); eng.clear?.();
});

test('ギフト一覧は控えの全ギフトで補う（数百件・日本語名つき）', async () => {
  const { bundledGifts } = await import('../src/gifts.js');
  const all = bundledGifts();
  assert.ok(all.length > 500);
  assert.ok(all.every((g) => g.id && g.name && g.nameJa));
});
