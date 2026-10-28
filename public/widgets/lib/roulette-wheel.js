// 丸型ルーレットの描画（wheel / casino / judo。塗り分けは roulette-skins.js）。
// 画像のない項目は今までどおり文字を扇の中心線に沿って置き、
// 画像のある項目は画像と文字を「針の位置に来たとき正立する」向きで置く。

import { loadImage } from './overlay.js';
import { tick, CHANCE_MS } from './roulette.js';
import { skinFor } from './roulette-skins.js';

const TAU = Math.PI * 2;
const POINTER = -Math.PI / 2;
const FONT = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
const norm = (a) => ((a % TAU) + TAU) % TAU;
const CREEP = 0.6; // ギリギリ演出で、最後ににじり寄る長さ（扇の幅に対する割合）
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeOutQuad = (t) => 1 - Math.pow(1 - t, 2);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const FLAP_MAX = 0.5; // ピンに押された爪が、いちばんしなる角度
const FLAP_ZONE = 0.6; // 爪がピンに触れている長さ(ピンの間かくに対する割合)
const TEASE_HOLD_MS = 500; // 当たりそうで当たらない: 止まりかけて見せる時間

/** 当たりの扇の land（0〜1）の位置が針に来る回転 */
export function landRotation(winner, land) {
  return norm(POINTER - (winner.start + land * (winner.end - winner.start)) * TAU);
}

/** ギリギリ演出の最後（t: 0〜1）の回転。ルーレットとカットインの大写しで同じ動きにする */
export function creepRotation(winner, land, t) {
  const creep = CREEP * (winner.end - winner.start) * TAU;
  return landRotation(winner, land) - creep * (1 - easeOutQuad(t));
}

