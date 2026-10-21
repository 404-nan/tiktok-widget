// ゴール接近警報の完成条件を、Minecraftへ接続せずサーバー側の状態で確認する。

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { GoalAlertEngine, stageForDistance } from '../../src/mc-goal-alert.js';
import { Minecraft } from '../../src/minecraft.js';

class TestHub extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
  }

  broadcast(message) {
    this.messages.push(message);
  }
}

const goal = { enabled: true, world: 'world', x: 100, y: 64, z: 100 };

function setup(over = {}) {
  let now = 100000;
  const hub = new TestHub();
  const reached = [];
  const engine = new GoalAlertEngine({
    hub,
    now: () => now,
    queryDistance: async () => ({ distance: 100, world: 'world', serverTime: now }),
    onGoalReached: (event) => reached.push(event),
  });
  engine.setConfig({ goalAlert: goal, ...over });
  return { engine, hub, reached, advance: (ms) => { now += ms; }, now: () => now };
}

test('AC-1: ゴール座標がなければ無効で、距離を推測しない', async () => {
  let queries = 0;
  const hub = new TestHub();
  const engine = new GoalAlertEngine({ hub, queryDistance: async () => { queries += 1; return { distance: 1 }; } });
  engine.setConfig({ goalAlert: { enabled: true, world: '', x: null, y: null, z: null } });
  assert.equal(engine.snapshot().state, 'disabled');
  await engine.poll();
  assert.equal(queries, 0);
  assert.equal(JSON.stringify(hub.messages).includes('password'), false);
});

test('AC-2: 問い合わせは1件だけ、1500msを超えた返事は捨てる', async () => {
  let resolve;
  let calls = 0;
  const hub = new TestHub();
  let now = 0;
  const engine = new GoalAlertEngine({
    hub,
    now: () => now,
    queryDistance: () => { calls += 1; return new Promise((r) => { resolve = r; }); },
  });
  engine.setConfig({ goalAlert: goal });
  const first = engine.poll();
  const second = engine.poll();
  await Promise.resolve();
  assert.equal(calls, 1);
  now = 1501;
  resolve({ distance: 20, world: 'world', serverTime: now });
  await first;
  await second;
  assert.equal(engine.snapshot().state, 'measuring');
  assert.equal(engine.snapshot().distance, null);
});

test('AC-3/4: 50m・20m・5mを段階化し、遠くへ5m戻るまで同じ段を再武装しない', () => {
  assert.deepEqual([50, 20, 5, 4, 51].map(stageForDistance), ['near', 'warning', 'final', 'final', 'safe']);
  const { engine, hub, advance } = setup();
  engine.acceptDistance({ distance: 20, world: 'world', serverTime: 100000 });
  engine.acceptDistance({ distance: 19, world: 'world', serverTime: 100001 });
  assert.equal(hub.messages.filter((m) => m.type === 'goalAlert').length, 1);
  advance(30001);
  engine.acceptDistance({ distance: 19, world: 'world', serverTime: 130001 });
  assert.equal(hub.messages.filter((m) => m.type === 'goalAlert').length, 1);
  engine.acceptDistance({ distance: 25, world: 'world', serverTime: 130002 });
  engine.acceptDistance({ distance: 20, world: 'world', serverTime: 130003 });
  assert.equal(hub.messages.filter((m) => m.type === 'goalAlert').length, 2);
});

test('AC-5: 20m・5mの通知は同じ段・距離・サーバー時刻を持つ', () => {
  const { engine, hub } = setup();
  engine.acceptDistance({ distance: 20, world: 'world', serverTime: 123456 });
  engine.acceptDistance({ distance: 5, world: 'world', serverTime: 123789 });
  const alerts = hub.messages.filter((m) => m.type === 'goalAlert');
  assert.deepEqual(alerts.map((m) => [m.stage, m.distance, m.serverTime]), [
    ['warning', 20, 123456],
    ['final', 5, 123789],
  ]);
});

test('AC-6/8/10: 通知は3秒以内で、Minecraft側は段階色のボスバーへ縮退する', () => {
  const { engine, hub } = setup();
  engine.acceptDistance({ distance: 20, world: 'world', serverTime: 123456 });
  const alert = hub.messages.find((message) => message.type === 'goalAlert');
  assert.equal(alert.durationMs, 3000);
  const mc = new Minecraft(new TestHub());
  const sent = [];
  mc.config = { enabled: true, goalAlert: goal };
  mc.enqueue = (commands, vars, source) => sent.push({ commands, vars, source });
  mc.goalAlert.config = goal;
  mc.goalAlert.state = 'measuring';
  mc.goalAlert.acceptDistance({ distance: 20, world: 'world', serverTime: 123456 });
  assert.match(sent.at(-1).commands.join('\n'), /bossbar set tw:goal_alert/);
  assert.match(sent.at(-1).commands.join('\n'), /color red/);
  assert.match(fs.readFileSync(new URL('../../public/widgets/goal-alert.html', import.meta.url), 'utf8'), /animation: blink 500ms ease-in-out 2/);
});

test('AC-7: ゴール到達は一度だけWIN処理へ渡し、防衛成功は直近の妨害があるときだけ', () => {
  const { engine, reached, advance } = setup();
  engine.recordSabotage({ user: { name: '花子' } });
  engine.acceptDistance({ distance: 0, world: 'world', serverTime: 100001 });
  advance(1000);
  engine.acceptDistance({ distance: 0, world: 'world', serverTime: 101001 });
  assert.equal(reached.length, 1);
  assert.equal(reached[0].defenseUser, '花子');
  assert.equal(engine.snapshot().state, 'goal');
});

test('AC-9: テスト送信は視覚通知だけで、本番WIN・履歴・Minecraftへ渡さない', () => {
  const { engine, hub } = setup();
  engine.testDistance({ distance: 20, world: 'world', serverTime: 100000 });
  assert.equal(engine.snapshot().distance, null);
  assert.equal(hub.messages.at(-1).visualOnly, true);
});
