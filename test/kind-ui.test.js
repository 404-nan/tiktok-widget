import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('ダッシュボードは設定画面にAIと見た目をまとめる', () => {
  const html = read('public/dashboard/index.html');
  const editor = read('public/dashboard/editor.js');
  assert.match(html, /id="settingsView"/);
  assert.match(html, /id="streamerAiView"/);
  assert.match(html, /id="themeLightBtn"/);
  assert.match(html, /id="themeDarkBtn"/);
  assert.doesNotMatch(html, /配信風|themes\.css|dash-style\.js/);
  assert.match(editor, /item\('settings', '設定'/);
  assert.match(editor, /item\('house', 'ホーム'/);
  assert.match(editor, /新しいプリセットを作る/);
  assert.match(editor, /selectBox\.addEventListener\('dblclick'/);
  assert.doesNotMatch(editor, /prompt\(/);
});

test('設定キーを変えずに、画面の言葉をやさしくする', () => {
  const simple = read('public/dashboard/simple.js');
  assert.match(simple, /alerts\.events': 'どんなときに出す？'/);
  assert.match(simple, /alerts\.gifts': 'どのギフトで出す？'/);
  assert.match(simple, /slots\.trigger': 'どんなときに回す？'/);
  assert.match(simple, /slots\.symbols': '絵柄と出やすさ'/);
});
