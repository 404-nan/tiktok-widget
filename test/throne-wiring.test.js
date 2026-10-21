// 王座をランタイム、設定、操作方法、公開画面へつなぐ配線を確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('王座が必要な入口と公開画面へつながっている', () => {
  const files = ['src/runtime.js', 'src/schema.js', 'src/admin.js', 'mcp/server.js', 'bin/tw.js', 'public/dashboard/simple.js'];
  const text = files.map((file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
  const widget = fs.readFileSync(new URL('../public/widgets/throne.html', import.meta.url), 'utf8');
  assert.match(text, /throne/);
  assert.match(text, /testEvent/);
  assert.match(text, /reset/);
  assert.match(widget, /WebSocket/);
  assert.match(widget, /api\/throne/);
  assert.match(widget, /AudioContext/);
  assert.doesNotMatch(widget, /https?:\/\//);
});
