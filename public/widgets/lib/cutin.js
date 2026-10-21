// カットインを段階・柄・写真・効果音まで公開画面で再生する。
// サーバーの抽選結果を使い、古い接続にも安全な既定値で表示する。
// カットイン（通常・画像付き）の動き: 帯が入って文字が叩きつけられ、揺れて抜ける。ギフトのコインで色が上がる。
// 通常カットインは、ルーレット・スロットの演出（チャンス、大写し、確定演出、形ごとの当たり）も出す。
import { brushImage as bandImage } from './brush.js';
import { createWheel, creepRotation } from './roulette-wheel.js';
import { prepareRoulette, CHANCE_MS } from './roulette.js';
import { setupWidget, mediaUrl, loadConfig, list, connect, giftNode, avatarNode, giftNamed, giftLabel, fmt, createQueue, sleep } from './overlay.js';

const STAGE = `
<div class="stage" id="stage">
  <div class="dim"></div>
  <canvas class="lines" id="lines"></canvas>
  <div class="rig" id="rig">
    <div class="shaker" id="shaker">
      <div class="band" id="band"></div>
      <div class="visual" id="visual"></div>
      <div class="word" id="word"><span class="back"></span><span class="mid"></span><span class="front"></span></div>
      <div class="tag" id="tag"></div>
      <div class="sevens" id="sevens"><span>7</span><span>7</span><span>7</span></div>
      <div class="seal" id="seal">勝</div>
    </div>
  </div>
  <canvas class="coins" id="coins"></canvas>
  <div class="bulb-frame"><i></i><i></i><i></i><i></i></div>
  <div class="flash"></div>
  <div class="freeze" id="freeze"><span>・・・</span></div>
  <div class="closeup" id="closeup"><canvas></canvas></div>
</div>
`;

const TIER_DEFAULTS = {
  minCoins: 100, greenCoins: 300, redCoins: 1000, goldCoins: 5000, rainbowCoins: 20000, gifts: [], events: [],
  blueText: 'チャンス', greenText: 'チャンス!!', redText: '激アツ', goldText: '超激アツ', rainbowText: '確定',
  word: true, yieldToImage: false, rouletteWin: true, rouletteWinText: '', slotWin: true, angle: -8, hold: 1.1, shake: 1, freeze: true, lines: true, sound: true, volume: 0.5,
};

/**
 * カットインを動かす。
 * section: 'cutins'（通常カットイン: 帯と文字だけ）か 'imageCutins'（画像付きカットイン: 写真を使う）
 */
