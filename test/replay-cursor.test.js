// 公開ウィジェットの連番カーソルが再接続時の重複を除くことを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayCursor } from '../public/widgets/lib/replay-cursor.js';

const event = (id) => ({ type: 'event', event: { id } });

test('直近の連番を除外し、epoch 変更時は新しい seq を基準にする', () => {
  const cursor = new ReplayCursor(2);
  cursor.hello({ epoch: 'first', seq: 0, gap: true });
  assert.equal(cursor.accept(event(1)), true);
  assert.equal(cursor.accept(event(1)), false);
  assert.equal(cursor.accept(event(2)), true);
  assert.equal(cursor.accept(event(3)), true);
  assert.equal(cursor.order.length, 2);
  assert.equal(cursor.lastSeq, 3);

  cursor.hello({ epoch: 'first', seq: 5, gap: true });
  assert.equal(cursor.lastSeq, 3);
  assert.equal(cursor.accept(event(4)), true);
  cursor.hello({ epoch: 'second', seq: 20, gap: true });
  assert.equal(cursor.lastSeq, 20);
  assert.equal(cursor.accept(event(19)), false);
  assert.equal(cursor.accept(event(21)), true);
});
