// リレー停止が既存の設定・実行単位・操作経路・公開画面へつながることを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCHEMA } from '../src/schema.js';
import { FEATURES, OBS_ALLOWED } from '../src/runtime.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('リレー停止の設定と実行経路が登録されている', () => {
  assert.ok(SCHEMA.relayStop);
  assert.ok(FEATURES.relayStop);
  assert.ok(OBS_ALLOWED.some((rule) => rule.test('/api/relay-stop')));
  assert.match(read('src/runtime.js'), /RelayStopEngine/);
  assert.match(read('src/admin.js'), /relayStop/);
  assert.match(read('mcp/server.js'), /relay_stop/);
  assert.match(read('bin/tw.js'), /relay-stop/);
});

test('公開ウィジェットはリレー状態を受け、公開JavaScriptはES5のまま', () => {
  const html = read('public/widgets/slot.html');
  const js = read('public/widgets/slot.js');
  assert.match(html, /あと1人/);
  assert.match(js, /relay-stop|relayStop/);
  assert.doesNotMatch(js, /=>|\b(let|const)\b|`/);
});
