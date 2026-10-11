import { connect, fmt, icon } from '/widgets/lib/overlay.js';

// --- ウィジェットの定義（設定フォームと URL の組み立てに使う） ---

const COMMON = [
  { key: 'theme', label: 'テーマ', type: 'select', options: [['dark', 'ダーク'], ['light', 'ライト']], default: 'dark' },
  { key: 'accent', label: '差し色（16進。例: ff4f1f）', type: 'text', default: '', placeholder: 'ff4f1f' },
  { key: 'scale', label: '拡大率', type: 'number', default: 1, step: 0.1, min: 0.3 },
];

const WIDGETS = [
  {
    id: 'gift-alert',
    name: 'ギフト通知',
    desc: 'ギフトやフォローが届くと、中継テロップのように名前とギフトを出します。高額ギフトは金色になります。',
    size: [760, 200],
    params: [
      { key: 'events', label: '通知するもの', type: 'multi', options: [['gift', 'ギフト'], ['follow', 'フォロー'], ['share', 'シェア']], default: 'gift,follow' },
      { key: 'minCoins', label: '通知する最低コイン', type: 'number', default: 1, min: 0 },
      { key: 'bigCoins', label: '金色にするコイン', type: 'number', default: 100, min: 0 },
      { key: 'duration', label: '表示秒数', type: 'number', default: 4.5, step: 0.5, min: 1 },
      { key: 'position', label: '縦の位置', type: 'select', options: [['top', '上'], ['center', '中央'], ['bottom', '下']], default: 'top' },
      { key: 'align', label: '横の位置', type: 'select', options: [['left', '左'], ['center', '中央'], ['right', '右']], default: 'left' },
      { key: 'sound', label: '効果音', type: 'bool', default: true },
    ],
  },
  {
    id: 'gift-jar',
    name: 'ギフト瓶',
    desc: '届いたギフトが瓶に落ちてたまっていきます。高いギフトほど玉が大きくなり、ラベルに合計コインが出ます。',
    size: [500, 700],
    actions: [['shake', '瓶をゆらす'], ['reset', '中身を空にする']],
    params: [
      { key: 'title', label: 'ラベル', type: 'text', default: 'ギフト瓶' },
      { key: 'label', label: '合計コインを表示', type: 'bool', default: true },
      { key: 'minCoins', label: '入れる最低コイン', type: 'number', default: 1, min: 0 },
      { key: 'maxItems', label: '最大個数', type: 'number', default: 300, min: 10 },
      { key: 'perGift', label: '連打1回で落とす最大数', type: 'number', default: 30, min: 1 },
      { key: 'keep', label: '読み込み直しても中身を残す', type: 'bool', default: true },
    ],
  },
  {
    id: 'roulette',
    name: 'ルーレット',
    desc: '決めたギフトが届くとルーレットがまわります。「名前*重み」で当たりやすさ（扇の大きさ）を変えられます。',
    size: [600, 680],
    actions: [['spin', 'まわす'], ['reset', '待ち列を消す']],
    params: [
      { key: 'items', label: '項目（1行に1つ。「名前*2」で2倍出やすい）', type: 'lines', default: 'ハズレ,歌う*2,一発ギャグ,ハズレ,変顔*2,質問に答える*2' },
      { key: 'gifts', label: 'まわすギフト名（カンマ区切り）', type: 'text', default: '', placeholder: '例: Rose, Doughnut' },
      { key: 'minCoins', label: 'これ以上のコインでもまわす（0 で無効）', type: 'number', default: 30, min: 0 },
      { key: 'perCount', label: '×5 なら 5 回まわす', type: 'bool', default: false },
      { key: 'duration', label: '回転の秒数', type: 'number', default: 6, step: 0.5, min: 1 },
      { key: 'hold', label: '結果の表示秒数', type: 'number', default: 4, step: 0.5, min: 1 },
      { key: 'hint', label: '案内文（空なら自動）', type: 'text', default: '' },
      { key: 'sound', label: '効果音', type: 'bool', default: true },
    ],
  },
  {
    id: 'counter',
    name: 'いいね・視聴者数',
    desc: 'いいね数・視聴者数などをスコアボードで表示します。数字は桁ごとに回って増えます。',
    size: [560, 220],
    params: [
      {
        key: 'show',
        label: '表示する数値',
        type: 'multi',
        options: [['likes', 'いいね'], ['viewers', '視聴者'], ['follows', 'フォロー'], ['diamonds', 'コイン'], ['gifts', 'ギフト'], ['shares', 'シェア'], ['comments', 'コメント']],
        default: 'likes,viewers',
      },
      { key: 'layout', label: '並べ方', type: 'select', options: [['row', '横'], ['column', '縦']], default: 'row' },
      { key: 'align', label: '寄せ', type: 'select', options: [['left', '左'], ['center', '中央'], ['right', '右']], default: 'left' },
      { key: 'labels', label: 'ラベルを表示', type: 'bool', default: true },
      { key: 'hearts', label: 'ハートを浮かべる', type: 'bool', default: true },
    ],
  },
  {
    id: 'goal',
    name: '目標バー',
    desc: 'フォロー数などの目標までの進み具合をバーで表示します。達成したら次の目標へ自動で上げることもできます。',
    size: [640, 180],
    params: [
      { key: 'title', label: 'タイトル', type: 'text', default: 'フォロー目標' },
      {
        key: 'metric',
        label: '数えるもの',
        type: 'select',
        options: [['follows', 'フォロー'], ['likes', 'いいね'], ['diamonds', 'コイン'], ['gifts', 'ギフト数'], ['shares', 'シェア'], ['comments', 'コメント']],
        default: 'follows',
      },
      { key: 'goal', label: '目標', type: 'number', default: 100, min: 1 },
      { key: 'start', label: '最初から足しておく数', type: 'number', default: 0, min: 0 },
      { key: 'step', label: '達成後に目標を上げる幅（0 で上げない）', type: 'number', default: 0, min: 0 },
      { key: 'sound', label: '達成時の効果音', type: 'bool', default: true },
    ],
  },
];