export function createWheel(root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let r = null; // 表示中のルーレット
  let images = new Map();
  let size = 0;
  let rotation = 0;
  let pointerKick = 0;
  let spring = 0; // ピンから外れた爪が戻るまでの残り
  let lastPegD = null;
  let lastPush = 0;
  let rainbowPointer = false; // 確定演出: 針が虹色に変わり続ける
  let lights = { mode: 'idle', since: 0 }; // カジノの電球（idle 全部点灯 / spin 流れる / done 点滅）
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
    const skin = skinFor(r.style);
    const c = size / 2;
    const { rim, rad } = skin.geometry(c);
    const now = performance.now();
    const s = {
      ctx, c, rad, rim, r, now, rotation, lights, pointerKick,
      items: r.items,
      pointerColor: rainbowPointer ? `hsl(${(now / 3) % 360}, 95%, 55%)` : '',
    };
    const font = skin.font ?? FONT;
    const weight = skin.weight ?? '900';
    ctx.clearRect(0, 0, size, size);
    skin.back(s);

    for (const it of r.items) {
      const a0 = it.start * TAU + rotation;
      const a1 = it.end * TAU + rotation;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, rad, a0, a1);
      ctx.closePath();
      ctx.fillStyle = skin.fill(s, it);
      ctx.fill();
    }
    skin.overSegments?.(s);

    for (const it of r.items) {
      const a0 = it.start * TAU + rotation;
      const a1 = it.end * TAU + rotation;
      const span = (it.end - it.start) * TAU;
      const mid = (a0 + a1) / 2;
      const img = images.get(it.src);
      ctx.save();
      ctx.translate(c, c);
      ctx.fillStyle = skin.ink(s, it);
      if (img) {
        // 外向きが「上」になる向き。針の位置（真上）に来たとき正立する
        ctx.rotate(mid + Math.PI / 2);
        const dist = rad * 0.64;
        const box = Math.min(span * dist * 0.78, rad * 0.36);
        drawContain(img, 0, -dist, box);
        if (it.label) {
          const fs = Math.max(11, Math.min(rad * 0.075, box * 0.32)) * r.fontScale;
          const y = -dist + box / 2 + fs * 0.95;
          ctx.font = `${weight} ${fs}px ${font}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(fitText(it.label, Math.max(fs * 2, span * (dist - box / 2) * 0.9)), 0, y);
        }
      } else if (r.labelDirection === 'around') {
        // 文字は円周にそって横向き。針の位置（真上）に来たとき正立する
        ctx.rotate(mid + Math.PI / 2);
        const dist = rad * 0.7;
        const maxWidth = span * dist * 0.85;
        let fs = Math.max(12, Math.min(rad * 0.12, span * dist * 0.4)) * r.fontScale;
        ctx.font = `${weight} ${fs}px ${font}`;
        // 横向きは幅が狭いので、長い文字はまず小さくして収める（それでも入らなければ … で切る）
        while (fs > 12 && ctx.measureText(it.label).width > maxWidth) {
          fs = Math.max(12, fs * 0.92);
          ctx.font = `${weight} ${fs}px ${font}`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fitText(it.label, maxWidth), 0, -dist);
      } else {
        // 文字は扇の中心線に沿って、外周側に右寄せ
        ctx.rotate(mid);
        const arc = span * rad * 0.6;
        const fs = Math.max(12, Math.min(rad * 0.12, arc * 0.5)) * r.fontScale;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = `${weight} ${fs}px ${font}`;
        ctx.fillText(fitText(it.label, rad * 0.62), rad - 18, 1);
      }
      ctx.restore();
    }

    skin.dividers(s);
    skin.hub(s);
    skin.front?.(s);
    // 針（上）。ペグに当たると少しはじかれる
    skin.pointer(s);
  }

  // 光り物のあるスキン（カジノ）: 止まったあと少しのあいだ電球を点滅させてから、静かな状態に戻す
  function celebrate() {
    if (!skinFor(r?.style).lights || reduced) return;
    lights = { mode: 'done', since: performance.now() };
    const loop = (now) => {
      if (lights.mode !== 'done') return;
      if (now - lights.since > 1600) lights = { mode: 'idle', since: now };
      draw();
      if (lights.mode === 'done') requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
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
      const skin = skinFor(r.style);
      document.fonts.load(`${skin.weight ?? '900'} 24px ${skin.font ?? FONT}`, `${r.items.map((it) => it.label).join('')}柔`).then(draw, draw);
      resize();
    },
    hide() {
      root.hidden = true;
    },
    /** カットインの大写し用: 回転を外から決めて描く */
    setRotation(a) {
      rotation = a;
      draw();
    },
    // fx はサーバーの spin（land: 止まる位置、chance: ギリギリ演出、kakutei: 確定演出）
    async spin(_r, winner, fx = {}) {
      const land = fx.land ?? 0.15 + Math.random() * 0.7;
      const turns = reduced ? 0 : 5 + Math.floor(Math.random() * 3);
      const from = rotation;
      const to = from + norm(landRotation(winner, land) - from) + turns * TAU;
      const duration = reduced ? 300 : r.duration * 1000;
      // ギリギリ演出: いったん止まりかけてから、CHANCE_MS かけて境目へにじり寄る
      const creepMs = fx.chance && !reduced ? CHANCE_MS : 0;
      // 当たりそうで当たらない: 選んだマスの真ん中で止まりかけ、そこから本当の結果まで流れる
      const teaseSeg = fx.tease && !reduced ? _r.items?.[fx.tease.at] : null;
      const creep = teaseSeg ? norm(landRotation(winner, land) - landRotation(teaseSeg, 0.5)) : creepMs ? CREEP * (winner.end - winner.start) * TAU : 0;
      rainbowPointer = fx.kakutei === 'pointer';
      lights = { mode: 'spin', since: performance.now() };
      let last = indexAtPointer();
      await new Promise((resolve) => {
        const t0 = performance.now();
        let prev = t0;
        const frame = (now) => {
          const elapsed = now - t0;
          if (elapsed < duration) rotation = from + (to - creep - from) * easeOutQuart(elapsed / duration);
          // 当たりそうで当たらない: 選んだマスの上で少し止まってから、ゆっくり動き出して流れる
          else if (teaseSeg) rotation = to - creep * (1 - easeInOutCubic(Math.max(0, Math.min(1, (elapsed - duration - TEASE_HOLD_MS) / ((creepMs || 1) - TEASE_HOLD_MS)))));
          else rotation = to - creep * (1 - easeOutQuad(Math.min(1, (elapsed - duration) / (creepMs || 1))));
          root.classList.toggle('chance', creepMs > 0 && elapsed >= duration);
          const t = Math.min(1, elapsed / (duration + creepMs));
          const skin = skinFor(r.style);
          if (skin.pegs) {
            // ピンのある形: 次のピンが爪に来るまでの角度 d から、爪のしなりを決める。
            // ピンが近づくほど爪が押されてしなり、通り過ぎた瞬間に外れてパチンと戻る(そこで1回鳴る)
            const step = TAU / skin.pegs(r.items);
            const d = norm(POINTER - rotation) % step;
            const push = d < step * FLAP_ZONE ? (1 - d / (step * FLAP_ZONE)) * FLAP_MAX : 0;
            if (lastPegD != null && d > lastPegD + step * 0.5) {
              spring = Math.max(spring, lastPush);
              tick(r);
            }
            spring *= Math.pow(0.00002, (now - prev) / 1000);
            lastPegD = d;
            lastPush = push;
            pointerKick = -Math.max(push, spring);
          } else {
            const idx = indexAtPointer();
            if (idx !== last) {
              pointerKick = -0.32;
              tick(r);
            }
            last = idx;
            pointerKick *= Math.pow(0.0005, (now - prev) / 1000);
          }
          prev = now;
          draw();
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      rotation = norm(rotation);
      if (!skinFor(r.style).pegs) pointerKick = 0; // ピンのある形は、止まったときの爪のしなりをそのまま残す
      root.classList.remove('chance');
      celebrate();
      draw();
    },
  };
}
