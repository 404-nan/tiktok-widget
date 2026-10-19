// 本番前レビューで見つかった状態不整合と、コード地図の漏れを再現するテスト。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Hub } from '../src/hub.js';
import { PushButtonEngine } from '../src/push-button.js';
import { VoteEngine } from '../src/vote.js';

test('レビュー1: start で新しい段階の境目を結果判定にも使う', () => {
  const engine = new PushButtonEngine(new Hub());
  engine.setConfig({ default: { steps: [3, 10, 30, 100], seconds: 5 } });
  engine.start('default');
  engine.reset('default');
  engine.setConfig({ default: { steps: [1, 2, 3, 4], seconds: 5 } });
  engine.start('default');
  engine.hub.publish({ kind: 'chat', text: '押', user: { id: 'reviewer', name: '確認者' } });
  const result = engine.finish('default');
  assert.equal(result.tierName, 'blue');
  assert.deepEqual(engine.snapshot().default.steps, [1, 2, 3, 4]);
});

test('レビュー2: ダッシュボードの設定タブに応援ゲージがある', () => {
  const editor = fs.readFileSync('public/dashboard/editor.js', 'utf8');
  assert.match(editor, /const TABS = \[[^\]]*['"]cheers['"]/);
});

test('レビュー5: 利用停止時に投票のリセット通知を配る', () => {
  const messages = [];
  const hub = new Hub();
  hub.broadcast = (message) => messages.push(message);
  const engine = new VoteEngine(hub);
  engine.setConfig({ default: { options: ['A', 'B'] } });
  engine.start('default');
  messages.length = 0;
  engine.setEnabled(false);
  assert.ok(messages.some((message) => message.type === 'vote' && message.id === 'default' && message.event === 'reset'));
});

test('レビュー4: README の地図に投票と応援を含める', () => {
  const root = fs.readFileSync('README.md', 'utf8');
  const widgets = fs.readFileSync('public/widgets/README.md', 'utf8');
  const source = fs.readFileSync('src/README.md', 'utf8');
  const operating = fs.readFileSync('docs/knowledge/operating.md', 'utf8');
  assert.match(root, /vote\.html/);
  assert.match(root, /cheer/);
  assert.match(widgets, /vote\.html/);
  assert.match(widgets, /vote\.js/);
  assert.match(source, /vote\.js/);
  assert.match(source, /runtime\.js.*投票/s);
  assert.match(operating, /tw push/);
});
