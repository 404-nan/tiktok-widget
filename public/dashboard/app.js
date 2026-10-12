import { connect, fmt, icon } from '/widgets/lib/overlay.js';
import { createEditor } from './editor.js';
import { setupAi } from './ai.js';
import { $, store, api, setupChrome, statusText } from './common.js';

// --- 接続状態 ---

let mode = 'idle';

function renderStatus(status) {
  mode = status.mode;
  $('status').dataset.mode = status.mode;
  $('statusText').textContent = statusText(status);
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

// --- 起動 ---

setupChrome('settings');
setupKpis();
setupConnect();
setupSimulate();
clearLog();

const editor = createEditor({ api, setMessage });
let ai = null;
editor
  .start()
  .then(() => (ai = setupAi({ box: $('aiBox'), api, editor })))
  .catch((err) => setMessage(`設定を読み込めませんでした: ${err.message}`, true));

api('/api/status')
  .then(({ recent }) => {
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
