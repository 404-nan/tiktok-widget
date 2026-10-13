import { connect, fmt, icon, giftLabel, BASE } from '/widgets/lib/overlay.js';
import { createEditor } from './editor.js';
import { setupAi } from './ai.js';
import { $, store, api, setupChrome, statusText } from './common.js';

// --- 接続状態 ---

let mode = 'idle';

function renderStatus(status) {
  mode = status.mode;
  $('status').dataset.mode = status.mode;
  $('statusText').textContent = statusText(status);
  $('connectionSection').classList.toggle('connected', status.mode === 'live');
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

async function setupConnect() {
  const me = await api('/api/me').catch(() => null);
  $('username').value = me?.tiktokId || store.get('username', '');

  $('connectForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const username = $('username').value.trim().replace(/^@/, '');
    const signApiKey = store.get('signApiKey', '').trim(); // 前に入れた分だけ使う（入れる欄は管理画面へ）
    store.set('username', username);
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
    opt.textContent = `${giftLabel(g)}（${fmt(g.diamonds)} コイン）`;
    $('giftSelect').append(opt);
  }
  for (const btn of document.querySelectorAll('[data-sim]')) {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.sim;
      const body = { kind };
      if (kind === 'gift') {
        body.giftName = $('giftSelect').value;
        body.count = Number($('giftCount').value) || 1;
        body.senderName = $('senderName').value.trim() || 'テストさん';
      } else if (kind === 'like') {
        body.count = 20;
        body.senderName = $('senderName').value.trim() || 'テストさん';
      }
      api('/api/simulate', body).catch((e) => setMessage(e.message, true));
    });
  }
  $('resetBtn').addEventListener('click', () => {
    if (confirm('いいね・フォロー・コインなどの集計を 0 に戻します。よろしいですか？')) api('/api/reset', {});
  });
}

async function setupNotes() {
  const me = await api('/api/me').catch(() => null);
  const notes = (await api('/api/notes').catch(() => ({ notes: [] }))).notes ?? [];
  if (!notes.length) return;
  const key = `notesLastRead:${me?.id ?? 'local'}`;
  const lastRead = store.get(key, '');
  const unread = lastRead ? notes.findIndex((note) => note.id === lastRead) : notes.length;
  const unreadCount = unread < 0 ? notes.length : unread;
  $('notesPanel').hidden = false;
  $('notesBadge').hidden = unreadCount === 0;
  $('notesBadge').textContent = unreadCount ? `未読 ${unreadCount}件` : '';
  $('notesList').replaceChildren(...notes.map((note) => {
    const item = document.createElement('article');
    item.className = 'note';
    const title = document.createElement('h3');
    title.textContent = note.title;
    const date = document.createElement('time');
    date.dateTime = note.date;
    date.textContent = note.date;
    const body = document.createElement('p');
    body.className = 'note-body';
    body.textContent = note.body;
    item.append(title, date, body);
    return item;
  }));
  $('notesReadBtn').hidden = unreadCount === 0;
  $('notesReadBtn').addEventListener('click', () => {
    store.set(key, notes[0].id);
    $('notesBadge').hidden = true;
    $('notesReadBtn').hidden = true;
  });
}

async function setupDevTools() {
  const env = await api('/api/env').catch(() => ({ dev: false }));
  document.body.dataset.dev = String(Boolean(env.dev));
  $('devBadge').hidden = !env.dev;
  if (!env.dev) return;
  $('testSendPanel').hidden = false;
  $('devPreviewPanel').hidden = false;
  await setupSimulate();
  const previews = [
    ['ルーレット', `${BASE}/widgets/roulette.html?preview=1`, 600, 680],
    ['RUSH', `${BASE}/widgets/rush.html?preview=1`, 1080, 1920],
    ['延長タイマー', `${BASE}/widgets/timer.html?preview=1`, 720, 280],
    ['モニター', `${BASE}/monitor/`, 1280, 900],
    ['統計', `${BASE}/history/`, 1280, 900],
  ];
  $('devPreviewGrid').replaceChildren(...previews.map(([title, src, width, height]) => {
    const box = document.createElement('article');
    box.className = 'dev-preview';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const frame = document.createElement('div');
    frame.className = 'dev-preview-frame';
    frame.style.height = `${Math.min(height, 520)}px`;
    const iframe = document.createElement('iframe');
    iframe.title = `${title}の確認画面`;
    iframe.src = src;
    iframe.width = String(width);
    iframe.height = String(height);
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    frame.append(iframe);
    box.append(heading, frame);
    return box;
  }));
}

// --- イベントログ ---

const ICONS = { gift: 'gift', like: 'heart', follow: 'user-plus', share: 'repeat-2', chat: 'message-circle', viewers: 'eye' };
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

function describe(e) {
  switch (e.kind) {
    case 'gift':
      return [e.user.name, ` ${giftLabel(e.gift)} ×${e.gift.count}（${fmt(e.totalDiamonds)} コイン）`];
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

// --- 起動 ---

setupChrome('settings');
setupKpis();
await setupConnect();
setupNotes();
setupDevTools();
clearLog();

const editor = createEditor({ api, setMessage });
let ai = null;
editor
  .start()
  .then(() => (ai = setupAi({ box: $('aiBox'), api, editor })))
  .catch((err) => setMessage(`設定を読み込めませんでした: ${err.message}`, true));

// WebSocket が通らない環境でも接続の状態を出す（hello を受け取れなかったとき用）
setInterval(() => api('/api/status').then((s) => s.status && renderStatus(s.status)).catch(() => {}), 5000);
api('/api/status')
  .then(({ recent, status }) => {
    if (status) renderStatus(status);
    for (const e of [...recent].reverse()) addLog(e, { animate: false });
  })
  .catch(() => {});

connect({
  hello(status, state) {
    renderStatus(status);
    editor.onStatus(status);
    renderState(state);
  },
  status(status) {
    renderStatus(status);
    editor.onStatus(status);
  },
  state(state) {
    renderState(state);
    clearLog();
  },
  event(e, state) {
    renderState(state);
    addLog(e);
  },
  // AI やエディタで config.yaml が書き換えられたとき
  config: () => editor.onConfigChanged(),
  configError: (errors) => editor.onConfigError(errors),
  minecraft: (msg) => editor.onMinecraft(msg),
  // 管理者が豪華な演出をオン/オフしたとき
  entitlements: () => {
    editor.onEntitlements();
    ai?.refresh();
  },
});
