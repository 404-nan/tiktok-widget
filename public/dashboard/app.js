import { connect, fmt, icon, giftLabel, BASE, ensureGiftNames } from '/widgets/lib/overlay.js';
import { createEditor } from './editor.js';
import { setupAi } from './ai.js';
import { setupIngest } from './ingest.js';
import { setupStreamerAi } from './ai-streamer.js';
import { $, store, api, setupChrome, statusText, createStatusGate } from './common.js';

// --- 接続状態 ---

let mode = 'idle';

function renderStatus(status) {
  status = { ...status, username: status.username || $('username')?.value.trim() };
  mode = status.mode;
  $('status').dataset.mode = status.mode;
  $('statusText').textContent = statusText(status);
  $('connectionSection').classList.toggle('connected', status.mode === 'live');
  const active = ['live', 'connecting', 'demo'].includes(status.mode);
  $('disconnectBtn').hidden = !active;
  const hasUsername = Boolean($('username').value.trim());
  $('connectBtn').hidden = active || (hasUsername && !['error', 'ended'].includes(status.mode));
  $('connectBtn').textContent = hasUsername && ['error', 'ended'].includes(status.mode) ? '今すぐつなぐ' : '配信につなぐ';
  $('demoBtn').hidden = active;
  if (status.message) setMessage(status.message, status.mode === 'error', { toast: false });
}

function setMessage(text, isError = false, { toast: allowToast = true } = {}) {
  $('message').textContent = text;
  $('message').classList.toggle('error', isError);
  const toast = $('toast');
  if (allowToast && isError && text && toast && $('message').offsetParent === null && !toast.querySelector('button')) {
    toast.textContent = text;
    clearTimeout(setMessage.toastTimer);
    setMessage.toastTimer = setTimeout(() => { if (toast.textContent === text) toast.textContent = ''; }, 5000);
  }
}

async function setupConnect() {
  const me = await api('/api/me').catch(() => null);
  $('username').value = me?.tiktokId || store.get('username', '');
  if (me?.mode === 'tenant') {
    $('profileSection').hidden = false;
    $('displayName').value = me.name || '';
    $('profileForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await api('/api/me/name', { name: $('displayName').value }, 'PUT'); $('profileMessage').textContent = '表示名を保存しました'; }
      catch (error) { $('profileMessage').textContent = error.message; $('profileMessage').classList.add('error'); }
    });
  }

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

// コインが数でない（一覧に金額が無い）ときは NaN にせず「? コイン」
function coinText(diamonds) {
  if (diamonds == null || diamonds === '') return '? コイン';
  const n = Number(diamonds);
  if (!Number.isFinite(n)) return '? コイン';
  return `${fmt(n)} コイン`;
}

