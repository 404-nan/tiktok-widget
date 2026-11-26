// 標準ウィジェットランタイム: 1ページ1本のWebSocketを分け合い、設定・状態・見本・音・宣言バインドをまとめる。
// 個別の状態APIはウィジェット側に書かず、まず hub の state と WebSocket の知らせを使う。
import {
  prepareWidget,
  connect as overlayConnect,
  setSampleRenderer,
  mediaUrl as mediaUrlFor,
  fmt,
  odometer,
  countTo,
  icon,
  avatarNode,
  giftNode,
  giftLabel,
  createQueue,
  chime,
  sleep,
  list,
  resolveColor,
  cssColor,
  isFor,
  giftMatches,
  giftNamed,
} from './overlay.js';

export {
  BASE,
  mediaUrl,
  fmt,
  odometer,
  countTo,
  icon,
  avatarNode,
  giftNode,
  giftLabel,
  createQueue,
  chime,
  sleep,
  list,
  resolveColor,
  cssColor,
  isFor,
  giftMatches,
  giftNamed,
} from './overlay.js';

const loc = typeof location === 'undefined' ? { pathname: '', search: '' } : location;

/** ランタイム内で起きた失敗を、場所と対象つきでブラウザのコンソールへ残す。設定やイベントの中身は出さない。 */
export function reportRuntimeError(stage, error, context = {}) {
  const detail = {
    stage,
    widget: context.section ?? context.widget ?? null,
    id: context.id ?? null,
    message: error?.message ?? String(error),
  };
  if (typeof console !== 'undefined' && typeof console.error === 'function') console.error('[widget-runtime]', detail, error);
}

// --- 安全な宣言式（eval は使わない） ---

function splitOutsideQuotes(text, delimiter) {
  const out = [];
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === delimiter) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

function parseLiteral(raw) {
  const text = String(raw ?? '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1).replace(/\\(['"\\])/g, '$1');
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  if (text === 'undefined') return undefined;
  return text;
}

function readPathValue(path, context, scope = {}) {
  const parts = String(path ?? '').trim().split('.').filter(Boolean);
  if (!parts.length) return undefined;
  const root = parts.shift();
  let current;
  if (root === '$item') current = scope.item;
  else if (root === '$index') current = scope.index;
  else if (root === '$parent') current = scope.parent;
  else if (Object.prototype.hasOwnProperty.call(scope, root)) current = scope[root];
  else current = context?.[root];
  for (const part of parts) {
    if (current == null) return undefined;
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part);
    if (!m) return undefined;
    current = current[m[1]];
    for (const im of m[2].matchAll(/\[(\d+)\]/g)) {
      if (current == null) return undefined;
      current = current[Number(im[1])];
    }
  }
  return current;
}

