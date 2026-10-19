// 大トリ企画の完成条件を、サーバー側の状態遷移として確かめる受け入れテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OotoriEngine } from '../../src/ootori.js';

function setup(options = {}) {
  let now = 1_000_000;
  const sent = [];
  const engine = new OotoriEngine({ now: () => now, broadcast: (message) => sent.push(message), ...options });
  return { engine, sent, advance(ms) { now += ms; }, time() { return now; } };
}

function gift(id, name, diamonds = 10, extra = {}) {
  return {
    kind: 'gift',
    ts: extra.ts,
    gift: { id: `gift-${id}`, name: '対象ギフト', count: 1, diamondCount: diamonds },
    totalDiamonds: diamonds,
    user: { id, name, avatar: `/avatars/${id}.png` },
    ...extra,
  };
}

test('AC-1/2: 開始後の有効なギフトだけが席を取り、方式ごとの境界を守る', () => {
  const { engine, advance } = setup();
  engine.onEvent(gift('before', '開始前'));
  assert.equal(engine.snapshot().seat, null);
  assert.equal(engine.start().state, 'open');
  advance(100);
  engine.onEvent(gift('one', '一人目', 10));
  engine.onEvent(gift('two', '二人目', 1));
  assert.equal(engine.snapshot().seat.user.name, '二人目');
  engine.setConfig({ mode: 'raise' });
  engine.onEvent(gift('three', '三人目', 10));
  assert.equal(engine.snapshot().seat.user.name, '三人目');
  engine.onEvent(gift('four', '四人目', 10));
  assert.equal(engine.snapshot().seat.user.name, '三人目');
});

test('AC-3/9: 席の差し替えと再接続用状態をサーバーから返し、testEventは汚さない', () => {
  const { engine, sent } = setup();
  engine.start();
  engine.onEvent(gift('one', '一人目'));
  const before = engine.snapshot();
  const result = engine.testEvent(gift('test', '<テスト>'));
  assert.equal(result.visualOnly, true);
  assert.deepEqual(engine.snapshot().seat, before.seat);
  assert.equal(sent.at(-1).event, 'testEvent');
  assert.equal(sent.at(-1).test, true);
  assert.equal(engine.snapshot().seatChangedMs, 350);
});

test('AC-4/5/8: finishは冪等で、無音・大トリ・締め枠の時系列を固定する', () => {
  const { engine, sent } = setup();
  engine.start();
  engine.onEvent(gift('one', '一人目'));
  const first = engine.finish();
  const second = engine.finish();
  assert.equal(first.state, 'rolling');
  assert.deepEqual(second, first);
  assert.equal(first.finale.silenceMs, 600);
  assert.equal(first.finale.revealWithinMs, 2500);
  assert.equal(first.finale.maxMs, 3000);
  assert.equal(first.endRoll.maxMs, 9000);
  assert.equal(sent.filter((item) => item.event === 'finished').length, 1);
});

test('AC-6/7: 参加者を重複なく並べ、20組を超えた名前は人数にまとめ、表示名を安全化する', () => {
  const { engine } = setup();
  engine.start();
  for (let i = 0; i < 22; i++) engine.onEvent(gift(`u${i}`, i === 0 ? '<最初>' : `参加者${i}`));
  engine.onEvent(gift('u21', '<大トリ>'));
  const state = engine.finish();
  assert.equal(state.participants.length, 22);
  assert.equal(state.endRoll.visible.length, 20);
  assert.equal(state.endRoll.otherCount, 2);
  assert.equal(state.endRoll.visible[0].name, '最初');
  assert.equal(state.endRoll.visible.at(-1).name, '大トリ');
  assert.equal(state.endRoll.visible.filter((item) => item.id === 'u0').length, 1);
});

test('AC-2/9: 参加者なしで終了し、終了後のギフトは大トリを変えない', () => {
  const { engine } = setup();
  engine.start();
  const empty = engine.finish();
  assert.equal(empty.message, '参加者なし');
  assert.equal(empty.endRoll.visible.length, 0);
  engine.onEvent(gift('late', '終了後'));
  assert.equal(engine.snapshot().seat, null);
});
