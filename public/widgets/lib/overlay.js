// ウィジェット共通: 設定の読み込み、サーバーとの接続、URL パラメータ、数値の表示、ギフト画像など。
import { giftNameJa } from './gift-names.js';
import './gift-name.js';

// --- 配信者ごとの URL（/t/<鍵>/...） ---
// 配信者ごとの URL で開いたときは、API・画像・接続をその下に向ける（1人で使うときは BASE は空）
const loc = typeof location === 'undefined' ? { pathname: '', search: '' } : location;
export const BASE = loc.pathname.match(/^\/t\/[^/]+/)?.[0] ?? '';
if (BASE && typeof window !== 'undefined' && !window.__twBase) {
  window.__twBase = BASE;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => original(typeof input === 'string' && /^\/(api|media)\//.test(input) ? BASE + input : input, init);
}
/** 設定に書いた画像（media/... や URL）を、表示できる URL にする */
export const mediaUrl = (src) => (/^(https?:|data:|blob:)/.test(src) ? src : src.startsWith('/') ? BASE + src : `${BASE}/${src.replace(/^\.?\//, '')}`);

// --- 設定（config.yaml） ---

let configSelector = null; // 設定のどこが変わったら読み込み直すか
let configSnapshot = null;

let giftNamesPromise = null;
let giftNamesRetry = null;

function clearGiftNamesRetry() {
  if (giftNamesRetry == null) return;
  clearTimeout(giftNamesRetry);
  giftNamesRetry = null;
}

function scheduleGiftNamesRetry() {
  if (giftNamesRetry != null || globalThis.__twGiftNamesReady) return;
  giftNamesRetry = setTimeout(() => {
    giftNamesRetry = null;
    ensureGiftNames();
  }, 3000);
  if (giftNamesRetry && typeof giftNamesRetry.unref === 'function') giftNamesRetry.unref();
}

/** ギフト名の対応表を読み、画面の表示名を日本語にする。失敗したら取得済みにせず取り直す */
export function ensureGiftNames() {
  if (globalThis.__twGiftNamesReady) return Promise.resolve();
  if (typeof fetch !== 'function') return Promise.resolve();
  if (giftNamesPromise) return giftNamesPromise;
  giftNamesPromise = fetch('/api/gift-names')
    .then((res) => {
      if (!res.ok) throw new Error('gift-names');
      return res.json();
    })
    .then((data) => {
      if (!data || typeof globalThis.installGiftNames !== 'function') throw new Error('gift-names');
      globalThis.installGiftNames(data);
      if (!globalThis.__twGiftNamesReady) throw new Error('gift-names');
      clearGiftNamesRetry();
    })
    .catch(() => {
      giftNamesPromise = null;
      scheduleGiftNamesRetry();
    });
  return giftNamesPromise;
}

/** サーバーから設定と初期値を取る（サーバーが古い・落ちているときは null） */
export async function loadConfig() {
  await ensureGiftNames();
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return { config: null, defaults: {} };
    const { config, defaults } = await res.json();
    return { config, defaults: defaults ?? {} };
  } catch {
    return { config: null, defaults: {} };
  }
}

/**
 * ウィジェットの設定を作る。初期値 ← config.yaml の該当する名前（?id=、なければ default）← URL パラメータ の順に上書き。
 * テーマも当てて、設定ファイルのこの部分が変わったら自動で読み込み直す。
 */
export async function setupWidget(section, fallback = {}) {
  const { config, defaults } = await loadConfig();
  applyTheme(config?.theme);
  setupPage();
  const queryId = new URLSearchParams(location.search).get('id');
  const names = Object.keys(config?.[section] ?? {});
  const id = queryId ?? (names.includes(config?.active?.[section]) ? config.active[section] : names.includes('default') ? 'default' : names[0] ?? 'default');
  window.__twWidgetId = id;
  window.__twWidgetSection = section;
  const entry = config?.[section]?.[id] ?? {};
  reloadOnConfigChange((c) => [c?.theme, c?.active?.[section], c?.[section]?.[id], queryId]);
  configSnapshot = JSON.stringify([config?.theme, config?.active?.[section], config?.[section]?.[id], queryId]);
  setupSample(section, id);
  return params({ ...fallback, ...defaults[section], ...entry });
}

