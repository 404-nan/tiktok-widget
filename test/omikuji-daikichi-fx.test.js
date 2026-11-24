// おみくじの大吉の確定演出（Three.js 版、public/widgets/omikuji/daikichi-fx.js）の時刻表（溜め → 解放（頂点は1回）→ 余韻 → 収束）と、
// three を「大吉の reveal が始まったときだけ」読むこと、置き場所（版の固定・CDN なし）、画面へのつなぎを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { daikichiTimeline, startDaikichiFx, PARTICLES, RING_MAX, EMIT_SPREAD } from '../public/widgets/omikuji/daikichi-fx.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('public/widgets/omikuji/index.html');
const fxSrc = read('public/widgets/omikuji/daikichi-fx.js');

const STEP = 0.005;
const range = (from, to) => { const out = []; for (let t = from; t < to - 1e-9; t += STEP) out.push(t); return out; };

test('溜め: 光が加速して集まり、回りが速くなり、強くなり、最後の3割だけ震える。粉・輪・閃光はまだ出ない', () => {
  for (const L of [0.5, 1.2]) {
    const ts = range(0, L);
    const tl = ts.map((t) => daikichiTimeline(t, L));
    for (let i = 1; i < tl.length; i++) {
      for (const k of ['gather', 'spin', 'halo', 'beams', 'tension', 'shake']) assert.ok(tl[i][k] >= tl[i - 1][k], `溜めの ${k} が下がった（${ts[i]}秒）`);
    }
    // 集まり方は二乗以上の加速: 半分の時間では 1/4 以下しか進まず、進む速さは後ほど速い
    const half = daikichiTimeline(L / 2, L).gather;
    assert.ok(half <= 0.25 + 1e-9, `半分で ${half}`);
    for (let i = 2; i < tl.length; i++) assert.ok(tl[i].gather - tl[i - 1].gather >= tl[i - 1].gather - tl[i - 2].gather - 1e-12, '集まり方が減速した');
    assert.ok(daikichiTimeline(L * 0.99, L).spin > 5, '回りが速くなっていない');
    // 強さは静かに始まり、解放の直前ではっきり上がる
    assert.ok(tl[0].halo < 0.1 && daikichiTimeline(L * 0.99, L).halo > 4 * tl[0].halo);
    // 震えは最後の3割だけ。0 から少しずつ増える
    assert.equal(daikichiTimeline(L * 0.69, L).shake, 0);
    assert.ok(daikichiTimeline(L * 0.75, L).shake > 0 && daikichiTimeline(L * 0.75, L).shake < 0.1);
    assert.ok(daikichiTimeline(L * 0.99, L).shake > 0.9);
    for (const x of tl) {
      assert.ok(x.sparkT < 0);
      assert.equal(x.flash, 0);
      assert.ok(x.rings.every((r) => r.a === 0));
    }
    // 震え・溜めの強さは解放の瞬間に止まる
    assert.equal(daikichiTimeline(L, L).shake, 0);
    assert.equal(daikichiTimeline(L, L).tension, 0);
    assert.equal(daikichiTimeline(L + 2, L).shake, 0);
  }
});

test('解放: 強さの頂点は解放の瞬間の1回だけで、そのあとは下がるだけ（字が決まって朱印が押される 0.5秒後にも山がない）', () => {
  for (const L of [0.5, 1.2]) {
    const peak = daikichiTimeline(L, L);
    assert.equal(peak.flash, 1);
    const all = range(0, L + 8).map((t) => daikichiTimeline(t, L));
    for (const k of ['flash', 'halo', 'beams']) {
      assert.ok(all.every((x) => x[k] <= peak[k] + 1e-9), `${k} が解放より強くなる`);
      const after = range(L, L + 8).map((t) => daikichiTimeline(t, L)[k]);
      for (let i = 1; i < after.length; i++) assert.ok(after[i] <= after[i - 1] + 1e-9, `${k} が解放のあと ${(i * STEP).toFixed(3)}秒で上がった`);
    }
    // 後光の大きさは余韻で小さく脈打つ（±4.5%）だけで、解放の大きさには届かない
    assert.ok(all.every((x) => x.haloScale <= peak.haloScale + 1e-9) && range(L + 1.5, L + 8).every((t) => daikichiTimeline(t, L).haloScale < 0.85 * peak.haloScale));
    // 0.5秒後（朱印のころ）は、解放より弱く、少し前より弱い
    const near = daikichiTimeline(L + 0.5, L), before = daikichiTimeline(L + 0.4, L);
    for (const k of ['flash', 'halo', 'beams']) assert.ok(near[k] < peak[k] && near[k] <= before[k]);
  }
});

