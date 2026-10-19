// WebSocket の compact 形式を明示接続だけに限定する互換性テスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compactRequested } from '../src/ws-mode.js';

test('WebSocket は compact を明示した接続だけ差分形式にする', () => {
  assert.equal(compactRequested('/ws'), false);
  assert.equal(compactRequested('/ws?compact=0'), false);
  assert.equal(compactRequested('/ws?compact=1'), true);
});

test('サーバーは接続 URL の指定なしで compact を有効にしない', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.doesNotMatch(server, /ws\.compact\s*=\s*true/);
});