const SAMPLE_NAMES = { alerts: 'ギフト通知', chats: 'コメント欄', goals: '目標バー', counters: 'カウンター', rankings: 'ランキング', roulettes: 'ルーレット', jars: 'ギフト瓶', wins: 'WIN数', timers: '延長タイマー', bosses: 'ボス討伐', cutins: 'カットイン', imageCutins: '画像付きカットイン', rush: 'RUSH', slots: 'スロット', theme: 'ウィジェット' };
/** 各ウィジェットの本物の描画関数を、見本モードにも使う。 */
export function setSampleRenderer(renderer) {
  window.__twSampleRenderer = renderer;
  renderer(Boolean(window.__twSampleOn));
}

/** 見本モードの枠と札。見本は画面の中だけで作り、サーバーへイベントを送らない。 */
export function setupSample(section, id = 'default') {
  if (document.body.classList.contains('preview')) return;
  if (!document.getElementById('tw-sample-style')) {
    const style = document.createElement('style');
    style.id = 'tw-sample-style';
    style.textContent = `.tw-sample-frame{position:fixed;inset:4px;z-index:9998;border:1px dashed rgba(255,255,255,.78);box-shadow:inset 0 0 0 1px rgba(0,0,0,.5);pointer-events:none}.tw-sample-label{position:fixed;z-index:9999;top:8px;left:8px;padding:2px 6px;background:rgba(17,17,19,.72);color:#f6f5f1;font:600 11px/1.35 sans-serif;pointer-events:none}`;
    document.head.append(style);
  }
  const frame = document.createElement('div'); frame.id = 'tw-sample-frame'; frame.className = 'tw-sample-frame'; frame.hidden = true;
  const label = document.createElement('div'); label.id = 'tw-sample-label'; label.className = 'tw-sample-label'; label.textContent = SAMPLE_NAMES[section] ?? section; label.hidden = true;
  document.body.append(frame, label);
  const show = (on) => { window.__twSampleOn = on; frame.hidden = !on; label.hidden = !on; window.__twSampleRenderer?.(on); };
  window.__twSampleShow = show;
  fetch('/api/sample').then((r) => r.ok ? r.json() : null).then((s) => show(Boolean(s?.on))).catch(() => {});
  return show;
}

/** selector(config) の結果が変わったらページを読み込み直す */
export function reloadOnConfigChange(selector, initialConfig) {
  configSelector = selector;
  if (initialConfig !== undefined) configSnapshot = JSON.stringify(selector(initialConfig));
}

function handleConfig(config) {
  if (!configSelector) return;
  const next = JSON.stringify(configSelector(config));
  if (configSnapshot !== null && next !== configSnapshot) {
    const previous = window.__twWidgetId;
    if (window.__twWidgetQueryId == null && window.__twWidgetSection) {
      const names = Object.keys(config?.[window.__twWidgetSection] ?? {});
      const nextId = names.includes(config?.active?.[window.__twWidgetSection]) ? config.active[window.__twWidgetSection] : names.includes('default') ? 'default' : names[0] ?? 'default';
      window.__twWidgetId = nextId;
      window.dispatchEvent(new CustomEvent('tw-config-change', { detail: { config, section: window.__twWidgetSection, id: nextId, previous } }));
    } else {
      window.dispatchEvent(new CustomEvent('tw-config-change', { detail: { config, section: window.__twWidgetSection, id: previous } }));
    }
  }
  configSnapshot = next;
}

const TOKEN_VARS = { accent: '--signal', gold: '--gold', ink: '--ink', 'ink-2': '--ink-2', paper: '--paper' };

