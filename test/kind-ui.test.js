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
  assert.match(editor, /＋ 新しいプリセット/);
  // 名前はダブルクリックでその場で直す(モーダルを出さない)
  assert.match(editor, /nameInput\.addEventListener\('dblclick'/);
  assert.match(editor, /startInlineRename\(\)/);
  assert.doesNotMatch(editor, /prompt\(/);
});

test('設定キーを変えずに、画面の言葉をやさしくする', () => {
  const simple = read('public/dashboard/simple.js');
  assert.match(simple, /alerts\.events': 'どんなときに出す？'/);
  assert.match(simple, /alerts\.gifts': 'どのギフトで出す？'/);
  assert.match(simple, /slots\.trigger': 'どんなときに回す？'/);
  assert.match(simple, /slots\.symbols': '絵柄と出やすさ'/);
});

test('kind-ui の言葉の辞書と準備画面の入口がある', () => {
  const words = read('docs/words.md');
  const editor = read('public/dashboard/editor.js');
  const runtime = read('src/runtime.js') + read('src/runtime-routes.js');
  assert.match(words, /使う言葉/);
  assert.match(editor, /配信ソフトに入れる/);
  assert.match(editor, /配信が始まったら自動でつなぐ/);
  assert.doesNotMatch(editor, /confirm\(`「\$\{id\}」の設定を消します/);
  assert.match(runtime, /\/api\/preparation/);
});

test('サイドバーの行き先は配信者ごとの場所(BASE)から作る', () => {
  const editor = read('public/dashboard/editor.js');
  // 先頭が / の行き先は、配信者ごとの URL(/t/<鍵>/)の外に出てしまう
  assert.doesNotMatch(editor, /location\.href = '\/(monitor|history)\//);
  assert.doesNotMatch(editor, /window\.open\('\/help\//);
});

test('配信ソフトに入れる URL と配信テンプレートは、PCの左列では短い名前、data-name とツールチップは全部の名前のまま', () => {
  const editor = read('public/dashboard/editor.js');
  // item() のいちばん後の名前は data-name とツールチップに入る。短い名前にしても、開いた先の見出しと同じ全部の名前を残す
  assert.match(editor, /b\.title = b\.dataset\.name/);
  assert.match(editor, /item\('link', desktop \? 'URL' : '配信ソフトに入れる', view === 'obs', goTo\('obs'\), '', '配信ソフトに入れる URL'\)/);
  assert.match(editor, /item\('layout-template', desktop \? 'テンプレ' : '配信テンプレート', view === 'templates', goTo\('templates'\), '', '配信テンプレート'\)/);
  assert.match(editor, /\['link', '配信ソフトに入れる URL', goTo\('obs'\)\]/);
  assert.match(editor, /\['layout-template', '配信テンプレート', goTo\('templates'\)\]/);
  const obsInMore = editor.indexOf("['link', '配信ソフトに入れる URL', goTo('obs')]");
  const settingsInMore = editor.indexOf("['settings', '設定', goTo('settings')]");
  assert.ok(obsInMore >= 0 && settingsInMore >= 0 && obsInMore < settingsInMore, 'スマホの「その他」では配信ソフトに入れる URL がいちばん上に要ります');
});

test('設定のいちばん下から設定ファイルを開ける', () => {
  const html = read('public/dashboard/index.html');
  const editor = read('public/dashboard/editor.js');
  assert.match(html, /id="filesLink"/);
  assert.match(html, /くわしい人向け: 設定ファイルを直接見る/);
  assert.match(editor, /\$\('filesLink'\)\.addEventListener\('click', goTo\('files'\)\)/);
});