test('解放: 輪3つと金の粉は全部、解放の瞬間から出始める', () => {
  for (const L of [0.5, 1.2]) {
    assert.ok(daikichiTimeline(L - 0.001, L).rings.every((r) => r.a === 0));
    assert.ok(daikichiTimeline(L + 0.02, L).rings.every((r) => r.a > 0), '解放の瞬間に出ない輪がある');
    assert.ok(daikichiTimeline(L + 0.02, L).sparkT > 0);
    // 解放のあとに新しく出る輪はない（0.5秒後に 0 から上がる輪がない）
    for (let i = 0; i < 3; i++) {
      const as = range(L + 0.3, L + 3).map((t) => daikichiTimeline(t, L).rings[i].a);
      for (let j = 1; j < as.length; j++) assert.ok(as[j] <= as[j - 1] + 1e-9, `輪${i + 1}が解放のあとにもう一度出た`);
    }
  }
  // 粉の出るばらつきは解放から 0.1秒未満（破裂も冠も）
  for (const s of Object.values(EMIT_SPREAD)) assert.ok(s >= 0 && s < 0.1);
});

test('余韻: 閃光と輪は消え、光の柱と後光は頂点の6割以下で残り、舞う粉が出る', () => {
  for (const L of [0.5, 1.2]) {
    const peak = daikichiTimeline(L, L);
    const tl = daikichiTimeline(L + 3, L);
    assert.equal(tl.flash, 0);
    assert.ok(tl.rings.every((r) => r.a === 0));
    assert.ok(tl.beams > 0.5, '余韻で光の柱が消えた');
    assert.ok(tl.beams <= 0.6 * peak.beams && tl.halo <= 0.6 * peak.halo, '余韻が頂点に近すぎる');
    assert.equal(tl.dust, 1);
    assert.ok(tl.haloScale >= 1 && tl.haloScale <= 1.05);
    assert.ok(tl.spin < 1.05, '余韻の回りが速いまま');
  }
});

test('回る角度は溜め・解放・余韻をまたいで途切れない', () => {
  for (const L of [0.5, 1.2]) {
    const ts = range(0, L + 4);
    for (let i = 1; i < ts.length; i++) {
      const d = daikichiTimeline(ts[i], L).rayTurn - daikichiTimeline(ts[i - 1], L).rayTurn;
      assert.ok(d > 0 && d < 0.02, `${ts[i]}秒で角度が飛んだ: ${d}`);
    }
  }
});

test('輪は画面の端（640x500 の角まで約 424px）まで広がる', () => {
  const max = [0, 0, 0];
  for (let t = 0; t < 4; t += 0.01) daikichiTimeline(t, 0.5).rings.forEach((r, i) => { max[i] = Math.max(max[i], r.r); });
  assert.ok(max[0] > 424 && max[2] > 424, `輪が端まで届かない: ${max}`);
  max.forEach((m, i) => assert.ok(m <= RING_MAX[i]));
});

test('収束: 光が中心へ集まり、小さく灯ってから消える', () => {
  const tl = (end) => daikichiTimeline(9, 1.2, end);
  assert.equal(tl(0.3).converge, 0);
  assert.equal(tl(0.3).ember, 0);
  assert.equal(tl(0.3).fade, 1);
  assert.ok(tl(0.82).converge > 0.9, '集まっていない');
  assert.ok(tl(0.84).ember > 0.9, '灯らない');
  assert.ok(tl(0.84).haloScale < 0.3, '後光が縮んでいない');
  assert.equal(tl(1).ember, 0);
  assert.equal(tl(1).fade, 0);
});

test('粒は合わせて千個未満', () => {
  const total = Object.values(PARTICLES).reduce((a, b) => a + b, 0);
  assert.ok(total < 1000, `粒が ${total} 個`);
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

test('動きを減らす設定では、CSS 版の後光・輪・粉も出さない', () => {
  const media = html.slice(html.indexOf('@media (prefers-reduced-motion: reduce)'));
  const block = media.slice(0, media.indexOf('</style>'));
  for (const cls of ['.glory', '.fx-dim', '.fx-front']) assert.ok(block.includes(cls), `${cls} が対象に入っていない`);
  assert.match(block, /display: none !important/);
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
  // 描く板は画面いっぱい（金の粉や輪が画面の端まで届く）
  assert.match(html, /\.fx-3d-canvas \{ position: fixed; inset: 0;/);
  // 描けないときの CSS の演出は残っている
  assert.match(html, /\.stage\[data-tier="daikichi"\]\[data-phase="reveal"\] \.sparks span/);
});
