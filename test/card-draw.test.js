// カードめくり: 見せる当たりの枚数は確率に合わせる(確率とは別に並びに出す設定もある)。番号はギフトを送った本人のコメントだけで決まる。結果は裏の設定（確率、または実際に当たるカードの枚数）だけで決まる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CardDraw, deckOf, pickNumber, realsOf } from '../src/card-draw.js';
import { defaultsFor } from '../src/schema.js';

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
  // show(0ms) → shuffle(0ms) → pick: setTimeout(0) が3つチェインされるため、
  // 全体テストの負荷時にも確実に消化される待ち時間にする
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'pick');
  draw.onEvent({ kind: 'chat', text: '2', user: { id: 'u2', name: 'ほかの人' } });
  assert.equal(draw.phase, 'pick');
  draw.onEvent({ kind: 'chat', text: '2番', user: { id: 'u1', name: 'ゆず' } });
  assert.equal(draw.phase, 'reveal');
  const last = sent.at(-1);
  assert.equal(last.round.picked, 2);
  assert.deepEqual(last.round.result, { win: true, label: '当たり' }); // random 0.1 < 0.5
  assert.ok(Array.isArray(last.round.faces)); // 結果の段階では並びを渡す（外れたとき、どこに当たりがあったか見せるため。配っている間は渡さない）
  draw.close();
});

