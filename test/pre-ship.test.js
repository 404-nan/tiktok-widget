// 本番前レビューの文書・ダッシュボード配線を、実際に読むファイルの形で確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROULETTE_DESCRIPTION, widgetDescription } from '../public/dashboard/dashboard-descriptions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('レビュー1: くわしい表示では schema の説明を使う', () => {
  const detailed = { desc: '詳しい説明' };
  const info = { roulettes: { desc: ROULETTE_DESCRIPTION } };
  assert.equal(widgetDescription(false, 'roulettes', info, detailed), '詳しい説明');
  assert.equal(widgetDescription(true, 'roulettes', info, detailed), ROULETTE_DESCRIPTION);
});

test('レビュー2: README は混在サイズと1本化後の URL を説明する', () => {
  const readme = read('README.md');
  assert.match(readme, /丸 600 × 680 \/ 横 820 × 330 \/ 両方 820 × 680/);
  assert.match(readme, /ルーレット.*URL.*1本/);
  assert.doesNotMatch(readme, /丸 600 × 680 \/ 横 820 × 330\n/);
});

test('レビュー3: dashboard フォルダの README が新しいファイルと利用元を説明する', () => {
  const readme = read('public/dashboard/README.md');
  assert.match(readme, /roulette-urls\.js/);
  assert.match(readme, /editor\.js/);
  assert.match(readme, /simple\.js/);
});

test('レビュー4: ルーレットは項目がなくても折りたたみを作る', async () => {
  const { shouldRenderDetails } = await import('../public/dashboard/editor-layout.js');
  assert.equal(shouldRenderDetails({ tab: 'roulettes', restCount: 0, streamDeckUrlCount: 0 }), true);
  assert.equal(shouldRenderDetails({ tab: 'alerts', restCount: 0, streamDeckUrlCount: 0 }), false);
});

test('レビュー5: カードは実在する受け入れテストと撮影証拠を指す', () => {
  const card = read('docs/cards/roulette-one-url.md');
  assert.match(card, /test\/acceptance\/roulette-one-url\.test\.js/);
  assert.match(card, /test\/acceptance\/roulette-one-url-round2\.test\.js/);
  assert.match(card, /test\/acceptance\/roulette-one-url-round3\.test\.js/);
  assert.match(card, /画面確認/);
  assert.doesNotMatch(card, /決めてほしいこと|未決/);
});
