// スロット台型ルーレット（style: slot）の描画。筐体の窓の中で、リール1本が上から下へ流れ、中段の線で止まる。
// 止まる位置・ギリギリ演出・確定演出は横スライド型（roulette-strip.js）と同じ決まりで、向きだけが縦になる。

import { pickWeighted, tick, CHANCE_MS } from './roulette.js';
import { readableOn, resolveColor } from './overlay.js';

const CREEP = 0.6; // ギリギリ演出で、最後ににじり寄る長さ（コマの高さに対する割合）
const ROWS = 3; // 窓に見えるコマの数

export function createReel(root) {
  const title = root.querySelector('.cab-title');
  const win = root.querySelector('.cab-window');
  const track = root.querySelector('.reel-track');
  const lever = root.querySelector('.lever');
  let r = null;
  let H = 96; // 1コマの高さ
  let seq = []; // 並んでいる項目（items の添字）。添字が大きいほど上にあり、下へ流れて中段に来る
  let offset = 0; // 何コマ分流れたか（px）。seq[i] は offset = i * H のとき中段にいる
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

  function renderTrack() {
    track.replaceChildren(...seq.map(tileNode));
    place();
  }

  const place = () => {
    track.style.transform = `translate3d(0, ${offset}px, 0)`;
  };
  const indexAt = (pos) => Math.round(pos / H);

  function layout() {
    H = Math.round(win.clientHeight / ROWS);
    root.style.setProperty('--row', `${H}px`);
  }

  addEventListener('resize', () => {
    if (!r) return;
    const i = indexAt(offset);
    layout();
    offset = i * H;
    renderTrack();
  });

  return {
    show(next) {
      r = next;
      root.hidden = false;
      title.textContent = r.name || 'ルーレット';
      root.classList.remove('spinning', 'done', 'chance');
      layout();
      seq = [];
      for (let i = 0; i < 7; i++) seq.push(randomPick(seq[seq.length - 1]));
      offset = 3 * H;
      renderTrack();
    },
    hide() {
      root.hidden = true;
    },
    // fx はサーバーの spin（land: 止まる位置、chance: ギリギリ演出、kakutei: 確定演出）
    async spin(_r, winner, fx = {}) {
      clearTimeout(doneTimer);
      root.classList.remove('done');
      track.querySelector('.hit')?.classList.remove('hit');

      // 今見えているコマは残して、その上に新しいコマを継ぎ足す（見た目は途切れない）
      const keepFrom = Math.max(0, indexAt(offset) - 2);
      seq = seq.slice(keepFrom);
      offset -= keepFrom * H;
      const run = reduced ? 4 : 34 + Math.floor(Math.random() * 6);
      for (let i = 0; i < run; i++) seq.push(randomPick(seq[seq.length - 1]));
      const target = seq.length;
      seq.push(winner.index);
      for (let i = 0; i < 3; i++) seq.push(randomPick(seq[seq.length - 1]));
      // ギリギリ演出: 丸型と同じく、上に「次の項目」、下に「前の項目」を並べる（当たりの隣でギリギリになるように）
      const n = r.items.length;
      if (fx.chance) {
        seq[target - 1] = (winner.index + 1) % n;
        seq[target + 1] = (winner.index - 1 + n) % n;
      }
      renderTrack();
      root.classList.toggle('rainbow', fx.kakutei === 'pointer');

      // レバーを引いてから回り始める
      lever.classList.remove('pull');
      void lever.offsetWidth;
      lever.classList.add('pull');
      root.classList.add('spinning');

      // land（0〜1）は丸型と同じ向き: 0 に近いほど、次に来るコマ（上）の側
      const land = fx.land ?? 0.15 + Math.random() * 0.7;
      const from = offset;
      const to = target * H + (0.5 - land) * H;
      const duration = reduced ? 300 : r.duration * 1000;
      const creepMs = fx.chance && !reduced ? CHANCE_MS : 0;
      const creep = creepMs ? CREEP * H : 0;
      let last = indexAt(from);
      await new Promise((resolve) => {
        const t0 = performance.now();
        const frame = (now) => {
          const elapsed = now - t0;
          // いったん止まりかけてから、CHANCE_MS かけて境目へにじり寄る
          if (elapsed < duration) offset = from + (to - creep - from) * (1 - Math.pow(1 - elapsed / duration, 4));
          else offset = to - creep * Math.pow(1 - Math.min(1, (elapsed - duration) / (creepMs || 1)), 2);
          place();
          // 速いあいだは絵がぶれる（リールの残像）
          root.classList.toggle('fast', elapsed < duration * 0.55);
          root.classList.toggle('chance', creepMs > 0 && elapsed >= duration);
          const idx = indexAt(offset);
          if (idx !== last) {
            last = idx;
            tick(r);
          }
          const t = Math.min(1, elapsed / (duration + creepMs));
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      root.classList.remove('spinning', 'fast', 'chance');
      track.children[target]?.classList.add('hit');
      // 止まったら電球を少しのあいだ点滅させる
      root.classList.add('done');
      doneTimer = setTimeout(() => root.classList.remove('done'), 1600);
    },
  };
}
