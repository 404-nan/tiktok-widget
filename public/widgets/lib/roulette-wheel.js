// 丸型ルーレットの描画。
// 画像のない項目は今までどおり文字を扇の中心線に沿って置き、
// 画像のある項目は画像と文字を「針の位置に来たとき正立する」向きで置く。

import { loadImage, resolveColor } from './overlay.js';
import { tick } from './roulette.js';

const TAU = Math.PI * 2;
const POINTER = -Math.PI / 2;
const FONT = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
const norm = (a) => ((a % TAU) + TAU) % TAU;
const PAPER = () => resolveColor('paper');

export function createWheel(root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let r = null; // 表示中のルーレット
  let images = new Map();
  let size = 0;
  let rotation = 0;
  let pointerKick = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    size = Math.floor(Math.max(160, Math.min(innerWidth, innerHeight - 70) - 12));
    const dpr = devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fitText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
  }

  function drawContain(img, cx, cy, box) {
    const k = Math.min(box / img.width, box / img.height);
    const w = img.width * k;
    const h = img.height * k;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }

  function draw() {
    if (!r || !size) return;
    const c = size / 2;
    const rim = 14;
    const rad = c - rim - 2;
    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(c, c, rad + rim, 0, TAU);
    ctx.fillStyle = r.frame;
    ctx.fill();

    for (const it of r.items) {
      const a0 = it.start * TAU + rotation;
      const a1 = it.end * TAU + rotation;
      const span = (it.end - it.start) * TAU;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, rad, a0, a1);
      ctx.closePath();
      ctx.fillStyle = it.fill;
      ctx.fill();

      const mid = (a0 + a1) / 2;
      const img = images.get(it.src);
      ctx.save();
      ctx.translate(c, c);
      ctx.fillStyle = it.ink;
      if (img) {
        // 外向きが「上」になる向き。針の位置（真上）に来たとき正立する
        ctx.rotate(mid + Math.PI / 2);
        const dist = rad * 0.64;
        const box = Math.min(span * dist * 0.78, rad * 0.36);
        drawContain(img, 0, -dist, box);
        if (it.label) {
          const fs = Math.max(11, Math.min(rad * 0.075, box * 0.32)) * r.fontScale;
          const y = -dist + box / 2 + fs * 0.95;
          ctx.font = `900 ${fs}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(fitText(it.label, Math.max(fs * 2, span * (dist - box / 2) * 0.9)), 0, y);
        }
      } else {
        // 文字は扇の中心線に沿って、外周側に右寄せ
        ctx.rotate(mid);
        const arc = span * rad * 0.6;
        const fs = Math.max(12, Math.min(rad * 0.12, arc * 0.5)) * r.fontScale;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${fs}px ${FONT}`;
        ctx.fillText(fitText(it.label, rad * 0.62), rad - 18, 1);
      }
      ctx.restore();
    }

    // 扇の境目の線とペグ
    for (const it of r.items) {
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

    // 中心
    ctx.beginPath();
    ctx.arc(c, c, rad * 0.13, 0, TAU);
    ctx.fillStyle = r.frame;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, rad * 0.13 - 5, 0, TAU);
    ctx.strokeStyle = r.pointer;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, 4, 0, TAU);
    ctx.fillStyle = PAPER();
    ctx.fill();

    // 針（上）。ペグに当たると少しはじかれる
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
    ctx.fillStyle = r.pointer;
    ctx.fill();
    ctx.restore();
  }

  const indexAtPointer = () => {
    const a = norm(POINTER - rotation) / TAU;
    return r.items.findIndex((it) => a >= it.start && a < it.end);
  };

  addEventListener('resize', resize);

  return {
    show(next) {
      r = next;
      images = new Map();
      root.hidden = false;
      root.classList.remove('leaving');
      // 画像と、項目に使う文字のフォントを読み込んでから描き直す
      for (const it of r.items) {
        if (it.src) loadImage(it.src).then((img) => img && (images.set(it.src, img), draw()));
      }
      document.fonts.load(`900 24px ${FONT}`, r.items.map((it) => it.label).join('')).then(draw, draw);
      resize();
    },
    hide() {
      root.hidden = true;
    },
    async spin(_r, winner) {
      const land = (winner.start + (0.15 + Math.random() * 0.7) * (winner.end - winner.start)) * TAU;
      const turns = reduced ? 0 : 5 + Math.floor(Math.random() * 3);
      const from = rotation;
      const to = from + norm(POINTER - land - from) + turns * TAU;
      const duration = reduced ? 300 : r.duration * 1000;
      let last = indexAtPointer();
      await new Promise((resolve) => {
        const t0 = performance.now();
        let prev = t0;
        const frame = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          rotation = from + (to - from) * (1 - Math.pow(1 - t, 4));
          const idx = indexAtPointer();
          if (idx !== last) {
            pointerKick = -0.32;
            tick(r);
          }
          last = idx;
          pointerKick *= Math.pow(0.0005, (now - prev) / 1000);
          prev = now;
          draw();
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      rotation = norm(rotation);
      pointerKick = 0;
      draw();
    },
  };
}
