import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reelPlan } from '../public/widgets/lib/reel-plan.js';

// 0: ハズレ / 1: 当たり / 2: 歌う / 3: 変顔
const items = [{ label: 'ハズレ' }, { label: '当たり', win: true }, { label: '歌う' }, { label: '変顔' }];

test('3本: ふだんは3本とも結果でそろい、真ん中に止まる', () => {
  assert.deepEqual(reelPlan(items, 3, { land: 0.3 }, 3), { stops: [3, 3, 3], reach: false, land: 0.5 });
});

test('3本: 当たりの隣のギリギリ演出は、当たりでリーチになって最後の1本が外れる', () => {
  const next = reelPlan(items, 2, { chance: 'red', land: 0.05 }, 3); // 次に来るのが当たり
  assert.deepEqual(next, { stops: [1, 1, 2], reach: true, land: 0.05 });
  const passed = reelPlan(items, 0, { chance: 'blue', land: 0.95 }, 3); // 通り過ぎたのが当たり
  assert.deepEqual(passed.stops, [1, 1, 0]);
});

test('3本: 当たりのギリギリ演出は、3本そろう', () => {
  assert.deepEqual(reelPlan(items, 1, { chance: 'gold', land: 0.95 }, 3), { stops: [1, 1, 1], reach: true, land: 0.95 });
});

test('1本: 止まる位置はサーバーの land のまま', () => {
  assert.deepEqual(reelPlan(items, 3, { land: 0.3 }, 1), { stops: [3], reach: false, land: 0.3 });
});
