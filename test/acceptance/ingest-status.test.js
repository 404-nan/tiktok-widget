// docs/cards/ingest-status.md の完成条件(AC-1〜AC-4)を静的に確かめる。
// 画面の状態はサーバーから受け取るデータを表示するため、ここでは本番データを使わず構造と説明文を検査する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const ingestFields = [
  'userId', 'username', 'nickname', 'avatar', 'avatarUrl', 'avatar_url', 'profilePictureUrl',
  'giftId', 'giftName', 'coins', 'repeatCount', 'likeCount', 'totalLikeCount',
  'comment', 'content', 'text', 'commandParams',
];
const kinds = ['gift', 'like', 'follow', 'comment', 'share'];

test('AC-1 接続の状態カードはTikTokと外部ツールの状態を表示できる構造を持つ', () => {
  const html = read('public/dashboard/index.html');
  assert.match(html, /<section[^>]+id="ingestSection"/);
  for (const id of ['ingestDirectStatus', 'ingestExternalStatus', 'ingestKey']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} がありません`);
  }
  assert.match(html, /最後に.*届いた/);
  assert.match(html, /受けた数/);
  assert.match(html, /重複で捨てた数/);
  assert.match(html, /多すぎて断った数/);
  const script = read('public/dashboard/ingest.js');
  for (const label of ['つながっている', 'つなぎ中', '未接続', 'エラー', '鍵なし', '待機中', '受信中']) {
    assert.match(script, new RegExp(label), `${label} の状態がありません`);
  }
  assert.match(read('public/dashboard/app.js'), /from ['"]\.\/ingest\.js['"]/);
});

test('AC-2 鍵の全文は作成時だけ表示し、再読み込み後は末尾4文字だけ表示する', () => {
  const script = read('public/dashboard/ingest.js');
  const html = read('public/dashboard/index.html');
  assert.match(script, /POST.*api\/ingest\/key|api\(['"]\/api\/ingest\/key['"].*POST/s);
  assert.match(script, /keyHint/);
  assert.match(script, /末尾|hint|最後の4/);
  assert.match(`${script}\n${html}`, /コピー/);
  assert.match(`${script}\n${html}`, /二度と見られません/);
  assert.match(script, /confirm/);
  assert.doesNotMatch(script, /twin_[0-9a-f]{48}/i);
});

test('AC-3 使い方の受け口の URL・項目名は ingest の受け入れ名と一致する', () => {
  const help = read('public/help/index.html');
  assert.match(help, /id="ingest"/);
  assert.match(help, /TikFinity/);
  assert.match(help, /Streamer\.bot/);
  assert.match(help, /準備中/);
  assert.match(help, /https?:\/\/[^\s<]*\/in\/(?:<ここに鍵>|&lt;ここに鍵&gt;)/);
  for (const kind of kinds) assert.match(help, new RegExp(`kind=${kind}`), `${kind} の例がありません`);
  for (const field of ingestFields) assert.match(help, new RegExp(`\\b${field}\\b`), `${field} がありません`);
  assert.match(help, /404/);
  assert.match(help, /429/);
  assert.match(help, /1秒20回/);
  assert.doesNotMatch(help, /twin_[0-9a-f]{48}/i);
});

test('AC-4 表示用スクリプトは相対読み込みの読みやすい日本語ESモジュールである', () => {
  const script = read('public/dashboard/ingest.js');
  assert.match(script, /export /);
  assert.doesNotMatch(script, /https?:\/\//);
  assert.doesNotMatch(script, /<script[^>]+src=/i);
  assert.ok(script.split(/\r?\n/).every((line) => line.length < 240), '長すぎる圧縮行を置かない');
  assert.match(script, /接続|受け口|鍵|状態/);
});
