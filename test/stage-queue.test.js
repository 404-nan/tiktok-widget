// 舞台の順番待ち（src/stage-queue.js）: 配信者ごとに持ち主は1つだけ。最初に取った名前が持ち主で、
// 返したときに待っている側へ知らせる。配信者同士は混ざらない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StageQueue } from '../src/stage-queue.js';

test('空いている舞台は取れて、持ち主が分かる', () => {
  const stage = new StageQueue();
  assert.equal(stage.isBusy('a'), false);
  assert.equal(stage.ownerOf('a'), null);
  assert.equal(stage.acquire('a', 'omikuji'), true);
  assert.equal(stage.isBusy('a'), true);
  assert.equal(stage.ownerOf('a'), 'omikuji');
});

test('使われている間は他の部品は取れない。持ち主が取り直すのはよい', () => {
  const stage = new StageQueue();
  stage.acquire('a', 'omikuji');
  assert.equal(stage.acquire('a', 'cardDraw'), false);
  assert.equal(stage.acquire('a', 'omikuji'), true);
  assert.equal(stage.ownerOf('a'), 'omikuji');
});

test('返せるのは持ち主だけ。返すと待っている側へ知らせる', () => {
  const stage = new StageQueue();
  stage.acquire('a', 'cardDraw');
  let calls = 0;
  stage.whenFree('a', () => { calls += 1; });
  assert.equal(stage.release('a', 'omikuji'), false);
  assert.equal(calls, 0);
  assert.equal(stage.isBusy('a'), true);
  assert.equal(stage.release('a', 'cardDraw'), true);
  assert.equal(calls, 1);
  assert.equal(stage.isBusy('a'), false);
});

test('空いているときに whenFree を呼ぶと、その場で呼ばれる', () => {
  const stage = new StageQueue();
  let calls = 0;
  stage.whenFree('a', () => { calls += 1; });
  assert.equal(calls, 1);
});

test('配信者ごとに別々に数える', () => {
  const stage = new StageQueue();
  stage.acquire('a', 'omikuji');
  assert.equal(stage.isBusy('b'), false);
  assert.equal(stage.acquire('b', 'cardDraw'), true);
  assert.equal(stage.ownerOf('a'), 'omikuji');
  assert.equal(stage.ownerOf('b'), 'cardDraw');
});

test('待ちの登録を取り消すと、返しても呼ばれない', () => {
  const stage = new StageQueue();
  stage.acquire('a', 'cardDraw');
  let calls = 0;
  const waiter = () => { calls += 1; };
  stage.whenFree('a', waiter);
  stage.cancelWait('a', waiter);
  stage.release('a', 'cardDraw');
  assert.equal(calls, 0);
});

test('clear で持ち主と待ちが全部消える', () => {
  const stage = new StageQueue();
  stage.acquire('a', 'omikuji');
  let calls = 0;
  stage.whenFree('a', () => { calls += 1; });
  stage.clear('a');
  assert.equal(stage.isBusy('a'), false);
  assert.equal(stage.acquire('a', 'cardDraw'), true);
  assert.equal(calls, 0);
});