/** 設定の色（#RRGGBB か accent などの名前）を CSS で使える値にする */
export const cssColor = (v) => (TOKEN_VARS[v] ? `var(${TOKEN_VARS[v]})` : v);

/** 設定の色を canvas で使える実際の色にする */
export function resolveColor(v) {
  if (!TOKEN_VARS[v]) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(TOKEN_VARS[v]).trim();
}

const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const mix = (hex, toward, amount) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * amount)).join(', ')})`;
};

/** 背景色に対して読みやすい文字色（墨か白） */
export function readableOn(color) {
  const c = resolveColor(color);
  let m = [0, 0, 0];
  if (c.startsWith('#')) m = hexToRgb(c);
  else if (/^rgb/.test(c)) m = c.match(/\d+/g).slice(0, 3).map(Number);
  const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
  return lum > 0.6 ? resolveColor('ink') : resolveColor('paper');
}

/** config.yaml の theme を CSS 変数にする */
export function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.mode === 'light') root.dataset.theme = 'light';
  const hex = (v) => (/^#/.test(v ?? '') ? v : null);
  if (hex(theme.accent)) root.style.setProperty('--signal', theme.accent);
  if (hex(theme.gold)) root.style.setProperty('--gold', theme.gold);
  if (hex(theme.ink)) {
    root.style.setProperty('--ink', theme.ink);
    root.style.setProperty('--ink-2', mix(theme.ink, '#ffffff', 0.06));
    root.style.setProperty('--ink-3', mix(theme.ink, '#ffffff', 0.12));
  }
  if (hex(theme.paper)) {
    const [r, g, b] = hexToRgb(theme.paper);
    root.style.setProperty('--paper', theme.paper);
    root.style.setProperty('--paper-dim', `rgba(${r}, ${g}, ${b}, .64)`);
    root.style.setProperty('--paper-faint', `rgba(${r}, ${g}, ${b}, .14)`);
  }
  if (theme.scale && theme.scale !== 1) root.style.zoom = String(theme.scale);
}

/** 全ウィジェット共通のパラメータ（theme / preview / scale）を反映する */
export function setupPage() {
  const q = new URLSearchParams(location.search);
  window.__twWidgetQueryId = q.get('id');
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
    } else if (Array.isArray(def)) {
      out[key] = list(raw);
    } else if (typeof def === 'boolean') {
      out[key] = raw === '1' || raw === 'true' || raw === '';
    } else {
      out[key] = raw;
    }
  }
  return out;
}

export const list = (s) =>
  (Array.isArray(s) ? s : String(s ?? '').split(','))
    .map((x) => String(x).trim())
    .filter(Boolean);

/**
 * サーバーに WebSocket でつなぎ、切れたら自動でつなぎ直す。
 * handlers: { hello(status, state, msg), event(e, state), state(state), status(status), control(msg) }
 * hello の msg には、最近のコメント（recentChats）なども入っている
 */
export function connect(handlers) {
  const compact = new URLSearchParams(loc.search || '').get('compact') === '1';
    // ダッシュボードの中の見本(preview=1)は、配信ソフトからの接続として数えない
  const preview = new URLSearchParams(loc.search || '').get('preview') === '1';
  const query = [compact && 'compact=1', preview && 'preview=1'].filter(Boolean).join('&');
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${BASE}/ws${query ? `?${query}` : ''}`;
  let ws;
  let latestState = null;
  const open = () => {
    ws = new WebSocket(url);
    ws.onmessage = (m) => {
      let msg;
      try {
        msg = JSON.parse(m.data);
      } catch {
        return;
      }
      if (msg.type === 'hello' || msg.type === 'config') handleConfig(msg.config);
      if (msg.type === 'hello') { latestState = msg.state; handlers.hello?.(msg.status, latestState, msg); window.__twSampleShow?.(Boolean(msg.sample?.on)); handlers.sample?.(Boolean(msg.sample?.on), msg.sample); }
      else if (msg.type === 'event') { latestState = mergeStatePatch(latestState, msg.state, msg.statePatch); handlers.event?.(msg.event, latestState); }
      else if (msg.type === 'state') { latestState = msg.state; handlers.state?.(latestState); }
      else if (msg.type === 'status') handlers.status?.(msg.status);
      else if (msg.type === 'control') handlers.control?.(msg);
      else if (msg.type === 'config') handlers.config?.(msg.config);
      else if (msg.type === 'sample') { window.__twSampleShow?.(Boolean(msg.on)); handlers.sample?.(Boolean(msg.on), msg); }
      else if (msg.type === 'configError') handlers.configError?.(msg.errors);
      // 豪華な演出のオン/オフが変わった: ウィジェットは読み込み直す（使えなくなったら何も出さないページになる）
      else if (msg.type === 'entitlements' && !handlers.entitlements) location.reload();
      else handlers[msg.type]?.(msg); // roulette / rouletteResult / minecraft など
    };
    ws.onclose = () => setTimeout(open, 2000);
  };
  open();
}

