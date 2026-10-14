import { brushImage as bandImage } from './brush.js';
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
    </div>
  </div>
  <div class="flash"></div>
  <div class="freeze" id="freeze"><span>・・・</span></div>
</div>
`;

const TIER_DEFAULTS = {
  minCoins: 100, greenCoins: 300, redCoins: 1000, goldCoins: 5000, rainbowCoins: 20000, gifts: [], events: [],
  blueText: 'チャンス', greenText: 'チャンス!!', redText: '激アツ', goldText: '超激アツ', rainbowText: '確定',
  word: true, yieldToImage: false, angle: -8, hold: 1.1, shake: 1, freeze: true, lines: true, sound: true, volume: 0.5,
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
  };
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
  function buildPhotoStrip(e, t, bw, sh, seed) {
    const pad = sh * 0.3;
    const full = sh * 1.6;
    const parts = [];

    // 帯の形で切り抜いた写真
    const photo = document.createElement('div');
    photo.className = 'strip-photo';
    const mask = bandImage(bw, sh, ['#fff', '#fff'], seed);
    photo.style.webkitMaskImage = photo.style.maskImage = `url("${mask.src}")`;
    const src = p.photo || '';
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
    return { nodes: [photo, ...edges], wait: [mask, ...parts], full };
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

  // --- 1回分 ---
  async function play(e) {
    const tier = tierFor(e);
    const t = TIERS[tier];
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
    stage.style.setProperty('--fs', `${Math.round(Math.min(bh * 0.5, (W * 0.5) / Math.max(2, TEXT[tier].length)))}px`);
    stage.style.setProperty('--angle', `${p.angle}deg`);
    stage.style.setProperty('--word-fill', t.word);
    stage.style.setProperty('--tag-accent', t.accent);

    const seed = Math.floor(Math.random() * 900) + 1;
    const visual = $('visual');
    const word = $('word');
    const tagEl = $('tag');
    let wait = [];
    word.style.cssText = '';
    tagEl.style.cssText = '';
    word.hidden = !p.word;

    const hatch = isImage && window.CutinStyle && window.CutinStyle.isHatch(p.imageStyle);
    if (hatch) {
      const size = window.CutinStyle.frameSize(W, H);
      const mounted = window.CutinStyle.mount($('band'), {
        width: size.w,
        height: size.h,
        style: p.imageStyle,
        crop: p.crop && typeof p.crop === 'object' ? p.crop : { x: 0.5, y: 0.5, scale: 1 },
        photo: p.photo ? mediaUrl(p.photo) : '',
        accent: t.accent,
      });
      stage.classList.add('style-hatch');
      stage.style.setProperty('--bw', `${size.w}px`);
      stage.style.setProperty('--bh', `${size.h}px`);
      wait = mounted ? mounted.wait : [];
      visual.replaceChildren();
      word.style.left = '0px';
      const fs = Math.round(Math.min((mounted?.bandHeight ?? bh) * 0.46, (size.w * 0.72) / Math.max(2, TEXT[tier].length)));
      stage.style.setProperty('--fs', `${fs}px`);
    } else if (p.style === 'photo') {
      // 写真の帯（縁が木炭のかすれ線）
      const sh = Math.round(H > W ? Math.min(H * 0.3, W * 0.62) : H * 0.42);
      const strip = buildPhotoStrip(e, t, bw, sh, seed);
      stage.classList.add('style-photo');
      stage.style.setProperty('--bh', `${strip.full}px`);
      $('band').replaceChildren(...strip.nodes);
      wait = strip.wait;
      visual.replaceChildren();
      const fs = Math.round(Math.min(sh * 0.36, (W * 0.46) / Math.max(2, TEXT[tier].length)));
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
      $('band').replaceChildren(ink, paint, glint);
      wait = [ink, paint, glint];
    }

    // 色の帯に乗せるもの。写真を指定したときだけ写真を乗せ、なければ帯と文字だけ
    // 縦長フレームは帯の中に写真を入れてあるので、横の写真は足さない
    if (!hatch) visual.replaceChildren();
    if (!hatch && p.style !== 'photo') {
      if (p.image === 'photo' && p.photo) {
        const img = new Image();
        img.src = mediaUrl(p.photo);
        if (p.crop && typeof p.crop === 'object') img.style.objectPosition = `${Number(p.crop.x) * 100}% ${Number(p.crop.y) * 100}%`;
        visual.replaceChildren(img);
        wait.push(img);
      } else if (p.image === 'avatar') visual.replaceChildren(avatarNode(e.user, bh));
      else if (p.image === 'gift' && e.kind === 'gift') visual.replaceChildren(giftNode(e.gift, bh));
    }
    // 何も乗せないときは文字を真ん中に
    if (p.style !== 'photo' && !visual.childElementCount) word.style.left = '0px';

    // 文字とテロップ
    for (const s of $('word').children) s.textContent = TEXT[tier];
    const tag = $('tag');
    tag.replaceChildren();
    const name = document.createElement('span');
    name.textContent = e.user?.name ?? '';
    tag.append(name);
    if (e.kind === 'gift') {
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

    // 虹: フリーズ（暗転して無音）→ キュイン
    if (tier === 'rainbow' && p.freeze) {
      $('freeze').classList.add('on');
      await sleep(1100);
      $('freeze').classList.remove('on');
      sfx('kyuin');
    }

    const rect = $('rig').getBoundingClientRect();
    startLines(rect.left, rect.top, t.accent);
    stage.classList.add('play');
    sfx('fween');
    await sleep(200);
    sfx('slam');
    await sleep(140);
    sfx('gagaga', p.hold);
    await shake(p.hold);
    sfx('out');
    stage.classList.add('out');
    await sleep(220);
    stopLines();
    stage.className = 'stage';
    await sleep(120);
  }

  const queue = createQueue(play, { max: 20 });
  connect({
    event(e) {
      if (shouldShow(e)) queue.push(e);
    },
  });
}
