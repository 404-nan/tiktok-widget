// 名前入り妨害の完成条件を、Minecraftへ接続せずサーバー側の結果で確認する。

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  NamedSabotageEngine,
  sanitizeMinecraftName,
  namedSabotageCommands,
} from '../../src/minecraft-name.js';

class TestHub extends EventEmitter {
  constructor() { super(); this.messages = []; }
  broadcast(message) { this.messages.push(message); }
}

test('AC-1: 表示名を受信時に一度だけ安全化し、IDは内部キーにする', () => {
  assert.equal(sanitizeMinecraftName('  花子\n"; /kill @a\\ §c  '), '花子 kill a c');
  assert.ok(sanitizeMinecraftName('あいうえおかきくけこさしすせそたちつてと123').length <= 24);
  assert.equal(sanitizeMinecraftName('---___'), '---___');
  assert.equal(sanitizeMinecraftName('";\n\\'), '視聴者');
});

test('AC-2/5: 生成コマンドは安全な引用だけを使い、危険な操作を含まない', () => {
  const commands = namedSabotageCommands({ eventId: 'evt-1', user: { id: 'private-id', name: '花子' }, displayName: '花子' }, 'medium');
  const text = commands.join(' ');
  assert.ok(commands.every((command) => !/[\r\n]/.test(command)));
  assert.match(text, /bossbar/);
  assert.doesNotMatch(text, /爆発|damage|kill @|setblock|fill |summon tnt/i);
  assert.doesNotMatch(text, /private-id/);
});

test('AC-3/4/8: サーバー状態で重複・同時上限・期限を管理し、テストは視覚通知だけにする', () => {
  let now = 1000;
  const hub = new TestHub();
  const engine = new NamedSabotageEngine({ hub, now: () => now, sheepLimit: 3, queueLimit: 2 });
  engine.setConfig({ enabled: true, mediumSeconds: 15, largeSeconds: 60 });
  const first = engine.trigger({ id: 'event-1', user: { id: 'u1', name: '花子' }, size: 'large' });
  assert.equal(first.state, 'queued');
  assert.equal(engine.trigger({ id: 'event-1', user: { id: 'u1', name: '花子' }, size: 'large' }), null);
  assert.equal(first.displayName, '花子');
  assert.equal(first.sheepCount, 3);
  assert.equal(engine.trigger({ id: 'event-2', user: { id: 'u2', name: '次郎' }, size: 'large' }), null);
  const visual = engine.testEvent({ id: 'test-1', user: { id: 'u3', name: 'テスト' }, size: 'medium' });
  assert.equal(visual.visualOnly, true);
  assert.equal(engine.snapshot().active.length, 1);
  now += 60_001;
  engine.expire(first.eventId);
  assert.equal(engine.snapshot().active.length, 0);
  assert.equal(engine.snapshot().expired.at(-1).eventId, first.eventId);
});
