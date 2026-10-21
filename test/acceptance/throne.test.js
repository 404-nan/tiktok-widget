// 王座の集計、接近演出、移動上限、テスト分離、終了称号を受け入れ条件ごとに確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThroneEngine } from '../../src/throne.js';

function gift(user, coins, ts) {
  return { kind: 'gift', ts, gift: { id: `gift-${coins}`, name: 'Rose', count: 1, diamondCount: coins }, totalDiamonds: coins, user: { id: user, name: user, avatar: `/avatars/${user}.png` } };
}

function setup() {
  let now = 1_000_000;
  const sent = [];
  const engine = new ThroneEngine({ now: () => now, broadcast: (message) => sent.push(message) });
  return { engine, sent, advance(ms) { now += ms; }, time() { return now; } };
}

test('AC-1: 直近600000msの境界を含め、窓の外を除外する', () => {
  const { engine, advance } = setup();
  engine.onEvent(gift('a', 10));
  advance(600000);
  engine.onEvent(gift('b', 1));
  assert.equal(engine.snapshot().leader.key, 'a');
  advance(1);
  assert.equal(engine.snapshot().leader.key, 'b');
});

test('AC-2/7: 1単位差で移動し、在位時間と最後の王・名君を確定する', () => {
  const { engine, advance } = setup();
  engine.onEvent(gift('a', 10));
  advance(1000);
  engine.onEvent(gift('b', 11));
  assert.equal(engine.snapshot().leader.key, 'b');
  assert.equal(engine.snapshot().leader.reigningSince, 1_001_000);
  advance(1000);
  engine.finish();
  assert.equal(engine.snapshot().titles.lastKing.key, 'b');
  assert.equal(engine.snapshot().titles.greatestKing.key, 'a');
});

test('AC-3/5: 接近は同じ組み合わせで180秒に1回、交代後は新しい王を示す', () => {
  const { engine, sent, advance } = setup();
  engine.onEvent(gift('a', 100));
  engine.onEvent(gift('b', 90));
  assert.equal(sent.at(-1).event, 'versus');
  const count = sent.length;
  engine.onEvent(gift('b', 1));
  assert.equal(sent.length, count);
  advance(180000);
  engine.onEvent(gift('b', 10));
  assert.equal(sent.at(-1).event, 'versus');
  assert.equal(sent.at(-1).result, 'newKing');
});

test('AC-6/9: 移動は12回まで、testEventは集計せずresetで待ち時間も消す', () => {
  const { engine, advance } = setup();
  engine.onEvent(gift('a', 1));
  for (let i = 0; i < 13; i++) {
    advance(1);
    engine.onEvent(gift(`b${i}`, 3 + i));
  }
  const before = engine.snapshot();
  assert.equal(before.moveCount, 12);
  engine.testEvent(gift('test', 1000));
  assert.equal(engine.snapshot().leader.key, before.leader.key);
  engine.reset();
  assert.equal(engine.snapshot().state, 'idle');
  assert.equal(engine.snapshot().approaches.length, 0);
});

test('AC-4/8/10: VSの段階、色、状態を画面へ同期できる', () => {
  const { engine, sent } = setup();
  engine.onEvent(gift('a', 100));
  engine.onEvent(gift('b', 85));
  const versus = sent.at(-1);
  assert.equal(versus.event, 'versus');
  assert.equal(versus.color, 'green');
  assert.equal(versus.timeline.enterMs, 600);
  assert.equal(versus.timeline.vsAtMs, 900);
  assert.equal(versus.timeline.exitMs, 2800);
  assert.equal(versus.timeline.holdMs, 80);
  assert.deepEqual(engine.snapshot().versus.left.key, 'a');
  assert.deepEqual(engine.snapshot().versus.right.key, 'b');
});
