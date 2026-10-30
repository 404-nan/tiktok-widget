// 丸型ルーレットの見た目（スキン）。style ごとに、縁・扇の色・中心・針・光り物を描き分ける。
// wheel いつもの平らな形 / casino 金の縁と電球が回るカジノ台 / judo 畳と畳縁の柔道場 / prize ピンとゴムの爪のある本格ホイール。
// 描く順番と文字の置き方は roulette-wheel.js が持ち、ここは「どう塗るか」だけを受け持つ。

import { resolveColor } from './overlay.js';

const TAU = Math.PI * 2;
const PAPER = () => resolveColor('paper');

/** #RRGGBB を明るく（amt > 0）・暗く（amt < 0）する */
export function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function disc(ctx, c, radius) {
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, TAU);
}

function ring(ctx, c, outer, inner) {
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, TAU);
  ctx.arc(c, c, inner, 0, TAU, true);
}

/** 金属の金（直線のグラデーション）。光は左上から */
function gold(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#7A5410');
  g.addColorStop(0.28, '#F2CF6B');
  g.addColorStop(0.45, '#FFF4C4');
  g.addColorStop(0.62, '#D29E35');
  g.addColorStop(1, '#6E4B0E');
  return g;
}

// ---------------------------------------------------------------- いつもの形

const plain = {
  geometry: (c) => ({ rim: 14, rad: c - 16 }),
  back({ ctx, c, rad, rim, r }) {
    disc(ctx, c, rad + rim);
    ctx.fillStyle = r.frame;
    ctx.fill();
  },
  fill: (_s, it) => it.fill,
  ink: (_s, it) => it.ink,
  dividers({ ctx, c, rad, rim, r, items, rotation }) {
    for (const it of items) {
      const a = it.start * TAU + rotation;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
      ctx.strokeStyle = r.frame;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * (rad + rim / 2), c + Math.sin(a) * (rad + rim / 2), 3.5, 0, TAU);
      ctx.fillStyle = PAPER();
      ctx.fill();
    }
  },
  hub({ ctx, c, rad, r }) {
    disc(ctx, c, rad * 0.13);
    ctx.fillStyle = r.frame;
    ctx.fill();
    disc(ctx, c, rad * 0.13 - 5);
    ctx.strokeStyle = r.pointer;
    ctx.lineWidth = 3;
    ctx.stroke();
    disc(ctx, c, 4);
    ctx.fillStyle = PAPER();
    ctx.fill();
  },
  pointer({ ctx, c, r, pointerKick, pointerColor }) {
    ctx.save();
    ctx.translate(c, 6);
    ctx.rotate(pointerKick);
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(15, 0);
    ctx.lineTo(0, 38);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = r.frame;
    ctx.stroke();
    ctx.fillStyle = pointerColor || r.pointer;
    ctx.fill();
    ctx.restore();
  },
};

// ---------------------------------------------------------------- 画像の素材を使う形（カジノ・柔道）
// 縁・針・中心は画像（public/widgets/img/roulette/<形>/）。扇は布や畳の画像を敷き、項目の文字はコードで描く。
// 画像は 1200px 四方の盤に合わせて作ってあり（ART が盤の座標）、canvas の FIT 倍の大きさで真ん中に置く。
// 上のすき間は、針を縁より上から垂らすため。

const ART = 1200;
const FIT = 0.92;
const art = (name, file) => new URL(`../img/roulette/${name}/${file}.webp`, import.meta.url).href;
/** 盤の座標 1px が canvas で何 px か */
const unit = (c) => (c * 2 * FIT) / ART;
/** 盤の座標 → canvas の座標 */
const at = (c, v) => c + (v - ART / 2) * unit(c);
/** 扇の半径（盤の座標で r px）と縁の太さ。geometry に使う */
const artGeometry = (c, r) => ({ rad: r * unit(c), rim: c - r * unit(c) });

/** 扇に敷く画像の模様。盤と一緒に回るよう、回転に合わせて模様もずらす */
function texture(s, img) {
  if (!img) return null;
  const p = s.ctx.createPattern(img, 'repeat');
  p.setTransform(new DOMMatrix().translate(s.c, s.c).rotate((s.rotation * 180) / Math.PI).scale(unit(s.c)));
  return p;
}

