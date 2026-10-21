// 連打ギフトの終わりの合図が来ないまま途切れても、投げた分を数え落とさないかを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { GiftStreaks } from '../src/gift-streaks.js';

const rose = (repeatCount, repeatEnd = false) => ({ user: { userId: 'u1' }, giftId: '5655', repeatCount, repeatEnd });

test('終わりの合図が来れば、そのまま1回だけ出す', () => {
  const out = [];
  const s = new GiftStreaks((d) => out.push(d), { idleMs: 60000 });
  s.progress(rose(1));
  s.progress(rose(5));
  assert.deepEqual(s.end(rose(5, true)), rose(5, true));
  s.flushAll();
  assert.deepEqual(out, []);
});

test('切れたら最後に見えた個数で出し、あとから来た終わりの合図は増えた分だけ出す', () => {
  const out = [];
  const s = new GiftStreaks((d) => out.push(d), { idleMs: 60000 });
  s.progress(rose(3));
  s.flushAll();
  assert.deepEqual(out, [{ ...rose(3), repeatEnd: true }]);
  s.progress(rose(7)); // つなぎ直したあとも同じ連打が続いた
  assert.deepEqual(s.end(rose(7, true)), rose(4, true));
});

test('切れた連打の続きがまた切れても、増えた分だけ出す', () => {
  const out = [];
  const s = new GiftStreaks((d) => out.push(d), { idleMs: 60000 });
  s.progress(rose(3));
  s.flushAll();
  s.progress(rose(8));
  s.flushAll();
  assert.deepEqual(out.map((d) => d.repeatCount), [3, 5]);
  s.progress(rose(1)); // 個数が戻ったら新しい連打
  assert.deepEqual(s.end(rose(2, true)), rose(2, true));
});

test('切れたあと増えずに終わりの合図が来たら、二重に出さない', () => {
  const out = [];
  const s = new GiftStreaks((d) => out.push(d), { idleMs: 60000 });
  s.progress(rose(3));
  s.flushAll();
  assert.equal(s.end(rose(3, true)), null);
});

test('何も来なくなったら、待ち時間のあとに出す', async () => {
  const out = [];
  const s = new GiftStreaks((d) => out.push(d), { idleMs: 10 });
  s.progress(rose(2));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(out[0].repeatCount, 2);
});
