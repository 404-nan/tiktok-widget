// 大トリが設定、実行単位、操作経路、公開画面へつながることを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCHEMA } from '../src/schema.js';
import { FEATURES, OBS_ALLOWED } from '../src/runtime.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('大トリの設定と実行経路が登録されている', () => {
  assert.ok(SCHEMA.ootori);
  assert.ok(FEATURES.ootori);
  assert.ok(OBS_ALLOWED.some((rule) => rule.test('/api/ootori')));
  assert.match(read('src/runtime.js'), /OotoriEngine/);
  assert.match(read('src/admin.js'), /ootori/);
  assert.match(read('mcp/server.js'), /ootori/);
  assert.match(read('bin/tw.js'), /ootori/);
  assert.match(read('public/dashboard/simple.js'), /ootori/);
});

test('公開ウィジェットは日本語、WebSocket、WebAudio、ES5、外部CDNなし', () => {
  const html = read('public/widgets/ootori.html');
  assert.match(html, /大トリ/);
  assert.match(html, /WebSocket/);
  assert.match(html, /AudioContext/);
  assert.doesNotMatch(html, /=>|\b(let|const)\b|`/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /textContent/);
});