async function setupSimulate() {
  const gifts = await api('/api/gifts').catch(() => []);
  for (const g of gifts) {
    const opt = document.createElement('option');
    opt.value = g.name;
    const coins = Number(g.diamonds);
    opt.dataset.diamonds = Number.isFinite(coins) ? String(coins) : '';
    if (g.id) opt.dataset.id = String(g.id);
    opt.textContent = `${giftLabel(g)}（${coinText(g.diamonds)}）`;
    $('giftSelect').append(opt);
  }
  for (const btn of document.querySelectorAll('[data-sim]')) {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.sim;
      const body = { kind };
      if (kind === 'gift') {
        const selected = $('giftSelect').selectedOptions[0];
        body.giftName = $('giftSelect').value;
        body.count = Number($('giftCount').value) || 1;
        body.senderName = $('senderName').value.trim() || 'テストさん';
        if (selected && selected.dataset.id) body.giftId = selected.dataset.id;
        if (selected && selected.dataset.diamonds !== '') body.diamonds = Number(selected.dataset.diamonds);
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

// --- プラン ---
// プランの情報があるときはいつも出す（困ったときだけ出すと、払っている期間や増えるものが分からず不安になる）。
// いまのプラン・値段・期限・残り日数・上のプランで増えるもの・案内を、この1枚にまとめる。

const yen = (n) => `${fmt(n)}円`;

function planPriceText(plan) {
  if (plan.legacy) return plan.legacy.priceYen == null ? plan.legacy.label : `${plan.legacy.label}（${yen(plan.legacy.priceYen)}／月）`;
  if (!plan.priceYen) return '0円';
  return `${yen(plan.priceYen)}／月${plan.draft ? '（仮の値段）' : ''}`;
}

function planPeriodText(plan) {
  const left = plan.daysLeft == null ? '' : plan.daysLeft === 0 ? '（今日まで）' : `（あと${plan.daysLeft}日）`;
  if (plan.status === 'trial' && plan.trialEndsAt) return `お試しは ${plan.trialEndsAt} まで${left}`;
  if (plan.status === 'free' && plan.trialEndsAt) return `お試しは ${plan.trialEndsAt} で終わりました。無料のまま続けて使えます`;
  if (plan.status === 'active' && plan.paidUntil) return `${plan.paidUntil} まで${left}`;
  if (plan.status === 'past_due' && plan.graceUntil) return `${plan.graceUntil} まで待ちます${left}`;
  return '';
}

function planMessage(plan, billing) {
  if (plan.status === 'suspended') {
    return plan.enforcementOn
      ? 'お支払いの確認が取れていません。LuLにご連絡ください。いまは配信画面を止めています'
      : 'お支払いの確認が取れていません。LuLにご連絡ください。いまは配信を止めていません';
  }
  if (plan.trialMessage) return plan.trialMessage;
  if (plan.trialNotice) return '有料化のお知らせ: お試しの期間がもうすぐ終わります。続けて使うプランは下の案内から相談できます';
  if (plan.status === 'past_due') return '支払いの確認を待っています。いまは配信を止めていません';
  if (plan.status === 'active') return '支払い済みの期間は、配信画面が出ます';
  if (plan.status === 'trial') return billing?.show === false ? 'いまのプランで使えるものが、そのまま使えます' : 'お試しの期間です';
  return '';
}

// 上のプランで増えるもの。プランごとにまとめて、名前だけ並べる（読む量を減らす）
function planUpgrades(locked) {
  const byPlan = new Map();
  for (const item of locked ?? []) {
    if (item.reason !== 'plan' || !item.requiredPlanLabel) continue;
    if (!byPlan.has(item.requiredPlanLabel)) byPlan.set(item.requiredPlanLabel, []);
    byPlan.get(item.requiredPlanLabel).push(item.label);
  }
  return [...byPlan].map(([label, items]) => {
    const p = document.createElement('p');
    p.className = 'plan-upgrade';
    p.append(icon('lock'), Object.assign(document.createElement('span'), { textContent: `${label} で使えるもの: ${items.join('、')}` }));
    return p;
  });
}

function planContactNode(plan) {
  const p = document.createElement('p');
  p.className = 'plan-contact';
  if (plan.contactUrl) {
    p.append(Object.assign(document.createElement('a'), { href: plan.contactUrl, target: '_blank', rel: 'noopener', textContent: 'プランについて LuL に聞く' }));
  } else if (plan.contactNote) {
    p.textContent = plan.contactNote;
  }
  return p.childNodes.length ? p : null;
}

function renderPlan(me) {
  const panel = $('planPanel');
  if (!panel) return;
  const plan = me?.plan;
  const billing = me?.billing;
  if (!plan) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  panel.dataset.status = plan.status;
  // 記録が無く伝えることも無い人（billing.show が偽）には「お試し」と書かない
  const statusLabel = billing?.show === false ? '' : plan.statusLabel;
  $('planStatus').textContent = [`${plan.label}プラン`, planPriceText(plan), statusLabel, planPeriodText(plan)].filter(Boolean).join('・');
  const lines = [planMessage(plan, billing)];
  if (plan.description) lines.push(plan.description);
  if (billing?.credit > 0) lines.push(`翌月以降に使える割引: ${fmt(billing.credit)}円（現金にはできません）`);
  if (billing?.code) lines.push(`紹介コード: ${billing.code}`);
  $('planBody').textContent = lines.filter(Boolean).join('\n');
  const contact = planContactNode(plan);
  $('planMore').replaceChildren(...planUpgrades(me.locked), ...(contact ? [contact] : []));
}

async function refreshPlan() {
  const me = await api('/api/me').catch(() => null);
  renderPlan(me);
}

async function setupAnnouncements() {
  const data = await api('/api/announcements').catch(() => null);
  if (!data) return;
  if (data.version) $('appVersion').textContent = `バージョン ${data.version}`;
  const items = (data.announcements ?? []).slice(0, 3);
  if (!items.length) return;
  if (data.version) $('updatesVersion').textContent = `いまのバージョンは ${data.version} です`;
  $('updatesPanel').hidden = false;
  $('updatesList').replaceChildren(...items.map((item) => {
    const article = document.createElement('article');
    article.className = 'note';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const date = document.createElement('time');
    date.dateTime = item.date;
    date.textContent = item.date;
    const meta = document.createElement('p');
    meta.className = 'note-meta';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = item.typeLabel ?? item.type;
    const version = document.createElement('span');
    version.textContent = `バージョン ${item.version}`;
    meta.append(badge, version);
    const body = document.createElement('p');
    body.className = 'note-body';
    body.textContent = item.body;
    article.append(title, date, meta, body);
    return article;
  }));
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
    if (note.url) {
      const link = Object.assign(document.createElement('a'), { className: 'note-link', href: note.url, textContent: 'くわしく見る' });
      if (/^https:/.test(note.url)) Object.assign(link, { target: '_blank', rel: 'noopener' });
      item.append(link);
    }
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
    ['スロット', `${BASE}/widgets/slot.html?preview=1`, 1080, 600],
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
await ensureGiftNames();
await setupConnect();
// 詳しい受け口設定は、ふだん使う準備画面に混ぜず、設定の折りたたみに置く。
const advancedConnection = $('advancedConnection');
const ingestSection = $('ingestSection');
if (advancedConnection && ingestSection) advancedConnection.append(ingestSection);
setupIngest({ api });
setupNotes();
setupAnnouncements();
refreshPlan();
setupDevTools();
clearLog();

const editor = createEditor({ api, setMessage });
let ai = null;
editor
  .start()
  .then(() => (ai = setupAi({ box: $('aiBox'), api, editor })))
  .catch((err) => setMessage(`設定を読み込めませんでした: ${err.message}`, true));
setupStreamerAi({ box: $('streamerAiView'), intro: $('streamerAiIntro'), body: $('streamerAiBody'), api });
// AI とつなぐ手順は設定の画面に見せる(くわしい値は、その中の「くわしい人向け」に入っている)

// WebSocket が通らない環境でも接続の状態を出す（hello を受け取れなかったとき用）。
// 出した時点より新しい受信がある返事は捨て、遅れた idle で live を戻さない。
const statusGate = createStatusGate();

function applyPolledStatus(status, ticket, widgetConnected) {
  if (!statusGate.acceptPoll(ticket)) return;
  if (status) {
    if (typeof widgetConnected === 'boolean') status.widgetConnected = widgetConnected;
    renderStatus(status);
    editor.onStatus(status);
  }
}

function pollStatus() {
  const ticket = statusGate.startPoll();
  api('/api/status').then((s) => applyPolledStatus(s.status, ticket, s.widgetConnected)).catch(() => {});
}

setInterval(pollStatus, 5000);
const bootTicket = statusGate.startPoll();
api('/api/status')
  .then(({ recent, status, widgetConnected }) => {
    applyPolledStatus(status, bootTicket, widgetConnected);
    for (const e of [...recent].reverse()) addLog(e, { animate: false });
  })
  .catch(() => {});

connect({
  hello(status, state) {
    statusGate.markReceived();
    renderStatus(status);
    editor.onStatus(status);
    renderState(state);
  },
  status(status) {
    statusGate.markReceived();
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
    refreshPlan();
  },
});
