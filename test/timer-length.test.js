import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timerGiftLength, TIMER_COIN_SECONDS } from '../public/dashboard/timer-length.js';

test('目安: 100 コインは 60 秒、1 コインは 1 秒、30000 コインは 300 分', () => {
  assert.equal(TIMER_COIN_SECONDS, 0.6);

  // 100 × 0.6 = 60 秒。60 秒以上でちょうど分になるので、欄は 1 分
  const hundred = timerGiftLength(100);
  assert.equal(hundred.seconds, 60);
  assert.equal(hundred.amount, 1);
  assert.equal(hundred.unit, 'minutes');

  // 0.6 秒は 1 秒未満なので 1 秒
  const one = timerGiftLength(1);
  assert.equal(one.seconds, 1);
  assert.equal(one.amount, 1);
  assert.equal(one.unit, 'seconds');

  // 30000 × 0.6 = 18000 秒 = 300 分
  const huge = timerGiftLength(30000);
  assert.equal(huge.seconds, 18_000);
  assert.equal(huge.amount, 300);
  assert.equal(huge.unit, 'minutes');
});

test('60 秒未満や、分で割り切れない長さは秒のまま', () => {
  const half = timerGiftLength(50); // 30 秒
  assert.equal(half.seconds, 30);
  assert.equal(half.unit, 'seconds');
  assert.equal(half.amount, 30);

  const odd = timerGiftLength(110); // 66 秒。60 で割り切れない
  assert.equal(odd.seconds, 66);
  assert.equal(odd.unit, 'seconds');
  assert.equal(odd.amount, 66);
});
