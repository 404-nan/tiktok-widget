// Pekaをサーバー、操作方法、ダッシュボード、公開画面へつなぐ配線を確認するテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Peka はランタイム、API、CLI、MCP、かんたん設定につながっている', () => {
  const runtime = fs.readFileSync(new URL('../src/runtime.js', import.meta.url), 'utf8');
  const widget = fs.readFileSync(new URL('../public/widgets/peka.html', import.meta.url), 'utf8');
  const cli = fs.readFileSync(new URL('../bin/tw.js', import.meta.url), 'utf8');
  const mcp = fs.readFileSync(new URL('../mcp/server.js', import.meta.url), 'utf8');
  const simple = fs.readFileSync(new URL('../public/dashboard/simple.js', import.meta.url), 'utf8');
  assert.match(runtime, /Peka/);
  assert.match(runtime, /\/api\/peka/);
  assert.match(runtime, /testEvent/);
  assert.match(runtime, /bonusResolved/);
  assert.match(widget, /WebSocket/);
  assert.match(widget, /api\/peka/);
  assert.match(widget, /AudioContext/);
  assert.doesNotMatch(widget, /https?:\/\//);
  assert.match(widget, /shorten/);
  assert.match(widget, /WebSocket/);
  assert.match(cli, /peka/);
  assert.match(mcp, /peka/);
  assert.match(simple, /peka/);
});
