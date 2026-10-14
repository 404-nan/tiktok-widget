// 管理画面（設定・モニター・統計）の共通部品。
import { icon, BASE } from '/widgets/lib/overlay.js';

export const $ = (id) => document.getElementById(id);

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`tw:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`tw:${key}`, JSON.stringify(value));
    } catch {}
  },
};

const copiedTimers = new WeakMap();

/**
 * 文字をコピーする。
 * クリップボードの機能が無い・失敗する・返事が来ないときでも、その場で文字を選んでコピーする。
 * 選ぶのはクリックの直後にやる。返事を待ってからだと、ブラウザに断られてボタンが止まったままになる。
 * 成否は待たない。呼び出したそばから「コピーしました」と出してよい。
 */
export function copyText(text, field) {
  const value = String(text ?? '');
  selectAndCopy(value, field);
  try {
    const pending = navigator.clipboard?.writeText?.(value);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch {
    // 機能そのものが壊れていても、上で選んでコピー済み
  }
}

function selectAndCopy(value, field) {
  const useField = !!field && typeof field.select === 'function' && field.value === value;
  const el = useField ? field : document.createElement('textarea');
  const prev = document.activeElement;
  const x = window.scrollX;
  const y = window.scrollY;
  if (!useField) {
    el.value = value;
    el.readOnly = true;
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    el.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:0;outline:0;opacity:0';
    document.body.append(el);
  }
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  el.select();
  try { el.setSelectionRange(0, el.value.length); } catch { /* 範囲を指定できない欄もある */ }
  try { document.execCommand('copy'); } catch { /* 古いやり方が無いブラウザでも、選択は残す */ }
  if (!useField) {
    el.remove();
    if (prev instanceof HTMLElement && prev.isConnected) {
      try { prev.focus({ preventScroll: true }); } catch { prev.focus(); }
    }
  }
  window.scrollTo(x, y);
}

/** ボタンの文字を「コピーしました」にして、少ししたら「コピー」に戻す */
export function flashCopied(button, label = button?.querySelector?.('span:not(.icon)')) {
  if (!label) return;
  label.textContent = 'コピーしました';
  clearTimeout(copiedTimers.get(button));
  copiedTimers.set(button, setTimeout(() => { label.textContent = 'コピー'; }, 1500));
}

/** JSON の API を呼ぶ。body を渡すと POST（method で変えられる） */
export async function api(path, body, method) {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export { statusText, createStatusGate } from './status-text.js';

// --- パネルの塗り（なめらかな角） ---

function continuousCornerPath(w, h, r) {
  r = Math.min(r, Math.min(w, h) / (2 * 1.528665));
  const f = (n) => +n.toFixed(3);
  const a = 1.528665 * r, b = 1.088493 * r, c = 0.868407 * r, d = 0.631494 * r,
    e = 0.074911 * r, g = 0.372824 * r, k = 0.16906 * r;
  return [
    `M ${f(a)} 0`, `L ${f(w - a)} 0`,
    `C ${f(w - b)} 0 ${f(w - c)} 0 ${f(w - d)} ${f(e)}`,
    `C ${f(w - g)} ${f(k)} ${f(w - k)} ${f(g)} ${f(w - e)} ${f(d)}`,
    `C ${f(w)} ${f(c)} ${f(w)} ${f(b)} ${f(w)} ${f(a)}`,
    `L ${f(w)} ${f(h - a)}`,
    `C ${f(w)} ${f(h - b)} ${f(w)} ${f(h - c)} ${f(w - e)} ${f(h - d)}`,
    `C ${f(w - k)} ${f(h - g)} ${f(w - g)} ${f(h - k)} ${f(w - d)} ${f(h - e)}`,
    `C ${f(w - c)} ${f(h)} ${f(w - b)} ${f(h)} ${f(w - a)} ${f(h)}`,
    `L ${f(a)} ${f(h)}`,
    `C ${f(b)} ${f(h)} ${f(c)} ${f(h)} ${f(d)} ${f(h - e)}`,
    `C ${f(g)} ${f(h - k)} ${f(k)} ${f(h - g)} ${f(e)} ${f(h - d)}`,
    `C 0 ${f(h - c)} 0 ${f(h - b)} 0 ${f(h - a)}`,
    `L 0 ${f(a)}`,
    `C 0 ${f(b)} 0 ${f(c)} ${f(e)} ${f(d)}`,
    `C ${f(k)} ${f(g)} ${f(g)} ${f(k)} ${f(d)} ${f(e)}`,
    `C ${f(c)} 0 ${f(b)} 0 ${f(a)} 0`, 'Z',
  ].join(' ');
}

export function setupPanels() {
  const native = CSS.supports('corner-shape', 'squircle');
  const ro = native
    ? null
    : new ResizeObserver((entries) => {
        for (const { target, contentRect } of entries) {
          target.style.clipPath = `path("${continuousCornerPath(contentRect.width, contentRect.height, 24)}")`;
        }
      });
  for (const panel of document.querySelectorAll('.panel')) {
    const bg = document.createElement('div');
    bg.className = 'panel-bg';
    panel.prepend(bg);
    if (ro) {
      bg.style.borderRadius = '0';
      ro.observe(bg);
    }
  }
}

// --- テーマ ---

export function setupTheme() {
  // ダッシュボードで見た目の案（data-style）を選んでいるときは、明るさも案が決める
  if (document.documentElement.dataset.style) {
    $('themeBtn').hidden = true;
    return;
  }
  const apply = (t) => (document.documentElement.dataset.theme = t);
  apply(store.get('theme', 'dark'));
  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    store.set('theme', next);
  });
}


// --- 上のバー ---

const PAGES = [
  { id: 'monitor', href: '/monitor/', label: 'モニター', icon: 'activity' },
  { id: 'history', href: '/history/', label: '統計', icon: 'chart-column' },
  { id: 'settings', href: '/dashboard/', label: '設定', icon: 'sliders-horizontal' },
];

function renderNav(active) {
  const nav = $('nav');
  if (!nav) return;
  nav.replaceChildren(
    ...PAGES.map((p) => {
      const a = document.createElement('a');
      a.href = BASE + p.href;
      a.className = 'pressable';
      if (p.id === active) a.setAttribute('aria-current', 'page');
      a.append(icon(p.icon), p.label);
      return a;
    }),
  );
}

/** 3つの画面で共通の準備（ナビ・テーマ・パネルの角・data-icon のアイコン） */
export function setupChrome(active) {
  renderNav(active);
  for (const el of document.querySelectorAll('[data-icon]')) el.prepend(icon(el.dataset.icon));
  setupPanels();
  setupTheme();
}
