// ウィジェット共通: サーバーとの接続、URL パラメータ、数値の表示、ギフト画像など。

/** 全ウィジェット共通のパラメータ（theme / preview / scale）を反映する */
export function setupPage() {
  const q = new URLSearchParams(location.search);
  if (q.get('theme') === 'light') document.documentElement.dataset.theme = 'light';
  if (q.get('preview') === '1') document.body.classList.add('preview');
  const scale = Number(q.get('scale'));
  if (scale > 0 && scale !== 1) document.documentElement.style.zoom = String(scale);
  // ?accent=ff4f1f で差し色（朱）を変えられる
  const accent = q.get('accent')?.replace(/^#/, '');
  if (accent && /^[0-9a-f]{3,8}$/i.test(accent)) document.documentElement.style.setProperty('--signal', `#${accent}`);
}

/** lucide のアイコン（/vendor/icons/<name>.svg）を文字色で表示する要素 */
export function icon(name, size) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.style.setProperty('--src', `url("/vendor/icons/${name}.svg")`);
  if (size) span.style.setProperty('--size', typeof size === 'number' ? `${size}px` : size);
  return span;
}

/** ギフトの価格帯。トークンの色分けに使う */
export function tier(diamonds) {
  if (diamonds >= 1000) return 'top';
  if (diamonds >= 100) return 'high';
  if (diamonds >= 10) return 'mid';
  return 'low';
}

/**
 * URL のクエリを defaults の型に合わせて読む。
 * 数値は Number、真偽は 1/0・true/false、それ以外は文字列。
 */
export function params(defaults) {
  const q = new URLSearchParams(location.search);
  const out = { ...defaults };
  for (const [key, def] of Object.entries(defaults)) {
    if (!q.has(key)) continue;
    const raw = q.get(key);
    if (typeof def === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) out[key] = n;
    } else if (typeof def === 'boolean') {
      out[key] = raw === '1' || raw === 'true' || raw === '';
    } else {
      out[key] = raw;
    }
  }
  return out;
}

export const list = (s) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * サーバーに WebSocket でつなぎ、切れたら自動でつなぎ直す。
 * handlers: { hello(status, state), event(e, state), state(state), status(status), control(msg) }
 */
export function connect(handlers) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  let ws;
  const open = () => {
    ws = new WebSocket(url);
    ws.onmessage = (m) => {
      let msg;
      try {
        msg = JSON.parse(m.data);
      } catch {
        return;
      }
      if (msg.type === 'hello') handlers.hello?.(msg.status, msg.state);
      else if (msg.type === 'event') handlers.event?.(msg.event, msg.state);
      else if (msg.type === 'state') handlers.state?.(msg.state);
      else if (msg.type === 'status') handlers.status?.(msg.status);
      else if (msg.type === 'control') handlers.control?.(msg);
    };
    ws.onclose = () => setTimeout(open, 2000);
  };
  open();
}

/** 自分宛ての制御メッセージか（target が自分の名前か 'all'） */
export const isFor = (msg, name) => msg.target === name || msg.target === 'all';

const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('ja-JP');
export const fmt = (n) => (Math.abs(n) >= 100_000 ? compact.format(n) : plain.format(Math.round(n)));

/** 数値をなめらかに数え上げる */
export function countTo(el, to, { duration = 600 } = {}) {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(to);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  cancelAnimationFrame(Number(el.dataset.raf));
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (t < 1) el.dataset.raf = String(requestAnimationFrame(step));
  };
  el.dataset.raf = String(requestAnimationFrame(step));
}

/** ギフトの見た目。画像があれば画像、なければ（デモなど）価格帯の色のトークン */
export function giftNode(gift, size = 64) {
  const span = document.createElement('span');
  span.className = 'gift-visual';
  span.style.setProperty('--size', `${size}px`);
  const showToken = () => {
    span.classList.add('token', `tier-${tier(gift?.diamonds ?? 1)}`);
    span.replaceChildren(icon(gift?.icon || 'gift'));
  };
  if (gift?.image) {
    const img = new Image(size, size);
    img.alt = gift.name ?? '';
    img.referrerPolicy = 'no-referrer';
    img.src = gift.image;
    img.onerror = showToken;
    span.append(img);
  } else {
    showToken();
  }
  return span;
}

