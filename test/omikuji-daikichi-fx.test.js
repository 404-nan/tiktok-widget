// おみくじの大吉の確定演出（Three.js 版、public/widgets/omikuji/daikichi-fx.js）の時刻表と、
// three を「大吉の reveal が始まったときだけ」読むこと、置き場所（版の固定・CDN なし）、画面へのつなぎを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { daikichiTimeline, startDaikichiFx } from '../public/widgets/omikuji/daikichi-fx.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('public/widgets/omikuji/index.html');
const fxSrc = read('public/widgets/omikuji/daikichi-fx.js');

test('破裂の前は光が集まるだけで、粉・輪・閃光は出ない', () => {
  for (const burstAt of [0.5, 1.2]) {
    const tl = daikichiTimeline(burstAt * 0.6, burstAt);
    assert.ok(tl.gather > 0 && tl.gather < 1);
    assert.ok(tl.halo < 0.3);
    assert.ok(tl.sparkT < 0);
    assert.equal(tl.flash, 0);
    assert.deepEqual(tl.rings.map((r) => r.a), [0, 0]);
  }
});

test('破裂の直後に閃光と1つめの輪、字が決まるころに2つめの輪が出る', () => {
  const at = 1.2;
  const just = daikichiTimeline(at + 0.1, at);
  assert.ok(just.flash > 0.5);
  assert.ok(just.rings[0].a > 0);
  assert.equal(just.rings[1].a, 0);
  assert.equal(just.halo, 1);
  const land = daikichiTimeline(at + 0.7, at);
  assert.ok(land.rings[1].a > 0);
});

test('余韻では輪と閃光が消え、後光と舞う粉だけが残る', () => {
  const tl = daikichiTimeline(8, 1.2);
  assert.equal(tl.flash, 0);
  assert.deepEqual(tl.rings.map((r) => r.a), [0, 0]);
  assert.equal(tl.halo, 1);
  assert.equal(tl.dust, 1);
  assert.ok(tl.haloScale >= 1 && tl.haloScale <= 1.05);
});

test('輪は描く板の半分（300px）より外へ広がらない', () => {
  for (let t = 0; t < 4; t += 0.05) for (const r of daikichiTimeline(t, 0.5).rings) assert.ok(r.r <= 300);
});

// 舞台の要素と、ブラウザの道具の最小の代わり。three の読み込み（load）の回数を数える
function fakeStage({ reduced = false } = {}) {
  const attrs = {};
  const classes = new Set();
  let observe = null;
  globalThis.window = { matchMedia: () => ({ matches: reduced }) };
  globalThis.MutationObserver = class { constructor(cb) { observe = cb; } observe() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '1.2s', opacity: '1' });
  const stage = {
    getAttribute: (k) => attrs[k] ?? null,
    querySelector: () => null,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
  };
  const set = (tier, phase) => { attrs['data-tier'] = tier; attrs['data-phase'] = phase; observe(); };
  return { stage, set, classes };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('three はページを開いたときもほかの運勢でも読まず、大吉の reveal が始まったときに初めて1回読む', async () => {
  const { stage, set } = fakeStage();
  let loads = 0;
  startDaikichiFx(stage, () => { loads++; return Promise.reject(new Error('テストでは描かない')); });
  assert.equal(loads, 0, 'ページを開いただけで読んだ');
  set('kichi', 'reveal');
  set('kichi', 'done');
  set('', 'idle');
  assert.equal(loads, 0, '大吉以外で読んだ');
  set('daikichi', 'done');
  assert.equal(loads, 0, '終わりの段階から開いたのに読んだ');
  set('', 'idle');
  set('daikichi', 'reveal');
  assert.equal(loads, 1);
  set('daikichi', 'reveal'); // 同じ段階の知らせがもう一度来ても読み直さない
  assert.equal(loads, 1);
});

test('three が読めなかったら .fx-3d を付けず（CSS 版のまま）、このページでは読み直さない', async () => {
  const { stage, set, classes } = fakeStage();
  let loads = 0;
  startDaikichiFx(stage, () => { loads++; return Promise.reject(new Error('読めない')); });
  set('daikichi', 'reveal');
  await tick();
  assert.equal(classes.has('fx-3d'), false);
  set('', 'idle');
  set('daikichi', 'reveal');
  await tick();
  assert.equal(loads, 1);
});

test('動きを減らす設定では、大吉でも three を読まない', () => {
  const { stage, set } = fakeStage({ reduced: true });
  let loads = 0;
  startDaikichiFx(stage, () => { loads++; return Promise.reject(new Error('x')); });
  set('daikichi', 'reveal');
  assert.equal(loads, 0);
});

test('三つの後片付け（描画ループ・立体と素材・板）が、大吉が終わるときに呼ばれる', () => {
  assert.match(fxSrc, /if \(!on \|\| newReveal\) stop\(\);/);
  const stop = fxSrc.slice(fxSrc.indexOf('const stop = () => {'), fxSrc.indexOf('const start = () => {'));
  assert.match(stop, /cancelAnimationFrame\(raf\)/);
  assert.match(stop, /fx\.dispose\(\)/);
  const dispose = fxSrc.slice(fxSrc.indexOf('dispose() {'));
  for (const re of [/geometry\.dispose\(\)/, /material\.dispose\(\)/, /renderer\.dispose\(\)/, /renderer\.forceContextLoss\(\)/, /canvas\.remove\(\)/]) assert.match(dispose, re);
});

test('three は版を固定して omikuji フォルダの下に置き、そこから読む（CDN なし）', () => {
  const mod = read('public/widgets/omikuji/three/three.module.min.js');
  const core = read('public/widgets/omikuji/three/three.core.min.js');
  assert.match(core, /"183"/, 'three の版が 0.183 でない');
  assert.match(mod, /from"\.\/three\.core\.min\.js"/);
  assert.match(read('public/widgets/omikuji/three/README.md'), /0\.183\.0/);
  assert.match(fxSrc, /new URL\('\.\/three\/three\.module\.min\.js', import\.meta\.url\)/);
  assert.doesNotMatch(fxSrc, /https?:\/\//);
});

test('おみくじの画面が演出を読み、描けたときだけ CSS の後光・輪・粉を消す', () => {
  assert.match(html, /import \{ startDaikichiFx \} from '\.\/omikuji\/daikichi-fx\.js'/);
  assert.match(html, /\.stage\.fx-3d \.glory, \.stage\.fx-3d \.fx-front \{ display: none; \}/);
  // 描けないときの CSS の演出は残っている
  assert.match(html, /\.stage\[data-tier="daikichi"\]\[data-phase="reveal"\] \.sparks span/);
});
