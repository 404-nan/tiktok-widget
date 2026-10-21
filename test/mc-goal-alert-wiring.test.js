// ゴール接近警報が設定・ランタイム・公開ウィジェットへつながっていることを確認する。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('ゴール接近警報のファイルと日本語の表示がある', () => {
  const source = read('src/mc-goal-alert.js');
  const widget = read('public/widgets/goal-alert.html');
  assert.match(source, /export class GoalAlertEngine/);
  assert.match(widget, /最終防衛ライン/);
  assert.doesNotMatch(widget, /https?:\/\//);
  assert.doesNotMatch(widget, /\b(let|const|=>)\b/);
});

test('設定にゴール座標と警報の説明があり、ランタイムから状態を読める', () => {
  const schema = read('src/schema.js');
  const runtime = read('src/runtime.js');
  assert.match(schema, /goalAlert/);
  assert.match(schema, /ゴールのワールド/);
  assert.match(runtime, /goalAlert/);
  assert.match(runtime, /api\/minecraft\/goal-alert/);
});

test('RCON距離問い合わせはワールドを明示し、秘密をコマンドへ入れない', () => {
  const rcon = read('src/rcon.js');
  const minecraft = read('src/minecraft.js');
  assert.match(rcon, /goalDistance|距離/);
  assert.match(minecraft, /goalAlert/);
  assert.doesNotMatch(minecraft, /password.*goal|goal.*password/);
});