const $ = (id) => document.getElementById(id);
const store = {
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

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

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

function setupPanels() {
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

function setupTheme() {
  const apply = (t) => (document.documentElement.dataset.theme = t);
  apply(store.get('theme', 'dark'));
  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    store.set('theme', next);
  });
}

// --- 接続状態 ---

let mode = 'idle';

function renderStatus(status) {
  mode = status.mode;
  $('status').dataset.mode = status.mode;
  const labels = { idle: '未接続', connecting: '接続中', live: 'LIVE', demo: 'デモ', error: 'エラー', ended: '配信終了' };
  $('statusText').textContent = status.username && status.mode === 'live' ? `LIVE · @${status.username}` : labels[status.mode] ?? status.mode;
  const active = ['live', 'connecting', 'demo'].includes(status.mode);
  $('disconnectBtn').hidden = !active;
  $('connectBtn').hidden = active;
  $('demoBtn').hidden = active;
  if (status.message) setMessage(status.message, status.mode === 'error');
}

function setMessage(text, isError = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', isError);
}

function setupConnect() {
  $('username').value = store.get('username', '');
  $('signApiKey').value = store.get('signApiKey', '');

  $('connectForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const username = $('username').value.trim().replace(/^@/, '');
    const signApiKey = $('signApiKey').value.trim();
    store.set('username', username);
    store.set('signApiKey', signApiKey);
    $('connectBtn').disabled = true;
    try {
      await api('/api/connect', { username, signApiKey: signApiKey || undefined });
    } catch (err) {
      setMessage(err.message, true);
    } finally {
      $('connectBtn').disabled = false;
    }
  });
  $('demoBtn').addEventListener('click', () => api('/api/demo', { on: true }).catch((e) => setMessage(e.message, true)));
  $('disconnectBtn').addEventListener('click', () => api('/api/disconnect', {}).catch((e) => setMessage(e.message, true)));
}

// --- 集計 ---

const KPIS = [
  ['likes', 'いいね', 'heart'],
  ['viewers', '視聴者', 'eye'],
  ['follows', 'フォロー', 'user-plus'],
  ['diamonds', 'コイン', 'coins'],
  ['gifts', 'ギフト', 'gift'],
];

function setupKpis() {
  for (const [key, label, iconName] of KPIS) {
    const el = document.createElement('div');
    el.className = 'kpi';
    el.innerHTML = `<div class="kpi-label"><span></span></div><div class="kpi-value" data-kpi="${key}">0</div>`;
    el.querySelector('.kpi-label span').textContent = label;
    el.querySelector('.kpi-label').prepend(icon(iconName));
    $('kpis').append(el);
  }
}

function renderState(state) {
  for (const [key] of KPIS) {
    document.querySelector(`[data-kpi=${key}]`).textContent = fmt(state[key] ?? 0);
  }
}

// --- テスト送信 ---