/** 縁の画像を盤いっぱいに置く */
function drawRim({ ctx, c }, img) {
  if (!img) return;
  ctx.drawImage(img, at(c, 0), at(c, 0), ART * unit(c), ART * unit(c));
}

/** 中心の飾り。外径 size（盤の座標）で、盤と一緒に回す */
function drawHub(s, img, size) {
  if (!img) return;
  const { ctx, c, rotation } = s;
  const w = size * unit(c);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(rotation);
  ctx.drawImage(img, -w / 2, -w / 2, w, w);
  ctx.restore();
}

/**
 * 上の針。canvas の上端から垂らし、付け根を軸にペグに当たると少しはじかれる。
 * w・h は盤の座標での大きさ。確定演出のときは、宝石（jewel: 針の画像の中の楕円）だけを虹色に塗りかえる。
 */
function drawPointer(s, img, { w, h, jewel }) {
  if (!img) return;
  const { ctx, c, pointerKick, pointerColor } = s;
  const k = unit(c);
  ctx.save();
  ctx.translate(c, 0);
  ctx.rotate(pointerKick);
  ctx.scale(k, k);
  ctx.shadowColor = 'rgba(0, 0, 0, .5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.drawImage(img, -w / 2, 0, w, h);
  ctx.shadowColor = 'transparent';
  if (pointerColor && jewel) {
    ctx.globalCompositeOperation = 'color';
    ctx.beginPath();
    ctx.ellipse(jewel.x - w / 2, jewel.y, jewel.rx, jewel.ry, 0, 0, TAU);
    ctx.fillStyle = pointerColor;
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- カジノ

const CASINO = { text: '#FFE9A6', line: '#2B1A05' };
const CASINO_ART = Object.fromEntries(['rim', 'pointer', 'hub', 'tex-red', 'tex-black', 'tex-green'].map((f) => [f, art('casino', f)]));
// rim.png の縁の真珠（電球）の中心。上の真ん中の右から時計回り（盤の座標）
const CASINO_BULBS = [
  [670, 131], [825, 171], [948, 256], [1034, 364], [1088, 490], [1086, 708], [1034, 823], [948, 925], [825, 1008],
  [373, 1009], [250, 925], [164, 823], [112, 708], [110, 490], [165, 365], [251, 255], [374, 171], [529, 131],
];

/** 電球の点き方。回っている間は追いかけるように流れ、止まったら全部が点滅する。ふだんは静かに全部点けておく */
function bulbOn(k, lights, now) {
  if (lights.mode === 'spin') return (k + Math.floor(now / 60)) % 3 === 0;
  if (lights.mode === 'done') return Math.floor((now - lights.since) / 140) % 2 === 0;
  return true;
}

const casino = {
  font: '"Dela Gothic One", "Zen Kaku Gothic New", sans-serif',
  weight: '400',
  lights: true,
  images: CASINO_ART,
  // 扇は縁の窓（直径 約 840px）より少し大きく描き、はみ出しは縁の画像で隠す
  geometry: (c) => artGeometry(c, 432),
  back() {},
  fill(s, it) {
    if (!it.autoColor) return it.fill;
    const tex = it.win ? 'tex-green' : it.order % 2 === 0 ? 'tex-red' : 'tex-black';
    return texture(s, s.img[tex]) ?? it.fill;
  },
  ink: (_s, it) => (it.autoColor ? CASINO.text : it.ink),
  overSegments({ ctx, c, rad }) {
    // 盤のくぼみ: 中心と縁ぎわを暗く
    const g = ctx.createRadialGradient(c, c, rad * 0.25, c, c, rad);
    g.addColorStop(0, 'rgba(0, 0, 0, .35)');
    g.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, .5)');
    disc(ctx, c, rad);
    ctx.fillStyle = g;
    ctx.fill();
  },
  dividers({ ctx, c, rad, items, rotation }) {
    for (const it of items) {
      const a = it.start * TAU + rotation;
      const x = c + Math.cos(a) * rad;
      const y = c + Math.sin(a) * rad;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * rad * 0.27, c + Math.sin(a) * rad * 0.27);
      ctx.lineTo(x, y);
      ctx.strokeStyle = CASINO.line;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = gold(ctx, c, c, x, y);
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  },
  hub: (s) => drawHub(s, s.img.hub, 2 * 432 * 0.27 * (360 / 340)),
  front(s) {
    const { ctx, c, lights, now } = s;
    drawRim(s, s.img.rim);
    // 点いている電球に光を足す（画像の真珠は消えた状態）
    if (!s.img.rim) return;
    const k = unit(c);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    CASINO_BULBS.forEach(([bx, by], i) => {
      if (!bulbOn(i, lights, now)) return;
      const x = at(c, bx);
      const y = at(c, by);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 46 * k);
      g.addColorStop(0, 'rgba(255, 244, 200, .95)');
      g.addColorStop(0.35, 'rgba(255, 200, 90, .55)');
      g.addColorStop(1, 'rgba(255, 150, 30, 0)');
      ctx.beginPath();
      ctx.arc(x, y, 46 * k, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.restore();
  },
  // 針の画像（200×260）を 1.12 倍。先が縁の内側の金を越えて、扇に少しかかる
  pointer: (s) => drawPointer(s, s.img.pointer, { w: 224, h: 291, jewel: { x: 112, y: 121, rx: 31, ry: 45 } }),
};

// ---------------------------------------------------------------- 柔道

// 畳（淡い緑と濃い緑）を交互に。当たりは紅。境目は細い金
const JUDO = { ink: '#17171A', line: '#8A5A1E' };
const JUDO_ART = Object.fromEntries(['rim', 'pointer', 'hub', 'tex-tatami', 'tex-tatami2', 'tex-beni'].map((f) => [f, art('judo', f)]));
const JUDO_RAD = 480; // 縁の窓（直径 約 900〜950px）より少し大きく

const judo = {
  font: '"Dela Gothic One", "Zen Kaku Gothic New", sans-serif',
  weight: '400',
  images: JUDO_ART,
  geometry: (c) => artGeometry(c, JUDO_RAD),
  back() {},
  fill(s, it) {
    if (!it.autoColor) return it.fill;
    const tex = it.win ? 'tex-beni' : it.order % 2 === 0 ? 'tex-tatami' : 'tex-tatami2';
    return texture(s, s.img[tex]) ?? it.fill;
  },
  ink: (_s, it) => (it.autoColor ? (it.win ? '#FFFFFF' : JUDO.ink) : it.ink),
  overSegments({ ctx, c, rad }) {
    // 縁ぎわに落ちる影
    const g = ctx.createRadialGradient(c, c, rad * 0.8, c, c, rad);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, .35)');
    disc(ctx, c, rad);
    ctx.fillStyle = g;
    ctx.fill();
  },
  dividers({ ctx, c, rad, items, rotation }) {
    for (const it of items) {
      const a = it.start * TAU + rotation;
      const x = c + Math.cos(a) * rad;
      const y = c + Math.sin(a) * rad;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(x, y);
      ctx.strokeStyle = JUDO.line;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = gold(ctx, c, c, x, y);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },
  hub: (s) => drawHub(s, s.img.hub, 2 * JUDO_RAD * 0.2 * (360 / 340)),
  front: (s) => drawRim(s, s.img.rim),
  // 針の画像（200×260）を 1.035 倍。先が縁の内側の金を越えて、扇に少しかかる
  pointer: (s) => drawPointer(s, s.img.pointer, { w: 207, h: 269, jewel: { x: 103, y: 67, rx: 25, ry: 25 } }),
};

// ---------------------------------------------------------------- 本格ホイール(テレビの抽選ホイール)
// 縁に鋲(ピン)がたくさん並び、ゴムの爪の針がピンに押されてしなり、外れるとパチンと戻る(カチカチ鳴る)。
// 爪のしなりと音は roulette-wheel.js が pegs の数から計算する。ここは形と塗りだけ

const PRIZE = { rim: '#1B1B1F', rimEdge: '#3A3A42', stud: '#E9E4D8', studShade: '#8D8778', flap: '#D7261E', flapEdge: '#5E0E0A', hub: '#141417' };
// ピンは同じ間かくで24本(多すぎると点が目立ち、少なすぎるとカチカチが出ない)
const PEG_COUNT = 24;
const prizePegs = () => Array.from({ length: PEG_COUNT }, (_, k) => k / PEG_COUNT);

const prize = {
  geometry: (c) => ({ rim: 34, rad: c - 36 }),
  pegs: (items) => prizePegs(items),
  back({ ctx, c, rad }) {
    // 外の縁: 黒い金属の輪に、内と外の細い光の線
    disc(ctx, c, c - 2);
    ctx.fillStyle = PRIZE.rim;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PRIZE.rimEdge;
    disc(ctx, c, c - 3);
    ctx.stroke();
    disc(ctx, c, rad + 3);
    ctx.stroke();
  },
  fill: (_s, it) => it.fill,
  ink: (_s, it) => it.ink,
  overSegments({ ctx, c, rad, items, rotation }) {
    // 扇の外側に細い影の帯(縁の下にもぐって見える)と、内側の明るい線
    for (const it of items) {
      const a0 = it.start * TAU + rotation;
      const a1 = it.end * TAU + rotation;
      ctx.beginPath();
      ctx.arc(c, c, rad, a0, a1);
      ctx.arc(c, c, rad * 0.9, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, .16)';
      ctx.fill();
    }
    disc(ctx, c, rad * 0.9);
    ctx.strokeStyle = 'rgba(255, 255, 255, .22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },
  dividers({ ctx, c, rad, rim, items, rotation }) {
    for (const it of items) {
      const a = it.start * TAU + rotation;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * rad * 0.16, c + Math.sin(a) * rad * 0.16);
      ctx.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
      ctx.strokeStyle = PRIZE.rim;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 縁の鋲(ピン)。台座の影 → 頭 → 光る点
    const pr = rad + rim / 2;
    for (const f of prizePegs(items)) {
      const a = f * TAU + rotation;
      const x = c + Math.cos(a) * pr;
      const y = c + Math.sin(a) * pr;
      ctx.beginPath();
      ctx.arc(x + 1, y + 1.5, 4.6, 0, TAU);
      ctx.fillStyle = 'rgba(0, 0, 0, .55)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, TAU);
      ctx.fillStyle = PRIZE.studShade;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 0.6, y - 0.8, 3, 0, TAU);
      ctx.fillStyle = PRIZE.stud;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 1.4, y - 1.6, 1, 0, TAU);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
  },
  hub({ ctx, c, rad, r }) {
    // 中心: 黒い台 → 色の輪 → ボルト6本 → まんなかのキャップ
    disc(ctx, c, rad * 0.17);
    ctx.fillStyle = PRIZE.hub;
    ctx.fill();
    disc(ctx, c, rad * 0.17 - 4);
    ctx.strokeStyle = r.pointer;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * rad * 0.1, c + Math.sin(a) * rad * 0.1, 2.4, 0, TAU);
      ctx.fillStyle = PRIZE.studShade;
      ctx.fill();
    }
    disc(ctx, c, rad * 0.05);
    ctx.fillStyle = PRIZE.stud;
    ctx.fill();
  },
  pointer({ ctx, c, rim, pointerKick, pointerColor }) {
    // ゴムの爪: 上の軸で留まり、ピンに押されると左右にしなる
    const len = rim + 48;
    ctx.save();
    ctx.translate(c, 4);
    ctx.rotate(pointerKick);
    // 爪の影(盤の上に落ちる)
    ctx.save();
    ctx.translate(3, 4);
    ctx.beginPath();
    ctx.moveTo(-11, 6);
    ctx.quadraticCurveTo(-12, len * 0.55, -2, len);
    ctx.lineTo(2, len);
    ctx.quadraticCurveTo(12, len * 0.55, 11, 6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, .35)';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-11, 6);
    ctx.quadraticCurveTo(-12, len * 0.55, -2, len);
    ctx.lineTo(2, len);
    ctx.quadraticCurveTo(12, len * 0.55, 11, 6);
    ctx.closePath();
    ctx.fillStyle = pointerColor || PRIZE.flap;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PRIZE.flapEdge;
    ctx.stroke();
    // 軸の金具
    ctx.beginPath();
    ctx.arc(0, 8, 7, 0, TAU);
    ctx.fillStyle = PRIZE.stud;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PRIZE.studShade;
    ctx.stroke();
    ctx.restore();
  },
};

export const SKINS = { wheel: plain, casino, judo, prize };
export const skinFor = (style) => SKINS[style] ?? plain;
