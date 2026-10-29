// スロット台型ルーレットの描画。style: slot はリール1本、slot3 は3本（777 のように左から止まり、中段でそろう）。
// 結果は最後のリールに出す。止まる位置・ギリギリ演出・確定演出は横スライド型（roulette-strip.js）と同じ決まりで、向きだけが縦になる。
// 各リールで何を止めるか（3本のときのリーチ）は reel-plan.js が決める。

import { pickWeighted, tick, CHANCE_MS } from './roulette.js';
import { readableOn, resolveColor } from './overlay.js';
import { reelPlan } from './reel-plan.js';

const CREEP = 0.6; // ギリギリ演出で、最後ににじり寄る長さ（コマの高さに対する割合）
const ROWS = 3; // 窓に見えるコマの数
const STOP_AT = [0.55, 0.75]; // 3本のとき、1本目・2本目が止まる時刻（回す時間に対する割合）。3本目は最後

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
// 少し行き過ぎてから戻る（リールがガコンと止まる）
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export function createReel(root) {
  const title = root.querySelector('.cab-title');
  const win = root.querySelector('.cab-window');
  const box = root.querySelector('.reels');
  const lever = root.querySelector('.lever');
  let r = null;
  let H = 96; // 1コマの高さ
  // リールごとの状態。seq は並んでいる項目（items の添字）で、添字が大きいほど上にあり、下へ流れて中段に来る。
  // offset は何コマ分流れたか（px）。seq[i] は offset = i * H のとき中段にいる
  let reels = [];
  let doneTimer = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 同じ項目が続きすぎないよう、直前と同じなら一度だけ引き直す
  function randomPick(prev) {
    let it = pickWeighted(r.items);
    if (r.items.length > 1 && it.index === prev) it = pickWeighted(r.items);
    return it.index;
  }

  function tileNode(index, i) {
    const it = r.items[index];
    const el = document.createElement('div');
    el.className = 'reel-tile';
    if (it.win) el.classList.add('is-win');
    el.style.top = `${-i * H}px`;
    // 白いリールの上に、指定した色で文字を出す（明るすぎる色は墨のまま）
    if (!it.autoColor && readableOn(it.fill) !== resolveColor('ink')) el.style.setProperty('--sym', it.fill);
    if (it.src) {
      el.classList.add('has-image');
      const img = new Image();
      img.src = it.src;
      img.alt = '';
      el.append(img);
    }
    if (it.label) {
      const label = document.createElement('span');
      label.textContent = it.label;
      el.append(label);
    }
    return el;
  }

  const place = (reel) => {
    reel.track.style.transform = `translate3d(0, ${reel.offset}px, 0)`;
  };
  function render(reel) {
    reel.track.replaceChildren(...reel.seq.map(tileNode));
    place(reel);
  }
  const indexAt = (pos) => Math.round(pos / H);

  function layout() {
    H = Math.round(win.clientHeight / ROWS);
    root.style.setProperty('--row', `${H}px`);
  }

  addEventListener('resize', () => {
    if (!r) return;
    const rows = reels.map((reel) => indexAt(reel.offset));
    layout();
    reels.forEach((reel, k) => {
      reel.offset = rows[k] * H;
      render(reel);
    });
  });

  // 1本のリールを from から to まで回す。creep > 0 なら、いったん止まりかけてから creepMs かけてにじり寄る
  function run(reel, { to, duration, creep, creepMs, back, ticks }) {
    const from = reel.offset;
    let last = indexAt(from);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = (now) => {
        const elapsed = now - t0;
        if (elapsed < duration) {
          const k = elapsed / duration;
          reel.offset = from + (to - creep - from) * (back ? easeOutBack(k) : easeOutQuart(k));
        } else {
          reel.offset = to - creep * Math.pow(1 - Math.min(1, (elapsed - duration) / (creepMs || 1)), 2);
        }
        place(reel);
        // 速いあいだは絵がぶれる（リールの残像）
        reel.el.classList.toggle('fast', elapsed < duration * 0.55);
        root.classList.toggle('chance', creepMs > 0 && elapsed >= duration);
        const idx = indexAt(reel.offset);
        if (idx !== last) {
          last = idx;
          if (ticks) tick(r);
        }
        if (elapsed < duration + creepMs) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  return {
    show(next) {
      r = next;
      root.hidden = false;
      title.textContent = r.name || 'ルーレット';
      root.classList.remove('spinning', 'done', 'chance', 'reach');
      root.classList.toggle('three', r.style === 'slot3');
      root.dataset.slotLook = r.slotLook === 'wa' ? 'wa' : 'neon';
      layout();
      const count = r.style === 'slot3' ? 3 : 1;
      reels = [];
      box.replaceChildren();
      for (let k = 0; k < count; k++) {
        const el = document.createElement('div');
        el.className = 'reel';
        const track = document.createElement('div');
        track.className = 'reel-track';
        el.append(track);
        box.append(el);
        const reel = { el, track, seq: [], offset: 3 * H };
        for (let i = 0; i < 7; i++) reel.seq.push(randomPick(reel.seq[reel.seq.length - 1]));
        reels.push(reel);
        render(reel);
      }
    },
    hide() {
      root.hidden = true;
    },
    // fx はサーバーの spin（land: 止まる位置、chance: ギリギリ演出、kakutei: 確定演出）
    async spin(_r, winner, fx = {}) {
      clearTimeout(doneTimer);
      root.classList.remove('done', 'reach');
      box.querySelectorAll('.hit').forEach((el) => el.classList.remove('hit'));
      const plan = reelPlan(r.items, winner.index, fx, reels.length);
      const n = r.items.length;
      const lastReel = reels.length - 1;

      const targets = reels.map((reel, k) => {
        // 今見えているコマは残して、その上に新しいコマを継ぎ足す（見た目は途切れない）
        const keepFrom = Math.max(0, indexAt(reel.offset) - 2);
        reel.seq = reel.seq.slice(keepFrom);
        reel.offset -= keepFrom * H;
        const count = reduced ? 4 : 30 + k * 6 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) reel.seq.push(randomPick(reel.seq[reel.seq.length - 1]));
        const target = reel.seq.length;
        const stop = plan.stops[k];
        reel.seq.push(stop);
        for (let i = 0; i < 3; i++) reel.seq.push(randomPick(reel.seq[reel.seq.length - 1]));
        // ギリギリ演出: 丸型と同じく、上に「次の項目」、下に「前の項目」を並べる（当たりの隣でギリギリになるように）
        if (fx.chance && k === lastReel) {
          reel.seq[target - 1] = (stop + 1) % n;
          reel.seq[target + 1] = (stop - 1 + n) % n;
        }
        render(reel);
        return target;
      });
      root.classList.toggle('rainbow', fx.kakutei === 'pointer');

      // レバーを引いてから回り始める
      lever.classList.remove('pull');
      void lever.offsetWidth;
      lever.classList.add('pull');
      root.classList.add('spinning');

      const duration = reduced ? 300 : r.duration * 1000;
      const creepMs = fx.chance && !reduced ? CHANCE_MS : 0;
      // land（0〜1）は丸型と同じ向き: 0 に近いほど、次に来るコマ（上）の側
      const land = plan.land ?? 0.15 + Math.random() * 0.7;
      const runs = reels.map((reel, k) => {
        const isLast = k === lastReel;
        const stopMs = isLast ? duration : duration * STOP_AT[k];
        const to = targets[k] * H + (isLast ? 0.5 - land : 0) * H;
        const done = run(reel, {
          to,
          duration: stopMs,
          creep: isLast && creepMs ? CREEP * H : 0,
          creepMs: isLast ? creepMs : 0,
          back: !isLast || plan.land === 0.5,
          ticks: isLast,
        });
        // 先に止まるリールは、止まった音を鳴らす。リーチなら2本目が止まったところで知らせる
        if (!isLast) {
          done.then(() => {
            tick(r);
            if (plan.reach && k === lastReel - 1) root.classList.add('reach');
          });
        }
        return done;
      });
      await Promise.all(runs);
      root.classList.remove('spinning', 'chance', 'reach');
      reels.forEach((reel, k) => reel.track.children[targets[k]]?.classList.add('hit'));
      // 止まったら電球を少しのあいだ点滅させる
      root.classList.add('done');
      doneTimer = setTimeout(() => root.classList.remove('done'), 1600);
    },
  };
}