async function setupSimulate() {
  const gifts = await api('/api/gifts').catch(() => []);
  for (const g of gifts) {
    const opt = document.createElement('option');
    opt.value = g.name;
    opt.textContent = `${g.name}（${fmt(g.diamonds)} コイン）`;
    $('giftSelect').append(opt);
  }
  for (const btn of document.querySelectorAll('[data-sim]')) {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.sim;
      const body = { kind };
      if (kind === 'gift') {
        body.giftName = $('giftSelect').value;
        body.count = Number($('giftCount').value) || 1;
      } else if (kind === 'like') {
        body.count = 20;
      }
      api('/api/simulate', body).catch((e) => setMessage(e.message, true));
    });
  }
  $('resetBtn').addEventListener('click', () => {
    if (confirm('いいね・フォロー・コインなどの集計を 0 に戻します。よろしいですか？')) api('/api/reset', {});
  });
}

// --- イベントログ ---

const ICONS = { gift: 'gift', like: 'heart', follow: 'user-plus', share: 'repeat-2', chat: 'message-circle', viewers: 'eye' };
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

function describe(e) {
  switch (e.kind) {
    case 'gift':
      return [e.user.name, ` ${e.gift.name} ×${e.gift.count}（${fmt(e.totalDiamonds)} コイン）`];
    case 'like':
      return [e.user.name, ` いいね ×${e.count}`];
    case 'follow':
      return [e.user.name, ' フォロー'];
    case 'share':
      return [e.user.name, ' シェア'];
    case 'chat':
      return [e.user.name, ` ${e.text}`];
    case 'viewers':
      return ['', `視聴者 ${fmt(e.viewers)} 人`];
    default:
      return null;
  }
}

function addLog(e, { animate = true } = {}) {
  // 入室といいねはログが流れすぎるので、いいねは 10 以上のときだけ残す
  if (e.kind === 'member' || (e.kind === 'like' && e.count < 10)) return;
  const parts = describe(e);
  if (!parts) return;
  const log = $('log');
  log.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  if (!animate) li.style.animation = 'none';
  li.className = `kind-${e.kind}`;
  li.innerHTML = '<span class="time"></span><span class="text"><span class="name"></span><span class="muted"></span></span>';
  li.querySelector('.time').textContent = timeFmt.format(e.ts);
  li.querySelector('.time').after(icon(ICONS[e.kind] ?? 'circle'));
  li.querySelector('.name').textContent = parts[0];
  li.querySelector('.muted').textContent = parts[1];
  log.prepend(li);
  while (log.children.length > 40) log.lastElementChild.remove();
}

function clearLog() {
  $('log').innerHTML = '<li class="empty">まだイベントはありません。「デモを流す」かテスト送信で試せます。</li>';
}

// --- ウィジェットの設定と URL ---

let current = WIDGETS[0];
let values = {};

function settingsFor(w) {
  const saved = store.get(`widget:${w.id}`, {});
  const out = {};
  for (const prm of [...w.params, ...COMMON]) out[prm.key] = saved[prm.key] ?? prm.default;
  return out;
}

function buildUrl(w, values, extra = {}) {
  const url = new URL(`/widgets/${w.id}.html`, location.origin);
  for (const prm of [...w.params, ...COMMON]) {
    const v = values[prm.key];
    if (v === prm.default) continue;
    url.searchParams.set(prm.key, prm.type === 'bool' ? (v ? '1' : '0') : String(v));
  }
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return url.toString();
}

function renderTabs() {
  const tabs = $('tabs');
  tabs.replaceChildren();
  for (const w of WIDGETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pressable';
    b.role = 'tab';
    b.textContent = w.name;
    b.setAttribute('aria-selected', String(w === current));
    b.addEventListener('click', () => {
      current = w;
      store.set('tab', w.id);
      renderTabs();
      renderWidget();
    });
    tabs.append(b);
  }
}

function renderWidget() {
  const w = current;
  values = settingsFor(w);
  $('widgetDesc').textContent = w.desc;
  $('sizeHint').textContent = `OBS / TikTok LIVE Studio に「ブラウザ」ソースとして追加し、幅 ${w.size[0]}・高さ ${w.size[1]} に設定してください。`;

  const form = $('settings');
  form.replaceChildren();
  for (const prm of [...w.params, ...COMMON]) form.append(fieldFor(prm));

  const actions = $('actions');
  actions.replaceChildren();
  const test = document.createElement('button');
  test.type = 'button';
  test.className = 'chip pressable';
  test.append(icon('gift'), 'テストギフト');
  test.addEventListener('click', () => api('/api/simulate', { kind: 'gift' }));
  actions.append(test);
  for (const [action, label] of w.actions ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip pressable';
    b.textContent = label;
    b.addEventListener('click', () => api('/api/control', { target: w.id, action }));
    actions.append(b);
  }

  updateUrl(true);
}