export async function startCutin(section) {
  document.body.insertAdjacentHTML('afterbegin', STAGE);
  const isImage = section === 'imageCutins';
  // 設定は config.yaml の cutins.<id> / imageCutins.<id>（?id= がなければ default）。URL パラメータでも上書きできる
  const p = await setupWidget(section, isImage
    ? { ...TIER_DEFAULTS, photo: '', layout: 'inside', imageStyle: '', crop: { x: 0.5, y: 0.5, scale: 1 } }
    : { ...TIER_DEFAULTS, textWeight: 'normal' });
  // 内部の描き方にそろえる: style（band 色の帯 / photo 写真の帯）と image（帯に乗せるもの）
  p.style = isImage && p.layout === 'inside' ? 'photo' : 'band';
  p.image = isImage ? 'photo' : 'none';
  if (!isImage) p.photo = '';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');

  // --- 段階（信頼度）ごとの色 ---
  const TIERS = {
    blue: {
      band: ['#0A2E8C', '#1E6BFF', '#6FB2FF', '#1E6BFF'],
      word: 'linear-gradient(180deg, #FFFFFF 0%, #DCEBFF 48%, #7FB6FF 52%, #FFFFFF 100%)',
      accent: '#3F8CFF',
    },
    green: {
      band: ['#05502A', '#10B85A', '#8BF0A3', '#10B85A'],
      word: 'linear-gradient(180deg, #FFFFFF 0%, #E2FFE9 48%, #6EE38E 52%, #FFFFFF 100%)',
      accent: '#22C76A',
    },
    red: {
      band: ['#5C0008', '#E0001B', '#FF6A3D', '#C80018'],
      word: 'linear-gradient(180deg, #FFFBE0 0%, #FFE27A 45%, #FFB800 55%, #FFF3B0 100%)',
      accent: '#FF2D2D',
    },
    gold: {
      band: ['#5A3A00', '#E1A100', '#FFF3B8', '#C98A00', '#FFD86B'],
      word: 'linear-gradient(180deg, #FFFFFF 0%, #FFD0D0 45%, #FF1E3C 55%, #FF8A8A 100%)',
      accent: '#FFC53D',
    },
    rainbow: {
      band: ['#FF2D55', '#FF9500', '#FFE600', '#34C759', '#00C7FF', '#5856D6', '#FF2DFF'],
      word: 'linear-gradient(90deg, #FF2D55, #FF9500, #FFE600, #34C759, #00C7FF, #5856D6, #FF2DFF, #FF2D55)',
      accent: '#FFFFFF',
    },
    // ルーレットの形ごとの当たり（LOOKS）で使う色
    casino: {
      band: ['#3A2400', '#B8860B', '#FFF1C2', '#C99A2E', '#FFD86B'],
      word: 'linear-gradient(180deg, #FFFFFF 0%, #FFF0B3 38%, #E0A526 52%, #FFE69A 70%, #B87A12 100%)',
      accent: '#FFC53D',
    },
    slot: {
      band: ['#4A0006', '#C8101E', '#FF5A3D', '#B0000F'],
      word: 'linear-gradient(180deg, #FFFBE0 0%, #FFE27A 45%, #FFB800 55%, #FFF3B0 100%)',
      accent: '#FFC53D',
    },
    judo: {
      band: ['#0E0E10', '#26262C', '#3A3A42', '#141416'],
      word: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 62%, #DADADA 100%)',
      accent: '#C3121E',
    },
  };
  // ルーレットの形（style）ごとの当たりのカットイン。win 当たりの文字 / chance チャンス演出の文字（なければ段階の文字）
  // coins 金貨が降る / bulbs 画面のふちの電球 / sevens 7 が3つ並んでから入る / seal 文字のあとに紅い判が押される
  const LOOKS = {
    wheel: { win: '大当たり', tier: 'rainbow' },
    strip: { win: '大当たり', tier: 'rainbow' },
    casino: { win: 'ジャックポット', tier: 'casino', coins: true, bulbs: true },
    slot: { win: 'ビッグボーナス', tier: 'slot', sevens: true, chance: 'リーチ' },
    slot3: { win: 'ビッグボーナス', tier: 'slot', sevens: true, chance: 'リーチ' },
    judo: { win: '一本', tier: 'judo', seal: true, chance: '技あり', freeze: false },
  };
  const lookOf = (style) => LOOKS[style] ?? LOOKS.wheel;
  const ORDER = ['blue', 'green', 'red', 'gold', 'rainbow'];
  const TEXT = { blue: p.blueText, green: p.greenText, red: p.redText, gold: p.goldText, rainbow: p.rainbowText };

  function tierFor(e, q = p) {
    if (e.kind !== 'gift') return list(q.events).includes(e.kind) ? 'blue' : null;
    const c = e.totalDiamonds;
    let tier = c >= q.rainbowCoins ? 'rainbow' : c >= q.goldCoins ? 'gold' : c >= q.redCoins ? 'red' : c >= q.greenCoins ? 'green' : c >= q.minCoins ? 'blue' : null;
    // 指定したギフトは金額に関係なく赤から
    if (list(q.gifts).length && giftNamed(e.gift, q.gifts) && (!tier || ORDER.indexOf(tier) < 2)) tier = 'red';
    return tier;
  }

  // 通常カットインで yieldToImage が on のとき、画像付きカットインが出るギフトは譲る（同時に出て重ならないように）
  const imageEntries = !isImage && p.yieldToImage ? Object.values((await loadConfig()).config?.imageCutins ?? {}) : [];
  const shouldShow = (e) => tierFor(e) && !imageEntries.some((q) => tierFor(e, q));

  // 帯の画像を、帯の中の好きな位置に置く（写真の帯の縁の線用）
  function placed(img, { left = 0, top, width, height }) {
    Object.assign(img.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, right: 'auto', bottom: 'auto' });
    return img;
  }

  /**
   * 写真の帯: 斜めの帯の中いっぱいに写真が入り、上下の縁が木炭でかすれた線になる。
   * 帯の画像は上下に 0.3 倍ずつ余白を持つので、要素の高さは見える帯の 1.6 倍。
   */
  function buildPhotoStrip(e, t, bw, sh, seed, photoSource) {
    const pad = sh * 0.3;
    const full = sh * 1.6;
    const parts = [];

    // 帯の形で切り抜いた写真
    const photo = document.createElement('div');
    photo.className = 'strip-photo';
    const mask = bandImage(bw, sh, ['#fff', '#fff'], seed);
    photo.style.webkitMaskImage = photo.style.maskImage = `url("${mask.src}")`;
    const src = photoSource || '';
    if (src) {
      const img = new Image();
      img.className = 'photo-img';
      img.src = mediaUrl(src);
      if (p.crop && typeof p.crop === 'object') img.style.objectPosition = `${Number(p.crop.x) * 100}% ${Number(p.crop.y) * 100}%`;
      photo.append(img);
      parts.push(img);
    } else {
      // 写真がないときは段階の色で埋める
      const fill = document.createElement('div');
      fill.className = 'photo-img photo-fallback';
      fill.style.background = `linear-gradient(100deg, ${t.band.join(', ')})`;
      photo.append(fill);
    }

    // 縁: 段階の色の細い線を少し外側に、その上に木炭のかすれ線（太い線＋はみ出す短い線）
    // 鉛筆・木炭のかすれ。濃いところと薄いところのムラを強めに
    const CHARCOAL = ['#0b0b0c', '#4a4a4f', '#18181a', '#7a7a80', '#0b0b0c', '#2c2c30'];
    const line = (y, h, colors, s, opts, left = 0, width = bw) => {
      const img = bandImage(width, h, colors, s, opts);
      parts.push(img);
      return placed(img, { left, top: y - (h * 1.6) / 2, width, height: h * 1.6 });
    };
    const top = pad, bottom = pad + sh;
    const stray = () => bw * (0.32 + Math.random() * 0.14);
    const edges = [
      line(top - sh * 0.07, sh * 0.06, t.band, seed + 5, { core: false, streak: '7 0 0 0 -2.6' }),
      line(bottom + sh * 0.07, sh * 0.06, t.band, seed + 6, { core: false, streak: '7 0 0 0 -2.6' }),
      // 太いかすれ線を2回重ねて、塗りムラを出す
      line(top, sh * 0.16, CHARCOAL, seed + 31, { core: false, streak: '5 0 0 0 -1.9' }),
      line(top + sh * 0.015, sh * 0.11, CHARCOAL, seed + 41, { core: false, streak: '6 0 0 0 -2.3' }),
      // 縁からはみ出す短い線（スケッチの重ね描き）
      line(top - sh * 0.11, sh * 0.05, CHARCOAL, seed + 51, { core: false, streak: '5 0 0 0 -2.1' }, stray(), bw * 0.4),
      line(bottom, sh * 0.16, CHARCOAL, seed + 61, { core: false, streak: '5 0 0 0 -1.9' }),
      line(bottom - sh * 0.015, sh * 0.11, CHARCOAL, seed + 71, { core: false, streak: '6 0 0 0 -2.3' }),
      line(bottom + sh * 0.12, sh * 0.05, CHARCOAL, seed + 81, { core: false, streak: '5 0 0 0 -2.1' }, bw * 0.18 + Math.random() * bw * 0.1, bw * 0.36),
    ];
    for (const img of edges) img.classList.add('edge');
    edges[0].classList.add('accent');
    edges[1].classList.add('accent');
    return { nodes: [photo, ...edges], edges, wait: [mask, ...parts], full };
  }

  // --- 集中線 ---
  const canvas = $('lines');
  const ctx = canvas.getContext('2d');
  let linesTimer = null;
  function startLines(cx, cy, color) {
    if (!p.lines) return;
    const dpr = devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = Math.hypot(innerWidth, innerHeight);
    const inner = Math.min(innerWidth, innerHeight) * 0.42;
    const draw = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2;
        const spread = 0.004 + Math.random() * 0.012;
        const r0 = inner * (0.75 + Math.random() * 0.6);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a - spread) * R, cy + Math.sin(a - spread) * R);
        ctx.lineTo(cx + Math.cos(a + spread) * R, cy + Math.sin(a + spread) * R);
        ctx.closePath();
        ctx.fillStyle = i % 9 === 0 ? color : 'rgba(255, 255, 255, .45)';
        ctx.fill();
      }
    };
    draw();
    linesTimer = setInterval(draw, 50);
  }
  function stopLines() {
    clearInterval(linesTimer);
    linesTimer = null;
  }

  // --- 金貨の雨（カジノのジャックポット）。seconds のあいだ降らせ、残りは画面の下へ落ちきって消える ---
  const coinCanvas = $('coins');
  const coinCtx = coinCanvas.getContext('2d');
  function coinRain(seconds) {
    const dpr = devicePixelRatio || 1;
    coinCanvas.width = innerWidth * dpr;
    coinCanvas.height = innerHeight * dpr;
    coinCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = Math.min(innerWidth, innerHeight) * 0.07;
    const coins = [];
    const until = performance.now() + seconds * 1000;
    let prev = performance.now();
    return new Promise((resolve) => {
      const frame = (now) => {
        const dt = Math.min(50, now - prev) / 1000;
        prev = now;
        if (now < until) {
          for (let i = 0; i < 3; i++) {
            coins.push({ x: Math.random() * innerWidth, y: -size, vx: (Math.random() - 0.5) * 120, vy: 200 + Math.random() * 260, spin: 4 + Math.random() * 8, phase: Math.random() * 6, r: size * (0.7 + Math.random() * 0.5) });
          }
        }
        coinCtx.clearRect(0, 0, innerWidth, innerHeight);
        for (const c of coins) {
          c.vy += 900 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.phase += c.spin * dt;
          // くるくる回る金貨: 横幅を cos で縮めて表と縁を描く
          const w = Math.max(0.12, Math.abs(Math.cos(c.phase)));
          coinCtx.save();
          coinCtx.translate(c.x, c.y);
          coinCtx.scale(w, 1);
          const g = coinCtx.createLinearGradient(-c.r, -c.r, c.r, c.r);
          g.addColorStop(0, '#FFF6C8');
          g.addColorStop(0.45, '#F5C542');
          g.addColorStop(1, '#9C6B12');
          coinCtx.beginPath();
          coinCtx.arc(0, 0, c.r, 0, Math.PI * 2);
          coinCtx.fillStyle = g;
          coinCtx.fill();
          coinCtx.lineWidth = c.r * 0.12;
          coinCtx.strokeStyle = '#8A5A0A';
          coinCtx.stroke();
          coinCtx.beginPath();
          coinCtx.arc(0, 0, c.r * 0.62, 0, Math.PI * 2);
          coinCtx.lineWidth = c.r * 0.08;
          coinCtx.strokeStyle = 'rgba(138, 90, 10, .7)';
          coinCtx.stroke();
          coinCtx.restore();
        }
        for (let i = coins.length - 1; i >= 0; i--) if (coins[i].y > innerHeight + size * 2) coins.splice(i, 1);
        if (now < until || coins.length) requestAnimationFrame(frame);
        else {
          coinCtx.clearRect(0, 0, innerWidth, innerHeight);
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  // --- 効果音（音源なしで合成） ---
  let ac;
  const audio = () => (ac ??= new AudioContext());
  function noise(seconds) {
    const a = audio();
    const buf = a.createBuffer(1, a.sampleRate * seconds, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    return src;
  }
  function env(gain, t, peak, attack, release) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }
  const SFX = {
    // フィーン: 上がっていく鋭い音と風切り
    fween() {
      const a = audio(), t = a.currentTime, v = p.volume;
      const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(380, t);
      o.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
      f.type = 'bandpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(5000, t + 0.2);
      env(g, t, 0.35 * v, 0.02, 0.24);
      o.connect(f).connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + 0.3);
      const n = noise(0.3), ng = a.createGain(), nf = a.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.setValueAtTime(800, t);
      nf.frequency.exponentialRampToValueAtTime(7000, t + 0.22);
      env(ng, t, 0.3 * v, 0.03, 0.22);
      n.connect(nf).connect(ng).connect(a.destination);
      n.start(t);
    },
    // ドン: 文字が叩きつけられる
    slam() {
      const a = audio(), t = a.currentTime, v = p.volume;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
      env(g, t, 0.9 * v, 0.005, 0.35);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + 0.4);
      const n = noise(0.25), ng = a.createGain(), nf = a.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 2400;
      env(ng, t, 0.5 * v, 0.003, 0.2);
      n.connect(nf).connect(ng).connect(a.destination);
      n.start(t);
    },
    // ガガガガ: 揺れている間のうなり
    gagaga(seconds) {
      const a = audio(), t = a.currentTime, v = p.volume;
      const o = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain(), f = a.createBiquadFilter();
      o.type = 'square';
      o.frequency.value = 72;
      lfo.type = 'square';
      lfo.frequency.value = 26;
      lg.gain.value = 0.12 * v;
      g.gain.value = 0.12 * v;
      f.type = 'lowpass';
      f.frequency.value = 900;
      lfo.connect(lg).connect(g.gain);
      o.connect(f).connect(g).connect(a.destination);
      g.gain.setValueAtTime(0.12 * v, t);
      g.gain.linearRampToValueAtTime(0.0001, t + seconds);
      o.start(t);
      lfo.start(t);
      o.stop(t + seconds);
      lfo.stop(t + seconds);
    },
    // ファンファーレ: ルーレットの大当たりで、ド・ミ・ソ・ドと駆け上がる
    fanfare() {
      const a = audio(), t = a.currentTime, v = p.volume;
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'square';
        o.frequency.value = f;
        const at = t + i * 0.07;
        const long = i === 4 ? 0.9 : 0.12;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.18 * v, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + long);
        o.connect(g).connect(a.destination);
        o.start(at);
        o.stop(at + long + 0.05);
      });
    },
    // ドン: 太鼓（柔道の一本）
    taiko() {
      const a = audio(), t = a.currentTime, v = p.volume;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.45);
      env(g, t, 1 * v, 0.004, 0.55);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + 0.6);
      const n = noise(0.2), ng = a.createGain(), nf = a.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 700;
      env(ng, t, 0.45 * v, 0.002, 0.12);
      n.connect(nf).connect(ng).connect(a.destination);
      n.start(t);
    },
    // シャラララ: 金貨（カジノのジャックポット）
    coins() {
      const a = audio(), t = a.currentTime, v = p.volume;
      for (let i = 0; i < 14; i++) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'triangle';
        o.frequency.value = 2400 + Math.random() * 2600;
        const at = t + i * 0.055 + Math.random() * 0.03;
        env(g, at, 0.08 * v, 0.004, 0.18);
        o.connect(g).connect(a.destination);
        o.start(at);
        o.stop(at + 0.25);
      }
    },
    // スッ: 抜けていく音
    out() {
      const a = audio(), t = a.currentTime, v = p.volume;
      const n = noise(0.2), g = a.createGain(), f = a.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(5000, t);
      f.frequency.exponentialRampToValueAtTime(600, t + 0.16);
      env(g, t, 0.25 * v, 0.01, 0.15);
      n.connect(f).connect(g).connect(a.destination);
      n.start(t);
    },
    // キュイン: フリーズ明けのプレミア音
    kyuin() {
      const a = audio(), t = a.currentTime, v = p.volume;
      for (const [f0, f1, d] of [[1400, 2600, 0], [2100, 3900, 0.02]]) {
        const o = a.createOscillator(), g = a.createGain(), vib = a.createOscillator(), vg = a.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f0, t + d);
        o.frequency.exponentialRampToValueAtTime(f1, t + d + 0.18);
        vib.frequency.value = 18;
        vg.gain.value = 60;
        vib.connect(vg).connect(o.frequency);
        env(g, t + d, 0.3 * v, 0.01, 0.9);
        o.connect(g).connect(a.destination);
        o.start(t + d);
        vib.start(t + d);
        o.stop(t + d + 1);
        vib.stop(t + d + 1);
      }
    },
  };
  const sfx = (name, ...args) => {
    if (!p.sound) return;
    try {
      SFX[name](...args);
    } catch {}
  };

  // --- ガガガガ（揺れ） ---
  async function shake(seconds) {
    const el = $('shaker');
    const amp = 10 * p.shake;
    const end = performance.now() + seconds * 1000;
    while (performance.now() < end) {
      const left = (end - performance.now()) / (seconds * 1000);
      const k = amp * (0.35 + 0.65 * left);
      el.style.transform = `translate(${(Math.random() - 0.5) * 2 * k}px, ${(Math.random() - 0.5) * 2 * k}px)`;
      await sleep(33);
    }
    el.style.transform = '';
  }

  // --- フリーズ（暗転して無音 → キュイン）。虹のカットインと、ルーレットの確定演出で使う ---
  // 確定演出はキューの外で出るので、重なっても先に終わったほうが暗転を消さないよう数える
  let freezing = 0;
  // withSound: 昇格の描き直しではキュインを鳴らし済みなので鳴らさない
  async function freeze(withSound = true) {
    freezing++;
    $('freeze').classList.add('on');
    await sleep(1100);
    if (--freezing === 0) $('freeze').classList.remove('on');
    if (withSound) sfx('kyuin');
  }

  // --- 1回分 ---
  // job: { e } はギフトなど。ルーレットの演出は tier・text・tag（テロップ）・hold・freeze・jackpot（大当たり）を決めて渡す。
  // deadline を過ぎたもの（前のカットインが長引いてルーレットに間に合わない）は出さない。forcedResult は昇格の2回目
  async function play(job, forcedResult = null) {
    if (job.deadline && performance.now() > job.deadline) return;
    const { e } = job;
    const baseTier = job.tier ?? tierFor(e);
    // 段階を決めて渡された演出（ルーレット・スロットの当たり）は昇格の抽選をしない
    const result = forcedResult || (!job.tier && window.CutinPremium ? window.CutinPremium.resolve(e.cutinDraw, baseTier, p) : { tier: baseTier, from: null, pattern: null });
    // 昇格前は from の段階を描き、180ms 後に同じ結果の最終段階を描く。
    const tier = result.from || result.tier;
    if (!tier) return;
    const t = TIERS[tier];
    const text = job.text ?? TEXT[tier];
    const W = innerWidth, H = innerHeight;
    const unit = Math.min(W, H);
    const bw = Math.round(Math.max(W, H) * 1.5);
    const bh = Math.round(unit * 0.36);
    stage.className = `stage tier-${tier}`;
    if (!isImage && p.textWeight === 'bold') stage.classList.add('weight-bold');
    stage.style.setProperty('--bw', `${bw}px`);
    stage.style.setProperty('--bh', `${bh}px`);
    stage.style.setProperty('--vw', `${W}px`);
    // 写真は帯からはみ出すくらい大きく
    stage.style.setProperty('--vs', `${Math.round(p.image === 'photo' ? Math.min(bh * 1.6, W * 0.55) : Math.min(bh * 1.1, W * 0.42))}px`);
    stage.style.setProperty('--fs', `${Math.round(Math.min(bh * 0.5, (W * 0.5) / Math.max(2, text.length)))}px`);
    stage.style.setProperty('--angle', `${p.angle}deg`);
    stage.style.setProperty('--word-fill', t.word);
    stage.style.setProperty('--tag-accent', t.accent);

    // 古いサーバーやローカルの見本には抽選値が無いので、以前と同じく毎回形を変える。
    const seed = e.cutinDraw && e.cutinDraw.seed >= 1 && e.cutinDraw.seed <= 900
      ? e.cutinDraw.seed
      : Math.floor(Math.random() * 900) + 1;
    const photoSource = p[tier + 'Photo'] || p.photo || '';
    const visual = $('visual');
    const word = $('word');
    const tagEl = $('tag');
    let wait = [];
    word.style.cssText = '';
    tagEl.style.cssText = '';
    word.hidden = !p.word;

    const hatch = isImage && window.CutinStyle && window.CutinStyle.isHatch(p.imageStyle);
    const patternImage = (pattern, width, height, patternSeed) => {
      if (!pattern || !window.CutinPremium) return null;
      const painted = window.CutinPremium.paint(pattern, width, height, patternSeed, Math.max(8, Math.round(height / 18)));
      if (!painted) return null;
      const image = new Image();
      image.className = 'premium-pattern';
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '"><defs>' + painted.defs + '</defs>' + painted.fill + '</svg>');
      return image;
    };
    if (hatch) {
      const size = window.CutinStyle.frameSize(W, H);
      const mounted = window.CutinStyle.mount($('band'), {
        width: size.w,
        height: size.h,
        style: p.imageStyle,
        crop: p.crop && typeof p.crop === 'object' ? p.crop : { x: 0.5, y: 0.5, scale: 1 },
        photo: photoSource ? mediaUrl(photoSource) : '',
        accent: t.accent,
      });
      stage.classList.add('style-hatch');
      stage.style.setProperty('--bw', `${size.w}px`);
      stage.style.setProperty('--bh', `${size.h}px`);
      wait = mounted ? mounted.wait : [];
      visual.replaceChildren();
      word.style.left = '0px';
      const fs = Math.round(Math.min((mounted?.bandHeight ?? bh) * 0.46, (size.w * 0.72) / Math.max(2, text.length)));
      stage.style.setProperty('--fs', `${fs}px`);
      if (result.pattern && mounted?.patternTargets) {
        for (const target of mounted.patternTargets) {
          const pattern = patternImage(result.pattern, size.w, size.h, seed);
          if (pattern) {
            target.append(pattern);
            wait.push(pattern);
          }
        }
      }
    } else if (p.style === 'photo') {
      // 写真の帯（縁が木炭のかすれ線）
      const sh = Math.round(H > W ? Math.min(H * 0.3, W * 0.62) : H * 0.42);
      const strip = buildPhotoStrip(e, t, bw, sh, seed, photoSource);
      stage.classList.add('style-photo');
      stage.style.setProperty('--bh', `${strip.full}px`);
      $('band').replaceChildren(...strip.nodes);
      wait = strip.wait;
      if (result.pattern) {
        for (const edge of strip.edges.slice(0, 2)) {
          const pattern = patternImage(result.pattern, bw, sh * 0.06 * 1.6, seed);
          if (pattern) {
            Object.assign(pattern.style, {
              left: edge.style.left,
              top: edge.style.top,
              width: edge.style.width,
              height: edge.style.height,
              opacity: '.5',
            });
            $('band').append(pattern);
            wait.push(pattern);
          }
        }
      }
      visual.replaceChildren();
      const fs = Math.round(Math.min(sh * 0.36, (W * 0.46) / Math.max(2, text.length)));
      stage.style.setProperty('--fs', `${fs}px`);
      Object.assign(word.style, { left: `${W * 0.16}px`, top: `${sh * 0.46}px` });
      Object.assign(tagEl.style, { top: `${sh * 0.5 + fs * 0.5}px` });
    } else {
      // 色の帯（影・本体・毛先の光）
      const ink = bandImage(bw, bh, ['#000', '#000'], seed + 11, { ink: true });
      ink.className = 'ink';
      const paint = bandImage(bw, bh, t.band, seed);
      paint.className = 'paint';
      const glint = bandImage(bw, bh, ['#fff', '#fff'], seed + 23, { glint: true });
      glint.style.opacity = '.35';
      wait = [ink, paint, glint];
      const nodes = [ink, paint];
      if (result.pattern && window.CutinPremium) {
        const pattern = window.CutinPremium.paint(result.pattern, bw, bh, seed, Math.max(8, Math.round(bh / 18)));
        if (pattern) {
          const premium = new Image();
          premium.className = 'premium-pattern';
          premium.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + bw + ' ' + bh + '"><defs>' + pattern.defs + '</defs>' + pattern.fill + '</svg>');
          nodes.push(premium);
          wait.push(premium);
        }
      }
      nodes.push(glint);
      $('band').replaceChildren(...nodes);
    }

    // 色の帯に乗せるもの。写真を指定したときだけ写真を乗せ、なければ帯と文字だけ
    // 縦長フレームは帯の中に写真を入れてあるので、横の写真は足さない
    if (!hatch) visual.replaceChildren();
    if (!hatch && p.style !== 'photo') {
      if (p.image === 'photo' && photoSource) {
        const img = new Image();
        img.src = mediaUrl(photoSource);
        if (p.crop && typeof p.crop === 'object') img.style.objectPosition = `${Number(p.crop.x) * 100}% ${Number(p.crop.y) * 100}%`;
        visual.replaceChildren(img);
        wait.push(img);
      } else if (p.image === 'avatar') visual.replaceChildren(avatarNode(e.user, bh));
      else if (p.image === 'gift' && e.kind === 'gift') visual.replaceChildren(giftNode(e.gift, bh));
    }
    // 何も乗せないときは文字を真ん中に
    if (p.style !== 'photo' && !visual.childElementCount) word.style.left = '0px';

    // 文字とテロップ
    for (const s of $('word').children) s.textContent = text;
    const tag = $('tag');
    tag.replaceChildren();
    const name = document.createElement('span');
    name.textContent = e.user?.name ?? '';
    tag.append(name);
    if (job.tag != null) {
      const what = document.createElement('span');
      what.textContent = job.tag;
      tag.append(what);
    } else if (e.kind === 'gift') {
      const what = document.createElement('span');
      what.textContent = `${giftLabel(e.gift)} ×${e.gift.count}`;
      const coins = document.createElement('span');
      coins.className = 'num';
      coins.textContent = fmt(e.totalDiamonds);
      tag.append(what, coins);
    } else {
      tag.append(e.kind === 'follow' ? 'フォロー' : 'シェア');
    }

    // 画像の読み込みを待つ（帯の SVG はここで描かれる）
    await Promise.all(wait.map((img) => img.decode().catch(() => {})));

    if (result.from) {
      stage.classList.add('promote');
      sfx('kyuin');
      await sleep(180);
      stage.classList.remove('promote');
      // 下の段階を見せてから、同じイベントを上の段階で描き直す。
      // 再抽選はせず、サーバーから届いた tier / pattern / seed をそのまま使う。
      await play(job, { ...result, from: null, promoted: true });
      return;
    }

    // 虹: フリーズ（暗転して無音）→ キュイン
    if (job.freeze ?? (tier === 'rainbow' && p.freeze)) await freeze(!result.promoted);

    // ルーレットの形ごとの当たり（job.look）。スロット台は 7 が1つずつ叩きつけられてから帯が入る
    const look = job.jackpot ? lookOf(job.look) : {};
    if (job.jackpot) stage.classList.add(`look-${job.look in LOOKS ? job.look : 'wheel'}`);
    const sevens = [...$('sevens').children];
    if (look.sevens) {
      stage.classList.add('dim-on');
      for (const seven of sevens) {
        seven.classList.add('in');
        sfx('slam');
        await sleep(260);
      }
    }

    const rect = $('rig').getBoundingClientRect();
    startLines(rect.left, rect.top, t.accent);
    stage.classList.add('play');
    if (job.jackpot) stage.classList.add('jackpot');
    sfx('fween');
    await sleep(200);
    sfx(look.seal ? 'taiko' : 'slam');
    if (job.jackpot) sfx('fanfare');
    await sleep(140);
    const hold = job.hold ?? p.hold;
    const rain = look.coins || job.coins ? (sfx('coins'), coinRain(hold)) : null;
    if (look.seal) {
      // 柔道: 文字のあとに紅い判を押す
      sleep(260).then(() => {
        $('seal').classList.add('stamp');
        sfx('taiko');
      });
    }
    sfx('gagaga', hold);
    await shake(hold);
    for (const seven of sevens) seven.classList.remove('in');
    $('seal').classList.remove('stamp');
    sfx('out');
    stage.classList.add('out');
    await sleep(220);
    stopLines();
    stage.className = 'stage';
    await rain;
    await sleep(120);
  }

  // --- ルーレットの演出（通常カットインだけ。画像付きカットインでは出さない） ---
  const { config: fullConfig, defaults } = await loadConfig();
  const wheel = createWheel($('closeup'));

  // ギリギリ演出の大写し: 針のまわりを画面いっぱいに映し、ルーレットと同じ動きで境目へにじり寄る（丸型だけ）
  async function closeup(spin) {
    const entry = fullConfig?.roulettes?.[spin.id];
    if (!entry || !['wheel', 'casino', 'judo'].includes(entry.style ?? 'wheel')) return;
    const r = prepareRoulette(spin.id, entry, defaults?.roulettes);
    const winner = r.items[spin.index];
    if (!winner) return;
    wheel.show(r);
    $('closeup').classList.add('on');
    const t0 = performance.now();
    await new Promise((resolve) => {
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / CHANCE_MS);
        wheel.setRotation(creepRotation(winner, spin.land, t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    await sleep(700); // 止まったところを少し見せる
    $('closeup').classList.remove('on');
  }


  // 当たりの演出は、止まったところ（そろった絵柄・針の先）を少し見せてから入れる
  const REVEAL_LOOK_MS = 600;

  // ルーレットが回り始めたときに届く。ルーレットの画面は順番待ちをするので、サーバーの時刻（revealAt）から逆算する
  function onSpin(spin) {
    const toReveal = spin.revealAt - spin.at;
    const toStart = Math.max(0, toReveal - (spin.spinMs ?? 0));
    const later = (ms, fn) => setTimeout(fn, Math.max(0, ms));
    const e = spin.trigger ?? {};
    if (spin.kakutei === 'freeze') later(toStart, freeze);
    if (spin.kakutei === 'rainbow') {
      later(toStart, () => queue.push({ e, tier: 'rainbow', text: p.rainbowText, tag: spin.name, hold: 0.8, freeze: false, deadline: performance.now() + 1500 }));
    }
    if (spin.chance) {
      const creepAt = toReveal - CHANCE_MS;
      // 帯の出入りでおよそ1.2秒。にじり寄りが始まるころに抜けるように出す
      const text = lookOf(spin.style).chance ?? TEXT[spin.chance];
      later(creepAt - 1250, () => queue.push({ e, tier: spin.chance, text, tag: spin.name, hold: 0.5, freeze: false, deadline: performance.now() + 400 }));
      later(creepAt, () => closeup(spin));
    }
  }

  const queue = createQueue(play, { max: 20 });
  connect({
    event(e) {
      if (shouldShow(e)) queue.push({ e });
    },
    roulette(m) {
      if (!isImage && p.rouletteWin && m.spin) onSpin(m.spin);
    },
    // スロットの大当たり・ジャックポット（結果が画面に出るタイミングで届く）。和パチスロは 7・7・7、カジノは金貨
    slotResult(m) {
      const result = m.result;
      if (isImage || !p.slotWin || !result || !['big', 'jackpot'].includes(result.tier)) return;
      const style = fullConfig?.slots?.look === 'casino' ? 'casino' : 'slot';
      const text = m.payout?.text || (result.tier === 'jackpot' ? 'ジャックポット' : '大当たり');
      setTimeout(() => queue.push({ e: { user: result.user }, tier: lookOf(style).tier, text, tag: '', hold: p.hold * 2, freeze: result.tier === 'jackpot', jackpot: true, look: style, coins: result.tier === 'jackpot' }), REVEAL_LOOK_MS);
    },
    // ルーレットで当たりの項目が出た（結果が画面に出るタイミングで届く）: 虹の帯・フリーズ・ファンファーレ
    rouletteResult(m) {
      const spin = m.spin;
      if (isImage || !p.rouletteWin || !spin?.win) return;
      const look = lookOf(spin.style);
      setTimeout(() => queue.push({ e: spin.trigger ?? {}, tier: look.tier, text: p.rouletteWinText || look.win, tag: spin.label, hold: p.hold * 2, freeze: look.freeze ?? true, jackpot: true, look: spin.style }), REVEAL_LOOK_MS);
    },
  });
}
