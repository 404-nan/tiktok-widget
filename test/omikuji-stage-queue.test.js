// おみくじの舞台の順番待ち: 大きな演出（カードめくりの開示など）が流れている間は抽選を始めず、
// 終わってから順番に1つずつ引く。確率・天井・記録の動きは変えず、始める順番だけを変える。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Gacha } from '../src/gacha.js';
import { CardDraw } from '../src/card-draw.js';
import { StageQueue } from '../src/stage-queue.js';
import { defaultsFor } from '../src/schema.js';

const KEY = 'local';

function setup(over = {}) {
  const stage = new StageQueue();
  const busEvents = [];
  const bus = { emit: (type, payload) => busEvents.push({ type, ...payload }) };
  const omikuji = new Gacha({ broadcast: () => {} }, { name: 'omikuji', random: () => 0.999, bus, stage, stageKey: KEY });
  omikuji.setConfig({ ...defaultsFor('omikuji'), displayMode: 'short', ...over });
  return { stage, omikuji, busEvents };
}

// 短い型の1回を最後まで進める（振る300 → 結果800 → 終了300）
function finishDraw(t, omikuji) {
  t.mock.timers.tick(300);
  t.mock.timers.tick(800);
  t.mock.timers.tick(300);
  assert.equal(omikuji.phase, 'idle');
}

test('初期値: 順番待ちは有効で、上限は20', () => {
  const defaults = defaultsFor('omikuji');
  assert.equal(defaults.stageQueue, true);
  assert.equal(defaults.stageQueueMax, 20);
});

test('舞台が空いていれば今までどおりすぐ引く。引いている間は自分が持ち主', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { stage, omikuji } = setup();
  const started = omikuji.start({ kind: 'gift', user: { id: 'a', name: 'A' } });
  assert.equal(started.queued, false);
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(stage.ownerOf(KEY), 'omikuji');
  finishDraw(t, omikuji);
  assert.equal(stage.ownerOf(KEY), null);
});

test('大きな演出の間は待って、終わったら順番どおりに1つずつ引く', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { stage, omikuji } = setup();
  stage.acquire(KEY, 'cardDraw');
  const first = omikuji.start({ kind: 'gift', user: { id: 'a', name: 'A' } });
  const second = omikuji.start({ kind: 'gift', user: { id: 'b', name: 'B' } });
  assert.equal(first.queued, true);
  assert.equal(second.queued, true);
  assert.equal(omikuji.phase, 'idle');
  assert.equal(omikuji.snapshot().stagePending, 2);
  // 舞台が空いたら、先に並んだ A から始まる
  stage.release(KEY, 'cardDraw');
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(omikuji.trigger.user.id, 'a');
  assert.equal(stage.ownerOf(KEY), 'omikuji');
  // A が終わったら B が始まる
  t.mock.timers.tick(300);
  t.mock.timers.tick(800);
  t.mock.timers.tick(300);
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(omikuji.trigger.user.id, 'b');
  finishDraw(t, omikuji);
  assert.equal(omikuji.snapshot().stagePending, 0);
  assert.equal(stage.ownerOf(KEY), null);
});

test('上限を超えた分は引かず、バスへ知らせる（記録に残る）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { stage, omikuji, busEvents } = setup({ stageQueueMax: 2 });
  stage.acquire(KEY, 'cardDraw');
  omikuji.start({ kind: 'gift', user: { id: 'a', name: 'A' } });
  omikuji.start({ kind: 'gift', user: { id: 'b', name: 'B' } });
  const dropped = omikuji.start({ kind: 'gift', user: { id: 'c', name: 'C' } });
  assert.equal(dropped.dropped, true);
  assert.equal(omikuji.snapshot().stagePending, 2);
  const notices = busEvents.filter((e) => e.type === 'omikuji.stage-dropped');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].reason, 'stage-queue-full');
  assert.equal(notices[0].trigger.user.id, 'c');
});

