// 横スライド型ルーレットの描画。カードが横に流れ、中央の針で止まる。
// 画像のないカードは文字を上下左右の中央に、画像のあるカードは画像の下に文字を置く。

import { pickWeighted, tick, CHANCE_MS } from './roulette.js';

const CREEP = 0.6; // ギリギリ演出で、最後ににじり寄る長さ（カードの幅に対する割合）

export function createStrip(root) {
  const win = root.querySelector('.window');
  const track = root.querySelector('.track');
  const marker = root.querySelector('.marker');
  let r = null;
  let T = 150; // カードの幅
  let G = 8; // カードの間隔
  let seq = []; // 並んでいる項目（items の添字）
  let x = 0; // track の横位置
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 同じ項目が続きすぎないよう、直前と同じなら一度だけ引き直す
  function randomPick(prev) {
    let it = pickWeighted(r.items);
    if (r.items.length > 1 && it.index === prev) it = pickWeighted(r.items);
    return it.index;
  }

  function tileNode(index) {
    const it = r.items[index];
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.background = it.fill;
    el.style.color = it.ink;
    el.style.fontSize = `${(it.label.length > 6 ? 17 : 22) * r.fontScale}px`;
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

  function renderTrack() {
    track.replaceChildren(...seq.map(tileNode));
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  const center = () => win.clientWidth / 2;
  const xFor = (i, offset = 0) => center() - (i * (T + G) + T / 2 + offset);
  const indexAt = (pos) => Math.floor((center() - pos) / (T + G));

  function layout() {
    T = Math.round(Math.min(180, Math.max(110, innerWidth / 5.2)));
    G = Math.round(T * 0.055);
    root.style.setProperty('--tile', `${T}px`);
    root.style.setProperty('--tile-h', `${Math.round(T * 0.82)}px`);
    root.style.setProperty('--gap', `${G}px`);
  }

  addEventListener('resize', () => {
    if (!r) return;
    const i = indexAt(x);
    layout();
    x = xFor(i);
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  });

  return {
    show(next) {
      r = next;
      root.hidden = false;
      win.style.background = r.frame;
      marker.style.setProperty('--pointer', r.pointer);
      win.classList.remove('settled');
      layout();
      seq = [];
      for (let i = 0; i < 15; i++) seq.push(randomPick(seq[seq.length - 1]));
      x = xFor(7);
      renderTrack();
    },
    hide() {
      root.hidden = true;
    },
    // fx はサーバーの spin（land: 止まる位置、chance: ギリギリ演出、kakutei: 確定演出）
    async spin(_r, winner, fx = {}) {
      win.classList.remove('settled');
      track.querySelector('.win')?.classList.remove('win');

      // 今見えている分は残して、その先に新しいカードを継ぎ足す（見た目は途切れない）
      const keepFrom = Math.max(0, indexAt(x) - 8);
      seq = seq.slice(keepFrom);
      x += keepFrom * (T + G);
      const run = reduced ? 4 : 42 + Math.floor(Math.random() * 8);
      for (let i = 0; i < run; i++) seq.push(randomPick(seq[seq.length - 1]));
      const target = seq.length;
      seq.push(winner.index);
      for (let i = 0; i < 8; i++) seq.push(randomPick(seq[seq.length - 1]));
      // ギリギリ演出: 丸型と同じく、手前に「次の項目」、後ろに「前の項目」を並べる（当たりの隣でギリギリになるように）
      const n = r.items.length;
      if (fx.chance) {
        seq[target - 1] = (winner.index + 1) % n;
        seq[target + 1] = (winner.index - 1 + n) % n;
      }
      renderTrack();
      marker.classList.toggle('rainbow', fx.kakutei === 'pointer');

      // 当たりのカードの中で止まる位置も毎回ずらす
      const from = x;
      // land（0〜1）は丸型と同じ向き: 0 に近いほど、次に来るカードの側
      const land = fx.land ?? 0.15 + Math.random() * 0.7;
      const to = xFor(target, (0.5 - land) * T);
      const duration = reduced ? 300 : r.duration * 1000;
      const creepMs = fx.chance && !reduced ? CHANCE_MS : 0;
      const creep = creepMs ? CREEP * T : 0;
      let last = indexAt(from);
      let kickTimer = null;
      await new Promise((resolve) => {
        const t0 = performance.now();
        const frame = (now) => {
          const elapsed = now - t0;
          // いったん止まりかけてから、CHANCE_MS かけて境目へにじり寄る
          if (elapsed < duration) x = from + (to + creep - from) * (1 - Math.pow(1 - elapsed / duration, 4));
          else x = to + creep * Math.pow(1 - Math.min(1, (elapsed - duration) / (creepMs || 1)), 2);
          root.classList.toggle('chance', creepMs > 0 && elapsed >= duration);
          const t = Math.min(1, elapsed / (duration + creepMs));
          track.style.transform = `translate3d(${x}px, 0, 0)`;
          const idx = indexAt(x);
          if (idx !== last) {
            last = idx;
            tick(r);
            marker.classList.add('kick');
            clearTimeout(kickTimer);
            kickTimer = setTimeout(() => marker.classList.remove('kick'), 70);
          }
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      root.classList.remove('chance');
      track.children[target].classList.add('win');
      win.classList.add('settled');
    },
  };
}
