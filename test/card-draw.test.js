// カードめくり: 見せる当たりの枚数は確率に合わせる。番号はギフトを送った本人のコメントだけで決まる。結果は確率で決まる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CardDraw, deckOf, pickNumber } from '../src/card-draw.js';

test('見せる当たりの枚数は 枚数×確率(最低1枚、全部当たりにはしない)', () => {
  assert.equal(deckOf(8, 0.2, () => 0.5).filter(Boolean).length, 2);
  assert.equal(deckOf(8, 0.01, () => 0.5).filter(Boolean).length, 1);
  assert.equal(deckOf(4, 1, () => 0.5).filter(Boolean).length, 3);
  assert.equal(deckOf(6, 0, () => 0.5).filter(Boolean).length, 0);
});

test('コメントから番号を拾う(全角も)。範囲の外は無視', () => {
  assert.equal(pickNumber('3番で！', 8), 3);
  assert.equal(pickNumber('５', 8), 5);
  assert.equal(pickNumber('12', 8), null);
  assert.equal(pickNumber('どれにしよう', 8), null);
});

test('ギフトで始まり、本人が番号を言うとめくれる。ほかの人のコメントでは動かない', async () => {
  const sent = [];
  const hub = { broadcast: (m) => sent.push(m) };
  const draw = new CardDraw(hub, { random: () => 0.1 });
  draw.setConfig({ minCoins: 10, winRate: 0.5, showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  draw.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Rose' }, user: { id: 'u1', name: 'ゆず' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(draw.phase, 'pick');
  draw.onEvent({ kind: 'chat', text: '2', user: { id: 'u2', name: 'ほかの人' } });
  assert.equal(draw.phase, 'pick');
  draw.onEvent({ kind: 'chat', text: '2番', user: { id: 'u1', name: 'ゆず' } });
  assert.equal(draw.phase, 'reveal');
  const last = sent.at(-1);
  assert.equal(last.round.picked, 2);
  assert.deepEqual(last.round.result, { win: true, label: '当たり' }); // random 0.1 < 0.5
  assert.equal(last.round.faces, null); // 混ぜたあとは並びを渡さない
  draw.close();
});