export function mergeStatePatch(previous, full, patch) {
  if (full) return full;
  if (!patch) return previous;
  const next = { ...(previous ?? {}), ...patch };
  for (const name of ['topGifters', 'topLikers']) {
    const change = patch[name];
    if (!change || !Array.isArray(change.order)) continue;
    const old = new Map((previous?.[name] ?? []).map((row) => [row.key, row]));
    for (const row of change.changed ?? []) old.set(row.key, row);
    next[name] = change.order.map((key) => old.get(key)).filter(Boolean);
  }
  return next;
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
    img.alt = giftLabel(gift);
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
            .split('currentColor').join(color)
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
export function createQueue(run, { max = Infinity } = {}) {
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

/** ギフトの名前か ID が一覧に入っているか（大文字小文字は区別しない） */
export function giftNamed(gift, names) {
  if (!gift || !names?.length) return false;
  const want = list(names).map((n) => n.toLowerCase());
  return want.includes(String(gift.name).toLowerCase()) || want.includes(String(gift.nameJa ?? '').toLowerCase()) || want.includes(String(gift.id));
}

/** 対応表をまだ読んでいないときの表示。GiftID → 英語名 → nameJa → 今の名前 */
function bundledGiftLabel(gift) {
  if (gift != null && typeof gift === 'object') {
    const id = String(gift.id ?? gift.giftId ?? '').trim();
    const name = String(gift.name ?? gift.giftName ?? '').trim();
    if (id) {
      const byId = giftNameJa(id);
      if (byId && byId !== id) return byId;
    }
    if (name) {
      const byName = giftNameJa(name);
      if (byName && byName !== name) return byName;
    }
    const nameJa = String(gift.nameJa ?? '').trim();
    return nameJa || name || id || 'Gift';
  }
  if (gift == null || gift === '') return 'Gift';
  const named = giftNameJa(gift);
  return named || 'Gift';
}

/** 画面に出すギフト名。対応表を読んだあとは GiftID を先にし、表に無ければ今の名前 */
export function giftLabel(gift) {
  if (globalThis.__twGiftNamesReady && typeof globalThis.giftDisplayName === 'function') {
    const name = globalThis.giftDisplayName(gift);
    if (name) return name;
  }
  return bundledGiftLabel(gift);
}

/** ギフトがトリガー条件（ギフト名/ID の一覧、または最低コイン数）に合うか */
export function giftMatches(e, { gifts = [], minCoins = 0, maxCoins = 0 }) {
  if (e.kind !== 'gift') return false;
  if (giftNamed(e.gift, gifts)) return true;
  return minCoins > 0 && e.totalDiamonds >= minCoins && (!maxCoins || e.totalDiamonds <= maxCoins);
}