test('確率 0 でもラウンドは最後まで回り、結果はハズレになる', async () => {
  const sent = [];
  const hub = { broadcast: (m) => sent.push(m) };
  const draw = new CardDraw(hub, { random: () => 0.1 });
  draw.setConfig({ minCoins: 10, winRate: 0, count: 12, winLabel: '大吉', loseLabel: '大凶', showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  draw.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Corgi' }, user: { id: 'u1', name: 'ゆず' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'pick');
  assert.equal(draw.round.deck.filter(Boolean).length, 0);
  draw.onEvent({ kind: 'chat', text: '3番', user: { id: 'u1', name: 'ゆず' } });
  assert.equal(draw.phase, 'reveal');
  const last = sent.at(-1);
  assert.deepEqual(last.round.result, { win: false, label: '大凶' });
  draw.close();
});

test('テスト送信のギフトで始まったラウンドには、最初から最後まで放送にテストの印が付く', async () => {
  const sent = [];
  const hub = { broadcast: (m) => sent.push(m) };
  const draw = new CardDraw(hub, { random: () => 0.1 });
  draw.setConfig({ minCoins: 10, winRate: 0.5, showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 30, doneMs: 10 });
  draw.onEvent({ kind: 'gift', test: true, totalDiamonds: 10, gift: { id: '1', name: 'Rose' }, user: { id: 'u1', name: 'ゆず' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'pick');
  draw.onEvent({ kind: 'chat', text: '2', user: { id: 'u1', name: 'ゆず' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'idle');
  const phases = sent.map((m) => m.phase);
  for (const p of ['show', 'pick', 'reveal', 'done', 'idle']) assert.ok(phases.includes(p), p + ' の知らせがある');
  assert.ok(sent.every((m) => m.test === true), 'テストのラウンドの放送は全部 test つき');
  draw.close();
});

test('本物のラウンド中はテストの開始を断り、テスト中は本物が割り込む', async () => {
  const sent = [];
  const hub = { broadcast: (m) => sent.push(m) };
  const draw = new CardDraw(hub, { random: () => 0.1 });
  draw.setConfig({ minCoins: 10, winRate: 0.5, showMs: 10000, shuffleMs: 10000, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  draw.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Rose' }, user: { id: 'u1', name: 'ゆず' } });
  assert.equal(draw.phase, 'show');
  const refused = draw.start({ kind: 'test', source: 'test', test: true, user: null });
  assert.equal(refused.ok, false);
  assert.equal(draw.pending.length, 0);
  draw.close();

  const draw2 = new CardDraw(hub, { random: () => 0.1 });
  draw2.setConfig({ minCoins: 10, winRate: 0.5, showMs: 10000, shuffleMs: 10000, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  const t = draw2.start({ kind: 'test', source: 'test', test: true, user: null });
  assert.equal(t.ok, true);
  assert.equal(draw2.trigger.test, true);
  draw2.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Rose' }, user: { id: 'u9', name: '本物' } });
  assert.equal(draw2.trigger.test, false);
  assert.equal(draw2.timers.size, 1, '打ち切ったテストのタイマーは残らない（残るのは本物のぶんだけ）');
  assert.equal(draw2.trigger.user.name, '本物');
  draw2.close();
});

test('大当たりを並びに出すときは、確率とは別に、枚数を設定で決められる', () => {
  assert.equal(deckOf(6, 0, () => 0.5).filter(Boolean).length, 0, '設定が無ければ今までどおり確率で決まる');
  assert.equal(deckOf(6, 0, () => 0.5, true).filter(Boolean).length, 1, '既定は1枚');
  assert.equal(deckOf(8, 0.2, () => 0.5, true).filter(Boolean).length, 1, '確率が高くても、並びに出す枚数は設定どおり');
  assert.equal(deckOf(8, 0.2, () => 0.5, true, 3).filter(Boolean).length, 3, '枚数を変えられる');
  assert.equal(deckOf(8, 0.2, () => 0.5, true, 0).filter(Boolean).length, 0, '0枚にもできる');
  assert.equal(deckOf(3, 0, () => 0.5, true).filter(Boolean).length, 1);
});

test('確率 0 で大当たりが並びに出ていても、そのカードを選んでも当たらない', async () => {
  const sent = [];
  const hub = { broadcast: (m) => sent.push(m) };
  const draw = new CardDraw(hub, { random: () => 0.1 });
  draw.setConfig({ minCoins: 10, winRate: 0, showJackpot: true, count: 8, winLabel: '大吉', loseLabel: '大凶', showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  draw.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Corgi' }, user: { id: 'u1', name: 'ゆず' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'pick');
  assert.equal(draw.round.deck.filter(Boolean).length, 1, '並びには大当たりが1枚ある');
  const jackpot = draw.round.deck.indexOf(true) + 1;
  draw.onEvent({ kind: 'chat', text: String(jackpot) + '番', user: { id: 'u1', name: 'ゆず' } });
  assert.equal(draw.phase, 'reveal');
  const last = sent.at(-1);
  assert.equal(last.round.picked, jackpot);
  assert.deepEqual(last.round.result, { win: false, label: '大凶' }, '大当たりのカードを選んでも、確率 0 なら当たらない');
  draw.close();
});

test('実際に当たるカードの並びは、設定した枚数だけ当たりになる', () => {
  assert.equal(realsOf(8, 3, () => 0.5).filter(Boolean).length, 3);
  assert.equal(realsOf(8, 0, () => 0.5).filter(Boolean).length, 0);
  assert.equal(realsOf(4, 99, () => 0.5).filter(Boolean).length, 4, '枚数の上限はカードの枚数まで');
});

test('裏の設定の既定は、確率で決める形（枚数は -1）で、並びに出す枚数は1', () => {
  const d = defaultsFor('cardDraw');
  assert.equal(d.winCount, -1);
  assert.equal(d.showWinCount, 1);
  assert.equal(d.showJackpot, false);
});

async function driveToPick(draw) {
  draw.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Corgi' }, user: { id: 'u1', name: 'ゆず' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(draw.phase, 'pick');
}

test('実際に当たる枚数が 0 のときは、確率が 1 でも当たらない', async () => {
  const sent = [];
  const draw = new CardDraw({ broadcast: (m) => sent.push(m) }, { random: () => 0.1 });
  draw.setConfig({ minCoins: 10, winRate: 1, winCount: 0, count: 8, winLabel: '大吉', loseLabel: '大凶', showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  await driveToPick(draw);
  draw.onEvent({ kind: 'chat', text: '1番', user: { id: 'u1', name: 'ゆず' } });
  assert.deepEqual(sent.at(-1).round.result, { win: false, label: '大凶' });
  draw.close();
});

test('実際に当たる枚数が全部のときは、確率が 0 でも当たる', async () => {
  const sent = [];
  const draw = new CardDraw({ broadcast: (m) => sent.push(m) }, { random: () => 0.1 });
  draw.setConfig({ minCoins: 10, winRate: 0, winCount: 8, count: 8, winLabel: '大吉', loseLabel: '大凶', showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  await driveToPick(draw);
  draw.onEvent({ kind: 'chat', text: '5番', user: { id: 'u1', name: 'ゆず' } });
  assert.deepEqual(sent.at(-1).round.result, { win: true, label: '大吉' });
  draw.close();
});

test('実際に当たる枚数で決める回は、選んだ位置で当たりが決まる', async () => {
  const sent = [];
  // random が 0 だと、並び替えの結果は [ハズレ, ハズレ, ハズレ, 当たり]（4枚・当たり1枚）
  const draw = new CardDraw({ broadcast: (m) => sent.push(m) }, { random: () => 0 });
  draw.setConfig({ minCoins: 10, winRate: 0, winCount: 1, count: 4, winLabel: '大吉', loseLabel: '大凶', showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  await driveToPick(draw);
  assert.deepEqual(draw.round.deck, [false, false, false, true], '並びに出すが切れているときは、実際に当たるカードそのままを見せる');
  draw.onEvent({ kind: 'chat', text: '4番', user: { id: 'u1', name: 'ゆず' } });
  assert.deepEqual(sent.at(-1).round.result, { win: true, label: '大吉' }, '当たりの位置を選ぶと当たる');
  draw.close();
});

test('並びに出す枚数と、実際に当たる枚数は、別々に決められる', async () => {
  const sent = [];
  const draw = new CardDraw({ broadcast: (m) => sent.push(m) }, { random: () => 0 });
  draw.setConfig({ minCoins: 10, winRate: 0, winCount: 1, showJackpot: true, showWinCount: 3, count: 8, winLabel: '大吉', loseLabel: '大凶', showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 10000, doneMs: 0 });
  await driveToPick(draw);
  assert.equal(draw.round.deck.filter(Boolean).length, 3, '表には3枚出る');
  assert.equal(draw.round.reals.filter(Boolean).length, 1, '実際に当たるのは1枚だけ');
  draw.close();
});
