// combo-widget.html の受け入れ条件を、画面を実装する前に固定するテスト。
// サーバーの combo 状態を画面がそのまま扱い、配信向けの制約を守ることを確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const page = fs.readFileSync(path.join(root, 'public/widgets/combo.html'), 'utf8');
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');

test('AC-1/7 combo は初回 API と WebSocket を使い、サーバー時刻で同期する', () => {
  assert.match(page, /\/api\/combo/);
  assert.match(scripts, /new WebSocket/);
  assert.match(scripts, /active/);
  assert.match(scripts, /last/);
  assert.match(scripts, /expiresAt/);
  assert.match(scripts, /serverNow|server.*now|clockOffset|clockSkew/i);
  assert.doesNotMatch(scripts, /count\s*\+\+|count\s*=\s*count\s*\+/);
});

test('AC-2/3/6 combo の人・回数・ギフト・合計・段・終了を日本語画面へ出す', () => {
  for (const name of ['user', 'count', 'gift', 'total', 'tier', 'end']) assert.match(scripts, new RegExp(name));
  for (const tier of ['blue', 'green', 'red', 'gold', 'rainbow']) assert.match(page, new RegExp(tier));
  assert.match(scripts, /textContent/);
  assert.doesNotMatch(scripts, /innerHTML/);
});

test('AC-4/5 は受信順の最大20件を待ち行列にし、演出時間を制限する', () => {
  assert.match(scripts, /20/);
  assert.match(page, /1800/);
  assert.match(page, /3000/);
  assert.match(page, /250/);
  assert.match(scripts, /endDuration/);
  assert.match(scripts, /kind.*count|count.*kind/);
  assert.match(scripts, /expiresAt/);
});

test('AC-8/9 は WebAudio と音量設定を使い、テスト表示を本番状態から分ける', () => {
  assert.match(scripts, /AudioContext/);
  assert.match(scripts, /volume/);
  assert.match(scripts, /test/);
  assert.match(page, /テスト/);
  assert.match(scripts, /test:/);
  assert.doesNotMatch(page, /https?:\/\//i);
});

test('公開ウィジェットの JavaScript は ES5 で外部 CDN を使わない', () => {
  assert.doesNotMatch(page, /<script[^>]+type=["']module/i);
  assert.doesNotMatch(scripts, /=>|`|\?\.|\?\?|\b(?:let|const|class|import|export)\b/);
  assert.doesNotMatch(page, /(?:src|href)=["']https?:\/\//i);
});
