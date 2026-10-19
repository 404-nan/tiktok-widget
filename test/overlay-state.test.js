// 実際の compact メッセージ形で、クライアント側の状態復元を確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStatePatch } from '../public/widgets/lib/overlay.js';

test('compact 差分はランキングの並び替えを反映する', () => {
  const previous = { topLikers: [{ key: 'a', likes: 1 }, { key: 'b', likes: 2 }] };
  const patch = { topLikers: { order: ['b', 'a'], changed: [{ key: 'b', likes: 3 }] } };
  assert.deepEqual(mergeStatePatch(previous, null, patch).topLikers, [{ key: 'b', likes: 3 }, { key: 'a', likes: 1 }]);
});

test('compact 差分は圏外から入った行を追加する', () => {
  const previous = { topGifters: [{ key: 'a', diamonds: 10 }] };
  const patch = { topGifters: { order: ['b', 'a'], changed: [{ key: 'b', diamonds: 20 }] } };
  assert.deepEqual(mergeStatePatch(previous, null, patch).topGifters[0], { key: 'b', diamonds: 20 });
});

test('hello より先に届いた compact event でも変更行を残す', () => {
  const patch = { topGifters: { order: ['b'], changed: [{ key: 'b', diamonds: 20 }] } };
  assert.deepEqual(mergeStatePatch(null, null, patch).topGifters, [{ key: 'b', diamonds: 20 }]);
});