function fieldFor(prm) {
  const wrap = document.createElement('label');
  const v = values[prm.key];
  const onChange = (value) => {
    values[prm.key] = value;
    store.set(`widget:${current.id}`, values);
    updateUrl();
  };

  if (prm.type === 'bool') {
    wrap.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(v);
    input.addEventListener('change', () => onChange(input.checked));
    wrap.append(input, prm.label);
    return wrap;
  }

  wrap.className = 'field';
  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = prm.label;
  wrap.append(label);

  if (prm.type === 'multi') {
    const selected = new Set(String(v).split(',').filter(Boolean));
    const box = document.createElement('span');
    box.className = 'checks';
    for (const [val, text] of prm.options) {
      const l = document.createElement('label');
      l.className = 'check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(val);
      cb.addEventListener('change', () => {
        cb.checked ? selected.add(val) : selected.delete(val);
        // 定義順にそろえる
        onChange(prm.options.map(([o]) => o).filter((o) => selected.has(o)).join(','));
      });
      l.append(cb, text);
      box.append(l);
    }
    wrap.append(box);
    return wrap;
  }

  let input;
  if (prm.type === 'select') {
    input = document.createElement('select');
    for (const [val, text] of prm.options) input.append(new Option(text, val, false, val === v));
    input.addEventListener('change', () => onChange(input.value));
  } else if (prm.type === 'lines') {
    input = document.createElement('textarea');
    input.rows = 6;
    input.value = String(v).split(',').join('\n');
    input.addEventListener('input', () =>
      onChange(
        input.value
          .split('\n')
          .map((s) => s.trim().replaceAll(',', '、'))
          .filter(Boolean)
          .join(','),
      ),
    );
  } else {
    input = document.createElement('input');
    input.type = prm.type === 'number' ? 'number' : 'text';
    if (prm.step) input.step = String(prm.step);
    if (prm.min != null) input.min = String(prm.min);
    if (prm.placeholder) input.placeholder = prm.placeholder;
    input.value = String(v);
    input.addEventListener('input', () => {
      if (prm.type !== 'number') return onChange(input.value);
      const n = Number(input.value);
      if (input.value !== '' && Number.isFinite(n)) onChange(n);
    });
  }
  wrap.append(input);
  return wrap;
}

let previewTimer = null;
function updateUrl(immediate = false) {
  $('widgetUrl').value = buildUrl(current, values);
  // 入力のたびに読み込み直すと重いので少し待つ
  clearTimeout(previewTimer);
  previewTimer = setTimeout(
    () => {
      $('frame').src = buildUrl(current, values, { preview: '1', sound: '0', keep: '0' });
      fitPreview();
    },
    immediate ? 0 : 400,
  );
}

function fitPreview() {
  const [w, h] = current.size;
  const box = $('preview');
  const scale = Math.min(1, box.clientWidth / w);
  const frame = $('frame');
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  frame.style.transform = `scale(${scale})`;
  box.style.height = `${h * scale}px`;
}

function setupWidgets() {
  current = WIDGETS.find((w) => w.id === store.get('tab')) ?? WIDGETS[0];
  renderTabs();
  renderWidget();
  new ResizeObserver(fitPreview).observe($('preview'));
  $('copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('widgetUrl').value);
    } catch {
      $('widgetUrl').select();
      document.execCommand('copy');
    }
    const label = $('copyBtn').querySelector('span');
    label.textContent = 'コピーしました';
    setTimeout(() => (label.textContent = 'コピー'), 1500);
  });
}

// --- 起動 ---

for (const el of document.querySelectorAll('[data-icon]')) el.prepend(icon(el.dataset.icon));
setupPanels();
setupTheme();
setupKpis();
setupConnect();
setupSimulate();
setupWidgets();
clearLog();

api('/api/status')
  .then(({ recent }) => {
    for (const e of [...recent].reverse()) addLog(e, { animate: false });
  })
  .catch(() => {});

connect({
  hello(status, state) {
    renderStatus(status);
    renderState(state);
  },
  status: renderStatus,
  state(state) {
    renderState(state);
    clearLog();
  },
  event(e, state) {
    renderState(state);
    addLog(e);
  },
});
