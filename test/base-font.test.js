// 全ウィジェット共通の基本フォント（テーマ）と、ウィジェット個別の書体の土台。
// 共通部品は public/widgets/lib/fonts.js、設定の形は src/schema.js の fontFields()。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as cfg from '../src/config.js';
import { defaultsFor, FONT_VALUES } from '../src/schema.js';
import { applyFont, fontFamily, loadFont, resolveFont, FONT_IDS, DEFAULT_FONT } from '../public/widgets/lib/fonts.js';

const overlayJs = fs.readFileSync(new URL('../public/widgets/lib/overlay.js', import.meta.url), 'utf8');
const alertHtml = fs.readFileSync(new URL('../public/widgets/gift-alert/index.html', import.meta.url), 'utf8');
const omikujiHtml = fs.readFileSync(new URL('../public/widgets/omikuji/index.html', import.meta.url), 'utf8');
const gachaJs = fs.readFileSync(new URL('../public/widgets/gacha.js', import.meta.url), 'utf8');

test('基本フォント（テーマ）とギフト通知の書体の既定は default、自分の書体は空', () => {
  assert.equal(defaultsFor('theme').font, 'default');
  assert.equal(defaultsFor('theme').customFont, '');
  assert.equal(defaultsFor('alerts').font, 'default');
  assert.equal(defaultsFor('alerts').customFont, '');
});

test('知らない書体は default に落ちる（設定の検証と、画面側の引き）', () => {
  const got = cfg.normalize({ alerts: { main: { font: 'まだ無い書体' } } });
  assert.equal(got.config.alerts.main.font, 'default', '検証で既定へ寄る');
  assert.ok(got.errors.some((e) => e.includes('font')), '知らない値はエラーで知らせる');
  assert.equal(resolveFont('まだ無い書体').id, DEFAULT_FONT, '引く側も既定に寄せる');
  assert.equal(fontFamily('まだ無い書体'), '', '知らない書体では何も指定しない');
});

test('設定の選択肢と、画面のプリセットの番号がそろっている', () => {
  assert.deepEqual(FONT_VALUES, FONT_IDS);
  assert.equal(FONT_IDS[0], DEFAULT_FONT);
});

test('プリセットごとに font-family が切り替わり、無い環境では今の見え方に落ちる', () => {
  assert.equal(fontFamily('default'), '', '既定では何も指定しない（今の書体のまま）');
  const rounded = fontFamily('rounded');
  const mincho = fontFamily('mincho');
  const pop = fontFamily('pop');
  assert.match(rounded, /^"M PLUS Rounded 1c",/);
  assert.match(mincho, /^"Shippori Mincho",/);
  assert.match(pop, /^"Mochiy Pop One",/);
  assert.equal(new Set([rounded, mincho, pop]).size, 3, '3つとも違う積み重ねになる');
  for (const stack of [rounded, mincho, pop]) assert.match(stack, /var\(--font, sans-serif\)$/, '後ろは標準のゴシックの積み重ね');
});

test('custom では指定した名前が先頭に来る', () => {
  const stack = fontFamily('custom', 'こはく丸ゴ');
  assert.match(stack, /^"こはく丸ゴ",/);
  assert.match(stack, /var\(--font, sans-serif\)$/);
  assert.equal(fontFamily('custom', '   '), '', '名前が空なら何も指定しない');
  assert.equal(fontFamily('custom', 'あ"い;{}う'), '"あいう", var(--font, sans-serif)', 'CSS を壊す記号は落とす');
});

test('書体の実体は外部から読み込まない（loadFont は何もしない）', () => {
  assert.equal(loadFont('rounded'), null);
  assert.equal(loadFont('default'), null);
  const src = fs.readFileSync(new URL('../public/widgets/lib/fonts.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fonts\.googleapis|https?:\/\//, '外部の読み込み先を持たない');
});

test('applyFont は要素に書体を効かせ、印（data-font）を付ける', () => {
  const el = { style: {}, dataset: {} };
  applyFont(el, { font: 'mincho' });
  assert.match(el.style.fontFamily, /^"Shippori Mincho",/);
  assert.equal(el.dataset.font, 'mincho');
  const plain = { style: {}, dataset: {} };
  applyFont(plain, { font: 'default' });
  assert.equal(plain.style.fontFamily, undefined, '既定では何も触らない');
  assert.equal(plain.dataset.font, undefined);
});

test('共通の入り口（overlay.js）が基本フォントを当てる。setupWidget と connect の両方から', () => {
  assert.match(overlayJs, /export function applyBaseFont\(config, \.\.\.entries\)/);
  assert.match(overlayJs, /applyBaseFont\(config, entry, config\?\.\[section\]\)/, 'setupWidget から当てる');
  assert.match(overlayJs, /applyFontFromSocket\(msg\.config\)/, 'connect の設定からも当てる');
  // 個別の書体（default でないもの）が基本より優先する作り
  assert.match(overlayJs, /entries\.find\(\(e\) => e && e\.font && e\.font !== 'default'\)/);
});

test('ギフト通知は個別の書体を共通部品で効かせる', () => {
  assert.match(alertHtml, /from '\.\/lib\/fonts\.js'/);
  assert.match(alertHtml, /applyFont\(lt, p\)/);
  assert.match(alertHtml, /font: 'default', customFont: ''/);
});

test('おみくじ画面：ゲージと倍率の札があり、基本フォントのフックと進み具合の知らせを受ける', () => {
  assert.match(omikujiHtml, /id="likeGauge"/);
  assert.match(omikujiHtml, /id="lgLiquid"/);
  assert.match(omikujiHtml, /id="boostBadge"/);
  assert.match(omikujiHtml, /window\.__twApplyFont = applyBaseFont/);
  assert.match(gachaJs, /data\.event === 'progress'/, '進み具合だけの知らせはゲージだけ直す');
  assert.match(gachaJs, /function showLike\(data\)/);
});
