// 本番前レビューで見つかった、実際の接続経路に関する再現テスト。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../src/runtime.js';
import { createStore } from '../src/config.js';
import { GoalAlertEngine } from '../src/mc-goal-alert.js';
import { Minecraft } from '../src/minecraft.js';
import { NamedSabotageEngine, namedSabotageCommands } from '../src/minecraft-name.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tw-pre-ship-'));
}

function gift(id, name = id) {
  return {
    kind: 'gift',
    id,
    gift: { id: '5655', name: 'Rose', count: 1, diamonds: 1 },
    totalDiamonds: 1,
    user: { id, name },
  };
}

test('レビュー再現: 本物のRuntime経由のギフトが大トリへ届く', async () => {
  const dir = tempDir();
  const configPath = path.join(dir, 'config.yaml');
  fs.copyFileSync(new URL('../config.example.yaml', import.meta.url), configPath);
  const runtime = createRuntime({ id: 'pre-ship', store: createStore(configPath), dataDir: dir, mediaDirs: [dir] });
  try {
    runtime.setConfig('ootori.enabled', true);
    runtime.performControl('ootori', 'start');
    runtime.hub.publish(gift('u1', '一人目'));
    assert.equal(runtime.readOotori().participants.length, 1);
    assert.equal(runtime.readOotori().seat.user.name, '一人目');
  } finally {
    await runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('レビュー再現: 小数距離のゴール到達と設定再読込での二重WINを防ぐ', () => {
  let reached = 0;
  const hub = { broadcast() {} };
  const engine = new GoalAlertEngine({
    hub,
    queryDistance: async () => ({ distance: 0, world: 'world' }),
    onGoalReached: () => { reached += 1; },
  });
  const config = { enabled: true, world: 'world', x: 1, y: 64, z: 2 };
  engine.setConfig(config);
  engine.acceptDistance({ distance: 0.25, world: 'world', serverTime: 1 });
  assert.equal(reached, 1);
  engine.setConfig(config);
  engine.acceptDistance({ distance: 0.1, world: 'world', serverTime: 3 });
  assert.equal(reached, 1);
});

test('レビュー再現: Minecraftのゴール警報はボスバーを先に作る', () => {
  const mc = new Minecraft({ on() {}, broadcast() {} });
  const sent = [];
  mc.enqueue = (commands, vars, source) => sent.push({ commands, vars, source });
  mc.config = { enabled: true, goalAlert: { enabled: true, world: 'world', x: 1, y: 64, z: 2 } };
  mc.goalAlert.config = mc.config.goalAlert;
  mc.goalAlert.state = 'measuring';
  mc.goalAlert.acceptDistance({ distance: 5, world: 'world', serverTime: 1 });
  assert.match(sent[0].commands.join('\n'), /bossbar add tw:goal_alert/);
});

test('レビュー再現: 名入り妨害は存在しないfunctionを予約せず、再起動時の残骸を片付ける', () => {
  const statePath = path.join(tempDir(), 'named-sabotage.json');
  const hub = { broadcast() {} };
  const first = new NamedSabotageEngine({ hub, statePath });
  first.setConfig({ enabled: true });
  const item = first.trigger({ id: 'event-1', user: { id: 'u1', name: '花子' }, size: 'large' });
  assert.doesNotMatch(namedSabotageCommands(item, 'large').join('\n'), /schedule function/);

  const restarted = new NamedSabotageEngine({ hub, statePath });
  assert.deepEqual(restarted.takeStale().map((entry) => entry.eventId), [item.eventId]);
});