/** `state.user.name | pipe` 形だけを解決する。自由な JavaScript は評価しない。 */
export function evaluateTemplateValue(expression, context, scope = {}) {
  const pieces = splitOutsideQuotes(String(expression ?? ''), '|').map((part) => part.trim());
  const base = pieces.shift() ?? '';
  let value;
  if (/^(['"]).*\1$/.test(base) || /^-?\d+(?:\.\d+)?$/.test(base) || ['true', 'false', 'null', 'undefined'].includes(base)) value = parseLiteral(base);
  else value = readPathValue(base, context, scope);

  for (const pipeText of pieces) {
    if (!pipeText) continue;
    const cut = pipeText.indexOf(':');
    const name = (cut < 0 ? pipeText : pipeText.slice(0, cut)).trim();
    const arg = cut < 0 ? '' : pipeText.slice(cut + 1).trim();
    if (name === 'number') value = fmt(Number(value) || 0);
    else if (name === 'string' || name === 'text') value = value == null ? '' : String(value);
    else if (name === 'json') value = JSON.stringify(value);
    else if (name === 'bool') value = Boolean(value);
    else if (name === 'media') value = value ? mediaUrlFor(String(value)) : '';
    else if (name === 'contains') {
      const needle = parseLiteral(arg);
      value = Array.isArray(value) ? value.includes(needle) : String(value ?? '').includes(String(needle));
    } else if (name === 'slice') {
      const n = Number(arg);
      value = Array.isArray(value) && Number.isFinite(n) ? (n >= 0 ? value.slice(0, n) : value.slice(n)) : [];
    } else if (name === 'empty') {
      value = value == null || (Array.isArray(value) || typeof value === 'string' ? value.length === 0 : false);
    } else if (name === 'default') {
      value = value == null || value === '' ? parseLiteral(arg) : value;
    } else {
      value = undefined;
    }
  }
  return value;
}

function compareValues(left, op, right) {
  if (op === '=' || op === '==') return left === right;
  if (op === '!=') return left !== right;
  const ln = Number(left);
  const rn = Number(right);
  const numeric = Number.isFinite(ln) && Number.isFinite(rn);
  const a = numeric ? ln : String(left ?? '');
  const b = numeric ? rn : String(right ?? '');
  if (op === '>') return a > b;
  if (op === '>=') return a >= b;
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  return false;
}

/** data-if / data-class で使う小さい条件。`path=value`、`!=`、`>`、`!path`、真偽だけ。 */
export function testTemplateCondition(expression, context, scope = {}) {
  let text = String(expression ?? '').trim();
  if (!text) return false;
  let negate = false;
  if (text.startsWith('!') && !text.startsWith('!=')) {
    negate = true;
    text = text.slice(1).trim();
  }
  let result;
  const m = /^(.+?)\s*(==|!=|>=|<=|=|>|<)\s*(.+)$/.exec(text);
  if (!m) result = Boolean(evaluateTemplateValue(text, context, scope));
  else result = compareValues(evaluateTemplateValue(m[1], context, scope), m[2], parseLiteral(m[3]));
  return negate ? !result : result;
}

// --- 設定の選択と URL パラメータ ---

function applyQueryParams(baseValues, search) {
  const query = new URLSearchParams(search || '');
  const out = { ...baseValues };
  for (const [key, def] of Object.entries(baseValues)) {
    if (!query.has(key)) continue;
    const raw = query.get(key);
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

/** map/object 両方の設定を、既定値 → config → URLパラメータの順で合体する。ネットワークには触れない純粋関数。 */
export function selectWidgetConfig({ config, defaults = {}, section, kind = 'map', fallback = {}, search = '', queryId = null }) {
  const query = new URLSearchParams(search || '');
  const requested = queryId ?? query.get('id');
  let id = 'default';
  let entry = {};
  if (kind === 'object') {
    id = requested ?? 'default';
    entry = config?.[section] ?? {};
  } else {
    const names = Object.keys(config?.[section] ?? {});
    id = requested ?? (names.includes(config?.active?.[section]) ? config.active[section] : names.includes('default') ? 'default' : names[0] ?? 'default');
    entry = config?.[section]?.[id] ?? {};
  }
  const merged = { ...fallback, ...(defaults?.[section] ?? {}), ...entry };
  return { id, entry, values: applyQueryParams(merged, search) };
}

// --- 1ページ1本の WebSocket を分け合う bus ---

/**
 * overlay.connect への接続を1回だけ作り、購読者へ配る。
 * connect はテストで差し替えられる。reload も entitlements の既定動作だけ差し替えられる。
 */
export function createWidgetSocketBus({ connect, reload = null, onError = reportRuntimeError } = {}) {
  if (typeof connect !== 'function') throw new TypeError('createWidgetSocketBus: connect が必要です');
  const listeners = new Set();
  let started = false;
  const doReload = reload ?? (() => {
    if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
  });
  const dispatch = (type, args) => {
    let handled = false;
    for (const listener of [...listeners]) {
      try {
        if (listener(type, args) === true) handled = true;
      } catch (error) {
        try { onError('socket-listener', error); } catch { /* 記録自体の失敗は無視 */ }
      }
    }
    if (type === 'entitlements' && !handled) doReload();
  };
  const handlers = new Proxy({}, {
    get: (_target, prop) => {
      const type = String(prop);
      if (type === 'hello') return (status, state, msg) => dispatch('hello', [status, state, msg]);
      if (type === 'event') return (event, state) => dispatch('event', [event, state]);
      if (type === 'state') return (state) => dispatch('state', [state]);
      if (type === 'status') return (status) => dispatch('status', [status]);
      if (type === 'control') return (msg) => dispatch('control', [msg]);
      if (type === 'config') return (config) => dispatch('config', [config]);
      if (type === 'sample') return (on, msg) => dispatch('sample', [on, msg]);
      if (type === 'configError') return (errors) => dispatch('configError', [errors]);
      return (msg) => dispatch(type, [msg]);
    },
  });
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!started) {
        started = true;
        connect(handlers);
      }
      return () => listeners.delete(listener);
    },
    get started() { return started; },
    get size() { return listeners.size; },
  };
}

let sharedBus = null;
function getSharedBus() {
  if (!sharedBus) sharedBus = createWidgetSocketBus({ connect: overlayConnect });
  return sharedBus;
}

// --- defineWidget: 複雑な画面でも接続は書かない ---

const activeContexts = new Set();
let idleProbeInstalled = false;
function installIdleProbe() {
  if (idleProbeInstalled || typeof window === 'undefined') return;
  idleProbeInstalled = true;
  window.__twIsIdle = () => [...activeContexts].every((ctx) => {
    try { return ctx.isIdle(); } catch { return false; }
  });
}

function previewMode() {
  const pv = new URLSearchParams(loc.search || '').get('preview');
  if (pv === '1') return 'sample';
  if (pv === 'live') return 'live';
  return 'off';
}

function defaultOwnsMessage(msg, ctx) {
  if (!msg || typeof msg !== 'object') return true;
  if (msg.id == null) return true;
  return String(msg.id) === String(ctx.id);
}

function makeContext(definition, prepared) {
  const handlers = new Map();
  const section = definition.section;
  const kind = definition.kind ?? 'map';
  const fallback = definition.defaults ?? {};
  let renderQueued = false;
  let configKey = JSON.stringify([prepared.id, prepared.values]);

  const ctx = {
    base: typeof window !== 'undefined' ? window.__twBase ?? '' : '',
    id: prepared.id,
    section,
    kind,
    config: prepared.values,
    fullConfig: prepared.config,
    state: null,
    status: null,
    preview: previewMode(),
    sampleOn: Boolean(typeof window !== 'undefined' && window.__twSampleOn),
    definition,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    render() {
      if (renderQueued) return;
      renderQueued = true;
      queueMicrotask(() => {
        renderQueued = false;
        if (typeof definition.render !== 'function') return;
        try { definition.render(ctx); } catch (error) { reportRuntimeError('render', error, ctx); }
      });
    },
    queue(run, opts) { return createQueue(run, opts); },
    sound(name = 'gift', opts = {}) {
      const volume = Number(opts.volume ?? ctx.config?.volume ?? 0.3);
      if (ctx.config?.sound === false || !Number.isFinite(volume) || volume <= 0 || ctx.preview === 'sample') return false;
      if (['gift', 'follow', 'win', 'tick'].includes(name)) {
        chime(name, Math.min(1, volume));
        return true;
      }
      if (typeof Audio !== 'function') return false;
      try {
        const audio = new Audio(ctx.mediaUrl(name));
        audio.volume = Math.min(1, volume);
        const played = audio.play();
        played?.catch?.((error) => opts.onMuted?.(error));
        return true;
      } catch {
        return false;
      }
    },
    chime(kindOfSound = 'gift', volume = ctx.config?.volume ?? 0.3) {
      if (ctx.config?.sound === false || Number(volume) <= 0 || ctx.preview === 'sample') return;
      chime(kindOfSound, Number(volume) || 0);
    },
    speak(text, opts = {}) {
      if (!text || ctx.preview === 'sample' || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance !== 'function') return false;
      try {
        const utter = new SpeechSynthesisUtterance(String(text));
        if (opts.lang) utter.lang = opts.lang;
        else utter.lang = 'ja-JP';
        if (opts.rate) utter.rate = opts.rate;
        if (opts.pitch) utter.pitch = opts.pitch;
        speechSynthesis.speak(utter);
        return true;
      } catch {
        return false;
      }
    },
    mediaUrl: mediaUrlFor,
    async getJSON(path) {
      const res = await fetch(String(path).startsWith('/') ? String(path) : `/${path}`);
      if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
      return res.json();
    },
    async postJSON(path, body) {
      const res = await fetch(String(path).startsWith('/') ? String(path) : `/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
      return res.json().catch(() => ({}));
    },
    isIdle() {
      return typeof definition.isIdle === 'function' ? Boolean(definition.isIdle(ctx)) : true;
    },
  };

  function recomputeConfig(nextFullConfig) {
    ctx.fullConfig = nextFullConfig ?? ctx.fullConfig;
    const selected = selectWidgetConfig({
      config: ctx.fullConfig,
      defaults: prepared.defaults,
      section,
      kind,
      fallback,
      search: loc.search || '',
    });
    const nextKey = JSON.stringify([selected.id, selected.values]);
    const changed = nextKey !== configKey;
    configKey = nextKey;
    ctx.id = selected.id;
    ctx.config = selected.values;
    if (typeof window !== 'undefined') {
      window.__twWidgetId = selected.id;
      window.__twWidgetSection = section;
    }
    if (changed) {
      if (typeof definition.onConfig === 'function') {
        try { definition.onConfig(ctx.config, ctx); } catch (error) { reportRuntimeError('config', error, ctx); }
      }
      ctx.render();
    }
  }

  function callHandlers(type, args) {
    let handled = false;
    for (const fn of [...(handlers.get(type) ?? [])]) {
      try {
        fn(...args);
        handled = true;
      } catch (error) {
        reportRuntimeError(`handler:${type}`, error, ctx);
      }
    }
    for (const fn of [...(handlers.get('*') ?? [])]) {
      try {
        fn(type, ...args);
        handled = true;
      } catch (error) {
        reportRuntimeError(`handler:${type}`, error, ctx);
      }
    }
    return handled;
  }

  ctx.__receive = (type, args) => {
    let handled = false;
    if (type === 'hello') {
      const [status, state, msg] = args;
      ctx.status = status;
      ctx.state = state;
      ctx.sampleOn = Boolean(msg?.sample?.on);
      recomputeConfig(msg?.config);
      if (typeof definition.onHello === 'function') {
        try { definition.onHello(status, state, ctx, msg); handled = true; } catch (error) { reportRuntimeError('hello', error, ctx); }
      }
      ctx.render();
    } else if (type === 'state') {
      [ctx.state] = args;
      if (typeof definition.onState === 'function') {
        try { definition.onState(ctx.state, ctx); handled = true; } catch (error) { reportRuntimeError('state', error, ctx); }
      }
      ctx.render();
    } else if (type === 'event') {
      const [event, state] = args;
      ctx.event = event;
      ctx.state = state;
      if (typeof definition.onEvent === 'function') {
        try { definition.onEvent(event, ctx); handled = true; } catch (error) { reportRuntimeError('event', error, ctx); }
      }
      ctx.render();
    } else if (type === 'status') {
      [ctx.status] = args;
      if (typeof definition.onStatus === 'function') {
        try { definition.onStatus(ctx.status, ctx); handled = true; } catch (error) { reportRuntimeError('status', error, ctx); }
      }
      ctx.render();
    } else if (type === 'config') {
      recomputeConfig(args[0]);
    } else if (type === 'sample') {
      ctx.sampleOn = Boolean(args[0]);
      if (typeof definition.onSample === 'function') {
        try { definition.onSample(ctx.sampleOn, ctx, args[1]); handled = true; } catch (error) { reportRuntimeError('sample', error, ctx); }
      }
      ctx.render();
    } else if (type === 'control') {
      const [msg] = args;
      if (typeof definition.onControl === 'function') {
        try { definition.onControl(msg, ctx); handled = true; } catch (error) { reportRuntimeError('control', error, ctx); }
      }
    } else if (type === 'entitlements' && typeof definition.onEntitlements === 'function') {
      try { definition.onEntitlements(args[0], ctx); handled = true; } catch (error) { reportRuntimeError('entitlements', error, ctx); }
    }

    if (definition.message && type === definition.message) {
      const [msg] = args;
      const owns = typeof definition.ownsMessage === 'function' ? definition.ownsMessage(msg, ctx) : defaultOwnsMessage(msg, ctx);
      if (owns) {
        ctx.message = msg;
        if (typeof definition.pickState === 'function') {
          const picked = definition.pickState(msg, ctx);
          if (picked !== undefined) ctx.state = picked;
        }
        if (typeof definition.onMessage === 'function') {
          try { definition.onMessage(msg, ctx); handled = true; } catch (error) { reportRuntimeError(`message:${type}`, error, ctx); }
        }
        ctx.render();
      }
    }
    return callHandlers(type, args) || handled;
  };

  ctx.__dispose = () => activeContexts.delete(ctx);
  return ctx;
}

/**
 * ウィジェットを定義する。接続・再接続・設定の選択・見本の枠はここが持ち、
 * 画面側は setup/render/onEvent/onMessage だけを書く。
 */
export async function defineWidget(definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('defineWidget: 定義が必要です');
  if (!definition.section) throw new TypeError('defineWidget: section が必要です');
  const kind = definition.kind ?? 'map';
  if (!['map', 'object'].includes(kind)) throw new TypeError(`defineWidget: kind は map か object です: ${kind}`);
  const prepared = await prepareWidget(definition.section, definition.defaults ?? {}, { kind });
  const ctx = makeContext(definition, prepared);
  activeContexts.add(ctx);
  installIdleProbe();

  if (typeof definition.setup === 'function') {
    try {
      await definition.setup(ctx);
    } catch (error) {
      reportRuntimeError('setup', error, ctx);
      throw error;
    }
  }

  setSampleRenderer((on) => {
    ctx.sampleOn = on;
    if (on && typeof definition.sample === 'function') {
      try { definition.sample(ctx); } catch (error) { reportRuntimeError('sample-data', error, ctx); }
    }
    ctx.render();
  });

  getSharedBus().subscribe(ctx.__receive);
  ctx.render();
  return ctx;
}

// --- HTML 宣言バインディング ---

const BINDING_SELECTOR = '[data-text],[data-show],[data-if],[data-class],[data-attr-src],[data-attr-alt],[data-attr-href],[data-attr-title],[data-attr-width],[data-attr-height],[data-attr-value],[data-attr-checked],[data-attr-disabled]';

function bindElement(el, context, scope) {
  if (el.hasAttribute('data-text')) {
    const value = evaluateTemplateValue(el.getAttribute('data-text'), context, scope);
    el.textContent = value == null ? '' : String(value);
  }
  if (el.hasAttribute('data-show')) {
    el.hidden = !testTemplateCondition(el.getAttribute('data-show'), context, scope);
  }
  if (el.hasAttribute('data-if')) {
    el.hidden = !testTemplateCondition(el.getAttribute('data-if'), context, scope);
  }
  if (el.hasAttribute('data-class')) {
    for (const item of String(el.getAttribute('data-class')).split(',')) {
      const cut = item.indexOf(':');
      if (cut < 0) continue;
      const className = item.slice(0, cut).trim();
      const condition = item.slice(cut + 1).trim();
      if (className) el.classList.toggle(className, testTemplateCondition(condition, context, scope));
    }
  }
  for (const attr of [...el.attributes]) {
    if (!attr.name.startsWith('data-attr-')) continue;
    const target = attr.name.slice('data-attr-'.length);
    if (target.startsWith('on') || target === 'srcdoc') continue;
    const value = evaluateTemplateValue(attr.value, context, scope);
    const text = value == null ? '' : String(value);
    if (target === 'href' && /^javascript:/i.test(text)) continue;
    if (value == null || value === false || text === '') el.removeAttribute(target);
    else if (value === true) el.setAttribute(target, '');
    else el.setAttribute(target, text);
  }
}

function bindTree(root, context, scope) {
  if (root.nodeType === 1 && root.matches?.(BINDING_SELECTOR)) bindElement(root, context, scope);
  const listOfNodes = typeof root.querySelectorAll === 'function' ? root.querySelectorAll(BINDING_SELECTOR) : [];
  for (const el of listOfNodes) bindElement(el, context, scope);
}

/** data-text/show/if/class/attr/each を、現在の ctx に合わせて DOM へ写す。HTML は入れず textContent だけ。 */
export function bindTemplate(root, context, scope = {}) {
  if (!root) return;
  for (const old of root.querySelectorAll('[data-tw-generated]')) old.remove();
  bindTree(root, context, scope);
  for (const template of root.querySelectorAll('template[data-each]')) {
    const rows = evaluateTemplateValue(template.getAttribute('data-each'), context, scope);
    const items = Array.isArray(rows) ? rows : [];
    const insertAt = template.nextSibling;
    const parent = template.parentNode;
    if (!parent) continue;
    items.forEach((item, index) => {
      const fragment = template.content.cloneNode(true);
      bindTree(fragment, context, { ...scope, item, index, parent: scope.item });
      const generated = [...fragment.children];
      for (const el of generated) el.setAttribute('data-tw-generated', '');
      parent.insertBefore(fragment, insertAt);
    });
  }
}

function parseJsonAttribute(text, fallback, stage, section) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    reportRuntimeError(stage, error, { section });
    return fallback;
  }
}

function sampleAdjustedContext(ctx, sampleData) {
  if (!ctx.sampleOn || !sampleData || typeof sampleData !== 'object') return ctx;
  return {
    ...ctx,
    state: { ...(ctx.state ?? {}), ...(sampleData.state ?? {}) },
    config: { ...(ctx.config ?? {}), ...(sampleData.config ?? {}) },
    event: sampleData.event ?? ctx.event,
    message: sampleData.message ?? ctx.message,
  };
}

function bootDeclarativeWidget() {
  if (typeof document === 'undefined' || !document.body) return;
  const body = document.body;
  if (!body.hasAttribute('data-tw-widget') || body.hasAttribute('data-tw-manual') || body.__twDeclarativeBooted) return;
  body.__twDeclarativeBooted = true;
  const section = body.getAttribute('data-section');
  const kind = body.getAttribute('data-config-kind') || 'map';
  const stateMode = body.getAttribute('data-state') || 'socket';
  if (!['socket', 'auto', 'none'].includes(stateMode)) {
    reportRuntimeError('boot', new Error(`data-state=${stateMode} は個別APIです。標準テンプレートでは socket を使います`), { section });
    return;
  }
  const defaults = parseJsonAttribute(body.getAttribute('data-defaults'), {}, 'defaults-json', section);
  const sampleData = parseJsonAttribute(body.getAttribute('data-sample'), null, 'sample-json', section);
  defineWidget({
    section,
    kind,
    defaults,
    message: body.getAttribute('data-message') || undefined,
    render(ctx) {
      bindTemplate(document.body, sampleAdjustedContext(ctx, sampleData));
    },
  }).catch((error) => reportRuntimeError('boot', error, { section }));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootDeclarativeWidget, { once: true });
  else bootDeclarativeWidget();
}