test('順番待ちを切ると、大きな演出の間でも今までどおりすぐ引く', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { stage, omikuji } = setup({ stageQueue: false });
  stage.acquire(KEY, 'cardDraw');
  const started = omikuji.start({ kind: 'gift', user: { id: 'a', name: 'A' } });
  assert.equal(started.queued, false);
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(omikuji.snapshot().stagePending, 0);
  finishDraw(t, omikuji);
});

test('テストの抽選は順番待ちに入れず、断る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { stage, omikuji } = setup();
  stage.acquire(KEY, 'cardDraw');
  const started = omikuji.start({ kind: 'test', test: true, user: { id: 'a', name: 'A' } });
  assert.equal(started.ok, false);
  assert.equal(started.reason, 'busy');
  assert.equal(omikuji.phase, 'idle');
  assert.equal(omikuji.snapshot().stagePending, 0);
});

test('配信が終わったら順番待ちは空になる（次の配信へ持ち越さない）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const stage = new StageQueue();
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const omikuji = new Gacha(hub, { name: 'omikuji', random: () => 0.999, stage, stageKey: KEY });
  omikuji.setConfig({ ...defaultsFor('omikuji'), displayMode: 'short' });
  hub.emit('status', { mode: 'live' });
  stage.acquire(KEY, 'cardDraw');
  omikuji.start({ kind: 'gift', user: { id: 'a', name: 'A' } });
  assert.equal(omikuji.snapshot().stagePending, 1);
  hub.emit('status', { mode: 'ended' });
  assert.equal(omikuji.snapshot().stagePending, 0);
  // 舞台が空いても、終わった配信の分は始まらない
  stage.release(KEY, 'cardDraw');
  assert.equal(omikuji.phase, 'idle');
});

test('カードめくりの開示の間、おみくじは待つ。開示が終わったら始まる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const stage = new StageQueue();
  const hub = { broadcast: () => {} };
  const cardDraw = new CardDraw(hub, { random: () => 0, stage, stageKey: KEY });
  cardDraw.setConfig({ ...defaultsFor('cardDraw'), showMs: 100, shuffleMs: 100, pickSeconds: 1, revealMs: 500, doneMs: 100 });
  const omikuji = new Gacha(hub, { name: 'omikuji', random: () => 0.999, stage, stageKey: KEY });
  omikuji.setConfig({ ...defaultsFor('omikuji'), displayMode: 'short' });

  cardDraw.start({ kind: 'gift', user: { id: 'a', name: 'A' } });
  t.mock.timers.tick(100); // show → shuffle
  t.mock.timers.tick(100); // shuffle → pick
  assert.equal(stage.ownerOf(KEY), null); // 番号を待つ間はまだ持ち主ではない
  t.mock.timers.tick(1000); // 時間切れで開示
  assert.equal(cardDraw.phase, 'reveal');
  assert.equal(stage.ownerOf(KEY), 'cardDraw');

  const started = omikuji.start({ kind: 'gift', user: { id: 'b', name: 'B' } });
  assert.equal(started.queued, true);
  assert.equal(omikuji.phase, 'idle');

  t.mock.timers.tick(500); // reveal → done
  t.mock.timers.tick(100); // done → 待機。舞台が空いて、おみくじが始まる
  assert.equal(cardDraw.phase, 'idle');
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(stage.ownerOf(KEY), 'omikuji');
  finishDraw(t, omikuji);
});

test('ガチャ（おみくじ以外）は順番待ちの対象外で、今までどおりすぐ回る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const stage = new StageQueue();
  const gacha = new Gacha({ broadcast: () => {} }, { name: 'gacha', random: () => 0.5, stage, stageKey: KEY });
  gacha.setConfig({ ...defaultsFor('gacha') });
  stage.acquire(KEY, 'cardDraw');
  const started = gacha.start({ kind: 'gift', user: { id: 'a', name: 'A' } });
  assert.equal(started.queued, false);
  assert.equal(gacha.phase, 'rolling');
});
