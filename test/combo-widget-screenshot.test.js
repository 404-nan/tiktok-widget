// combo-widget のスクリーンショット確認に必要な画面の土台を機械的に確認する。
// 実機の見た目は開発サーバーで PC・スマホの画像確認を行う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'public/widgets/combo.html'), 'utf8');

test('AC-10 画面は不透明な墨の面で、送信者を上、回数を中央、合計を下に置く', () => {
  assert.match(page, /background\s*:\s*#(?:111113|111|0b0b0d)/i);
  assert.match(page, /id=["'](?:user|sender|gifter)["']/i);
  assert.match(page, /id=["'](?:count|combo-count)["']/i);
  assert.match(page, /id=["'](?:total|combo-total)["']/i);
  assert.match(page, /top\s*:/i);
  assert.match(page, /@media[^{]*max-width/i);
  assert.match(page, /font-size\s*:\s*16px/i);
});

test('AC-8/10 点滅は短い演出だけで、外部画像・音源を読み込まない', () => {
  assert.doesNotMatch(page, /<img\b[^>]+src=["']https?:\/\//i);
  assert.doesNotMatch(page, /background-image\s*:\s*url\(/i);
  assert.doesNotMatch(page, /(?:audio|video|source)\b/i);
  assert.match(page, /hitStop\s*=\s*80/);
  assert.doesNotMatch(page, /animation[^;{]*:\s*[^;]*infinite/i);
});
