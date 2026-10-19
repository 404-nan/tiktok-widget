// ダレ場の設定・API・公開ウィジェットが既存の入口につながっていることを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCHEMA } from '../src/schema.js';
import { FEATURES } from '../src/runtime.js';
const simpleText = fs.readFileSync('public/dashboard/simple.js', 'utf8');

test('ダレ場が設定・機能一覧・かんたん設定に登録されている', () => {
  assert.ok(SCHEMA.dareba);
  assert.equal(SCHEMA.dareba.page, 'dareba');
  assert.ok(FEATURES.dareba);
  assert.match(simpleText, /'dareba'/);
  assert.match(simpleText, /dareba: \{/);
});

test('公開ウィジェットは外部素材なしのHTMLとして存在する', () => {
  const html = fs.readFileSync('public/widgets/dareba.html', 'utf8');
  assert.match(html, /WebSocket/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /日本語|事件|ライコネ/);
});
