// 丸型ルーレットの見た目（スキン）。style ごとに、縁・扇の色・中心・針・光り物を描き分ける。
// wheel いつもの平らな形 / casino 金の縁と電球が回るカジノ台 / judo 畳と畳縁の柔道場。
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

// ---------------------------------------------------------------- カジノ

const CASINO = { red: '#B3101C', black: '#1A1A1E', green: '#0E6E3C', text: '#FFE9A6' };
const BULBS = 28;

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
  geometry: (c) => ({ rim: 50, rad: c - 52 }),
  back({ ctx, c, rad, lights, now }) {
    const outer = c - 2;
    // 外側のマホガニーの木枠
    const wood = ctx.createRadialGradient(c, c, rad + 8, c, c, outer);
    wood.addColorStop(0, '#2A0705');
    wood.addColorStop(0.45, '#6E1F14');
    wood.addColorStop(0.8, '#4A120C');
    wood.addColorStop(1, '#1E0504');
    disc(ctx, c, outer);
    ctx.fillStyle = wood;
    ctx.fill();
    // 木枠の外周と、扇の外の金の縁
    ctx.lineWidth = 3;
    ctx.strokeStyle = gold(ctx, 0, 0, c * 2, c * 2);
    disc(ctx, c, outer - 1.5);
    ctx.stroke();
    ring(ctx, c, rad + 11, rad - 1);
    ctx.fillStyle = gold(ctx, c - rad, c - rad, c + rad, c + rad);
    ctx.fill();
    disc(ctx, c, rad + 11);
    ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 電球
    const br = (outer + rad + 11) / 2;
    for (let k = 0; k < BULBS; k++) {
      const a = (k / BULBS) * TAU - Math.PI / 2;
      const x = c + Math.cos(a) * br;
      const y = c + Math.sin(a) * br;
      const on = bulbOn(k, lights, now);
      // 台座
      ctx.beginPath();
      ctx.arc(x, y, 8.5, 0, TAU);
      ctx.fillStyle = gold(ctx, x - 9, y - 9, x + 9, y + 9);
      ctx.fill();
      if (on) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 17);
        glow.addColorStop(0, 'rgba(255, 236, 170, .9)');
        glow.addColorStop(1, 'rgba(255, 190, 60, 0)');
        ctx.beginPath();
        ctx.arc(x, y, 17, 0, TAU);
        ctx.fillStyle = glow;
        ctx.fill();
      }
      const bulb = ctx.createRadialGradient(x - 2, y - 2, 0.5, x, y, 6.5);
      bulb.addColorStop(0, on ? '#FFFFFF' : '#A88A55');
      bulb.addColorStop(0.45, on ? '#FFF2B0' : '#6B4C1C');
      bulb.addColorStop(1, on ? '#F5A623' : '#3A2508');
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fillStyle = bulb;
      ctx.fill();
    }
  },
  fill({ ctx, c, rad }, it, i) {
    let base;
    if (!it.autoColor) base = it.fill;
    else if (it.win) base = CASINO.green;
    else base = it.order % 2 === 0 ? CASINO.red : CASINO.black;
    if (!/^#[0-9a-f]{6}$/i.test(base)) return base;
    // 中心は暗く、外へ向かって明るい（盤のくぼみ）
    const g = ctx.createRadialGradient(c, c, rad * 0.2, c, c, rad);
    g.addColorStop(0, shade(base, -0.55));
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade(base, 0.12));
    return g;
  },
  ink: (_s, it) => (it.autoColor ? CASINO.text : it.ink),
  overSegments({ ctx, c, rad }) {
    // 盤の内側の影（縁の金から落ちる影）
    const g = ctx.createRadialGradient(c, c, rad * 0.82, c, c, rad);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, .45)');
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
      ctx.strokeStyle = '#2B1A05';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = gold(ctx, c, c, x, y);
      ctx.lineWidth = 2;
      ctx.stroke();
      // 縁の鋲
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * (rad + 5), c + Math.sin(a) * (rad + 5), 4, 0, TAU);
      ctx.fillStyle = '#FFF4C4';
      ctx.fill();
      ctx.strokeStyle = '#6E4B0E';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  },
  hub({ ctx, c, rad, rotation }) {
    const R = rad * 0.27;
    // 受け皿（暗い金）→ 金の円盤 → 回る十字の腕
    disc(ctx, c, R);
    ctx.fillStyle = '#24170A';
    ctx.fill();
    disc(ctx, c, R - 4);
    ctx.fillStyle = gold(ctx, c - R, c - R, c + R, c + R);
    ctx.fill();
    disc(ctx, c, R * 0.62);
    const inner = ctx.createRadialGradient(c - R * 0.2, c - R * 0.2, 2, c, c, R * 0.62);
    inner.addColorStop(0, '#FFF4C4');
    inner.addColorStop(0.5, '#C8962E');
    inner.addColorStop(1, '#5E3F0B');
    ctx.fillStyle = inner;
    ctx.fill();
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rotation);
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(3, 0);
      ctx.lineTo(2, -R * 0.95);
      ctx.lineTo(-2, -R * 0.95);
      ctx.closePath();
      ctx.fillStyle = gold(ctx, -4, 0, 4, -R);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -R * 0.95, 5.5, 0, TAU);
      const ball = ctx.createRadialGradient(-2, -R * 0.95 - 2, 0.5, 0, -R * 0.95, 5.5);
      ball.addColorStop(0, '#FFFFFF');
      ball.addColorStop(0.5, '#F2CF6B');
      ball.addColorStop(1, '#6E4B0E');
      ctx.fillStyle = ball;
      ctx.fill();
    }
    ctx.restore();
    disc(ctx, c, 7);
    ctx.fillStyle = '#FFF4C4';
    ctx.fill();
  },
  pointer({ ctx, c, pointerKick, pointerColor }) {
    ctx.save();
    ctx.translate(c, 4);
    ctx.rotate(pointerKick);
    ctx.shadowColor = 'rgba(0, 0, 0, .55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(22, 0);
    ctx.lineTo(0, 62);
    ctx.closePath();
    ctx.fillStyle = gold(ctx, -22, 0, 22, 40);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4A3008';
    ctx.stroke();
    // 赤い宝石（確定演出のときは虹色）
    ctx.beginPath();
    ctx.arc(0, 18, 9, 0, TAU);
    const jewel = ctx.createRadialGradient(-3, 15, 1, 0, 18, 9);
    jewel.addColorStop(0, '#FFFFFF');
    jewel.addColorStop(0.35, pointerColor || '#FF3B48');
    jewel.addColorStop(1, pointerColor ? '#222222' : '#7A0610');
    ctx.fillStyle = jewel;
    ctx.fill();
    ctx.strokeStyle = '#4A3008';
    ctx.stroke();
    ctx.restore();
  },
  front({ ctx, c, rad }) {
    // ガラスの映り込み（左上にだけ、回らない）
    ctx.save();
    disc(ctx, c, rad);
    ctx.clip();
    const g = ctx.createLinearGradient(c - rad, c - rad, c, c);
    g.addColorStop(0, 'rgba(255, 255, 255, .16)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.beginPath();
    ctx.ellipse(c - rad * 0.3, c - rad * 0.45, rad * 0.75, rad * 0.4, -0.6, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  },
};

// ---------------------------------------------------------------- 柔道

// 畳（い草の緑）を2色で交互に。当たりは紅。境目は紺の畳縁
const JUDO = { igusa: '#B7B46B', igusa2: '#A3A15A', beni: '#C3121E', heri: '#1D2440', ink: '#17171A' };

const judo = {
  font: '"Dela Gothic One", "Zen Kaku Gothic New", sans-serif',
  weight: '400',
  geometry: (c) => ({ rim: 30, rad: c - 32 }),
  back({ ctx, c, rad }) {
    const outer = c - 2;
    // 畳縁（紺地に、細い2本線と白い菱の紋）
    disc(ctx, c, outer);
    ctx.fillStyle = JUDO.heri;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, .28)';
    ctx.lineWidth = 1.5;
    for (const k of [outer - 5, rad + 6]) {
      disc(ctx, c, k);
      ctx.stroke();
    }
    const mid = (outer + rad) / 2 + 0.5;
    const count = 36;
    ctx.fillStyle = '#E9E4D4';
    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU;
      ctx.save();
      ctx.translate(c + Math.cos(a) * mid, c + Math.sin(a) * mid);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -4.5);
      ctx.lineTo(4.5, 0);
      ctx.lineTo(0, 4.5);
      ctx.lineTo(-4.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  },
  fill(_s, it) {
    if (!it.autoColor) return it.fill;
    if (it.win) return JUDO.beni;
    return it.order % 2 === 0 ? JUDO.igusa : JUDO.igusa2;
  },
  ink: (_s, it) => (it.autoColor ? (it.win ? '#FFFFFF' : JUDO.ink) : it.ink),
  overSegments({ ctx, c, rad }) {
    // い草の目: 細い同心円をすき間なく重ねる
    ctx.save();
    disc(ctx, c, rad);
    ctx.clip();
    ctx.lineWidth = 1;
    for (let k = rad * 0.14; k < rad; k += 3) {
      disc(ctx, c, k);
      ctx.strokeStyle = (k / 3) % 2 < 1 ? 'rgba(60, 52, 10, .16)' : 'rgba(255, 255, 230, .10)';
      ctx.stroke();
    }
    ctx.restore();
  },
  dividers({ ctx, c, rad, items, rotation }) {
    for (const it of items) {
      const a = it.start * TAU + rotation;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
      ctx.strokeStyle = JUDO.heri;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, .25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },
  hub({ ctx, c, rad }) {
    const R = rad * 0.2;
    // 黒帯の結び目: 結び目から帯の端が2本、ハの字に垂れる（回らない）
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(c + side * R * 0.25, c + R * 0.55);
      ctx.rotate(side * -0.42);
      ctx.beginPath();
      ctx.moveTo(-R * 0.27, 0);
      ctx.lineTo(R * 0.27, 0);
      ctx.lineTo(R * 0.27, R * 1.35);
      ctx.lineTo(-R * 0.27, R * 1.45);
      ctx.closePath();
      ctx.fillStyle = '#121214';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, .25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-R * 0.12, R * 0.15);
      ctx.lineTo(-R * 0.12, R * 1.3);
      ctx.strokeStyle = '#D6A93A';
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    disc(ctx, c, R);
    ctx.fillStyle = '#121214';
    ctx.fill();
    ctx.setLineDash([5, 4]);
    disc(ctx, c, R - 6);
    ctx.strokeStyle = '#D6A93A';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `400 ${Math.round(R * 1.05)}px "Dela Gothic One", "Zen Kaku Gothic New", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('柔', c, c + 2);
  },
  pointer({ ctx, c, pointerKick, pointerColor }) {
    // 審判の旗: 白い縁取りの紅い旗
    ctx.save();
    ctx.translate(c, 2);
    ctx.rotate(pointerKick);
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.lineTo(20, 26);
    ctx.lineTo(0, 52);
    ctx.lineTo(-20, 26);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = JUDO.ink;
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.fillStyle = pointerColor || JUDO.beni;
    ctx.fill();
    ctx.restore();
  },
};

export const SKINS = { wheel: plain, casino, judo };
export const skinFor = (style) => SKINS[style] ?? plain;