const iconCache = new Map();
/** canvas に描くためのアイコン画像（色と線の太さを指定） */
export function iconImage(name, color = '#111113', strokeWidth = 2.25) {
  const key = `${name}|${color}|${strokeWidth}`;
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      fetch(`/vendor/icons/${name}.svg`)
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((svg) => {
          const colored = svg
            .replaceAll('currentColor', color)
            .replace(/stroke-width="[\d.]+"/, `stroke-width="${strokeWidth}"`);
          return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`);
        })
        .catch(() => null),
    );
  }
  return iconCache.get(key);
}

/** 桁ごとに数字が回るカウンター */
export function odometer(el, value) {
  const text = fmt(value);
  const prev = el.dataset.text;
  el.dataset.text = text;
  const shape = (t) => t.replace(/\d/g, '0');
  const strips = el.querySelectorAll('.odo-strip');
  if (prev != null && shape(prev) === shape(text) && strips.length) {
    let k = 0;
    for (const ch of text) if (/\d/.test(ch)) strips[k++].style.transform = `translateY(-${ch}em)`;
    return;
  }
  // 桁数や書式が変わったら作り直して、0 から回す
  el.classList.add('odo');
  const targets = [];
  el.replaceChildren(
    ...[...text].map((ch) => {
      if (!/\d/.test(ch)) {
        const s = document.createElement('span');
        s.className = 'odo-char';
        s.textContent = ch;
        return s;
      }
      const d = document.createElement('span');
      d.className = 'odo-digit';
      const strip = document.createElement('span');
      strip.className = 'odo-strip';
      for (let i = 0; i < 10; i++) {
        const n = document.createElement('span');
        n.textContent = String(i);
        strip.append(n);
      }
      d.append(strip);
      targets.push([strip, ch]);
      return d;
    }),
  );
  if (prev == null) {
    for (const [strip, ch] of targets) {
      strip.style.transition = 'none';
      strip.style.transform = `translateY(-${ch}em)`;
    }
    return;
  }
  requestAnimationFrame(() => {
    for (const [strip, ch] of targets) strip.style.transform = `translateY(-${ch}em)`;
  });
}

/** アバター（なければ頭文字） */
export function avatarNode(user, size = 48) {
  const span = document.createElement('span');
  span.className = 'avatar';
  span.style.setProperty('--size', `${size}px`);
  const initial = () => {
    span.textContent = (user?.name ?? '?').slice(0, 1);
  };
  if (user?.avatar) {
    const img = new Image(size, size);
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.src = user.avatar;
    img.onerror = () => {
      img.remove();
      initial();
    };
    span.append(img);
  } else {
    initial();
  }
  return span;
}

const imageCache = new Map();
/** canvas に描くための画像を読み込む（失敗したら null） */
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      }),
    );
  }
  return imageCache.get(url);
}

let audioCtx;
/** 効果音（音源ファイルなしで鳴らす短いチャイム） */
export function chime(kind = 'gift', volume = 0.3) {
  try {
    audioCtx ??= new AudioContext();
    const notes = { gift: [880, 1320], follow: [660, 990], win: [523, 659, 784, 1047], tick: [1800] }[kind] ?? [880];
    const t0 = audioCtx.currentTime;
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = t0 + i * (kind === 'tick' ? 0 : 0.09);
      const len = kind === 'tick' ? 0.03 : 0.35;
      osc.type = kind === 'tick' ? 'square' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * (kind === 'tick' ? 0.25 : 1), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    });
  } catch {
    // 自動再生が止められている環境では鳴らさない
  }
}

/** 順番に1件ずつ処理するキュー（アラートやルーレット用） */
export function createQueue(run, { max = 50 } = {}) {
  const items = [];
  let busy = false;
  const next = async () => {
    if (busy || items.length === 0) return;
    busy = true;
    try {
      await run(items.shift());
    } finally {
      busy = false;
      next();
    }
  };
  return {
    push(item) {
      if (items.length >= max) items.shift();
      items.push(item);
      next();
    },
    clear() {
      items.length = 0;
    },
    get size() {
      return items.length + (busy ? 1 : 0);
    },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ギフトがトリガー条件（ギフト名/ID の一覧、または最低コイン数）に合うか */
export function giftMatches(e, { gifts = [], minCoins = 0 }) {
  if (e.kind !== 'gift') return false;
  const names = gifts.map((g) => g.toLowerCase());
  if (names.length && (names.includes(e.gift.name.toLowerCase()) || names.includes(String(e.gift.id)))) return true;
  return minCoins > 0 && e.totalDiamonds >= minCoins;
}
