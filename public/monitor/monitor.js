// 配信中モニター。WebSocket で届くイベントと、サーバーの配信記録（/api/status・/api/history）から作る。

import { connect, icon } from '/widgets/lib/overlay.js';
import { $, api, setupChrome, statusText } from '/dashboard/common.js';
import { columnChart, fmtNum } from '/dashboard/charts.js';

setupChrome('monitor');

let config = null;
let session = null; // 今の配信の記録（サーバーの History）
let state = null;
let localCoins = 0; // 次の同期までに届いたギフトのコイン（すぐ数字に出すため）

const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

// --- 数字 ---

const KPIS = [
  ['viewers', '視聴者', 'eye', () => state?.viewers ?? 0],
  ['likes', 'いいね', 'heart', () => session?.totals.likes ?? state?.likes ?? 0],
  ['follows', 'フォロー', 'user-plus', () => session?.totals.follows ?? 0],
  ['comments', 'コメント', 'message-circle', () => session?.totals.comments ?? 0],
];

function setupKpis() {
  $('kpis').replaceChildren(
    ...KPIS.map(([key, label, iconName]) => {
      const box = document.createElement('div');
      const l = document.createElement('div');
      l.className = 'kpi-label';
      l.append(icon(iconName), label);
      const v = document.createElement('div');
      v.className = 'kpi-value';
      v.id = `kpi-${key}`;
      v.textContent = '0';
      box.append(l, v);
      return box;
    }),
  );
}

function renderNumbers() {
  $('coins').textContent = fmtNum((session?.totals.coins ?? 0) + localCoins);
  for (const [key, , , get] of KPIS) $(`kpi-${key}`).textContent = fmtNum(get());
}

function renderElapsed() {
  if (!session) {
    $('elapsed').textContent = '配信していません';
    return;
  }
  const ms = Date.now() - session.startedAt;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  $('elapsed').textContent = `${session.demo ? 'デモ' : `@${session.username}`} · 経過 ${h ? `${h}:` : ''}${pad(m)}:${pad(s)}`;
}

async function syncSession() {
  try {
    const st = await api('/api/status');
    renderStatus(st.status);
    if (st.session?.id !== session?.id) {
      session = st.session;
      syncTimeline();
    } else {
      session = st.session;
    }
    localCoins = 0;
    renderMinecraftStatus(st.minecraft);
    renderNumbers();
  } catch {}
}

async function syncTimeline() {
  if (!session) {
    columnChart($('spark'), [], { height: 96, axis: false });
    return;
  }
  try {
    const full = await api(`/api/history/${encodeURIComponent(session.id)}`);
    const last = full.timeline.slice(-30);
    const now = last.length - 1;
    columnChart(
      $('spark'),
      last.map((m) => ({ value: m.coins, label: `${m.t + 1}分目` })),
      { height: 96, axis: false, highlight: now, unit: ' コイン', ariaLabel: '1分ごとのコイン' },
    );
  } catch {}
}

// --- ライブフィード ---

const ICONS = { gift: 'gift', follow: 'user-plus', share: 'repeat-2', chat: 'message-circle', like: 'heart' };

function addFeed(e) {
  if (!ICONS[e.kind] || (e.kind === 'like' && e.count < 10)) return;
  const feed = $('feed');
  feed.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.className = `kind-${e.kind}`;
  if (e.kind === 'gift' && e.totalDiamonds >= 100) li.classList.add('big');
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = timeFmt.format(e.ts);
  const body = document.createElement('span');
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = e.user?.name ?? '';
  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = {
    gift: () => `${e.gift.name} ×${e.gift.count}`,
    follow: () => 'フォローしました',
    share: () => 'シェアしました',
    chat: () => e.text,
    like: () => `いいね ×${e.count}`,
  }[e.kind]();
  body.append(who, what);
  const right = document.createElement('span');
  if (e.kind === 'gift') {
    right.className = 'coins';
    right.textContent = fmtNum(e.totalDiamonds);
  }
  li.append(time, icon(ICONS[e.kind]), body, right);
  feed.prepend(li);
  while (feed.children.length > 200) feed.lastElementChild.remove();
}

function setupFeedFilter() {
  for (const b of $('feedFilter').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      for (const x of $('feedFilter').querySelectorAll('button')) x.setAttribute('aria-selected', String(x === b));
      $('feed').dataset.filter = b.dataset.filter;
    });
  }
  $('feed').innerHTML = '<li class="empty">まだイベントはありません</li>';
}

// --- WIN 数 ---

let winCounts = {};

function renderWins() {
  const box = $('winsList');
  const entries = Object.entries(config?.wins ?? {});
  $('winsSection').hidden = !entries.length;
  box.replaceChildren(
    ...entries.map(([id, w]) => {
      const n = winCounts[id]?.wins ?? 0;
      const row = document.createElement('div');
      row.className = 'win-row';
      const label = document.createElement('div');
      label.className = 'win-label';
      const big = document.createElement('span');
      big.className = 'win-num';
      big.textContent = fmtNum(n);
      const text = document.createElement('span');
      text.className = 'hint';
      text.textContent = `${w.title || id}${w.goal > 0 ? ` / ${w.goal}` : ''}${entries.length > 1 ? `（${id}）` : ''}`;
      label.append(big, text);
      const btn = (name, iconName, action, value, cls = '', ask = null) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `chip pressable ${cls}`;
        b.append(icon(iconName), name);
        b.addEventListener('click', () => {
          if (ask && !confirm(ask)) return;
          api('/api/control', { target: 'wins', action, data: { id, value } });
        });
        return b;
      };
      const buttons = document.createElement('div');
      buttons.className = 'roulette-buttons';
      buttons.append(
        btn('クリア +1', 'trophy', 'win', undefined, 'win-btn'),
        btn('-1', 'minus', 'add', -1),
        btn('戻す', 'undo-2', 'undo'),
        btn('リセット', 'rotate-ccw', 'reset', undefined, '', `${w.title || id} を 0 にリセットしますか？（「戻す」で元に戻せます）`),
      );
      row.append(label, buttons);
      return row;
    }),
  );
}

// --- RUSH ---

let rush = { active: false };
let rushOffset = 0;

let me = { mode: 'local' }; // 配信者ごとの URL のときは、豪華な演出を使えるか
function renderRushButtons() {
  const box = $('rushButtons');
  const btn = (label, iconName, action) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip pressable';
    b.append(icon(iconName), label);
    b.addEventListener('click', () => api('/api/control', { target: 'rush', action }));
    return b;
  };
  box.replaceChildren(rush.active ? btn('RUSH を終わらせる', 'square', 'stop') : btn('RUSH 突入', 'zap', 'start'));
  $('rushSection').hidden = config?.rush?.enabled === false || (me.mode === 'tenant' && !me.premium?.rush?.active);
}

function renderRush() {
  const el = $('rushText');
  if (rush.active) {
    const sec = Math.max(0, Math.ceil((rush.endsAt - (Date.now() + rushOffset)) / 1000));
    el.textContent = `RUSH 中　残り ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}　合計 ${fmtNum(rush.total)} コイン`;
  } else if (rush.last) {
    el.textContent = `待機中（前回 ${fmtNum(rush.last.total)} コイン / ギフト ${fmtNum(rush.last.gifts)} 個）`;
  } else {
    el.textContent = '待機中';
  }
}

function setRush(r) {
  const was = rush.active;
  rushOffset = r.now - Date.now();
  rush = r;
  if (was !== r.active) renderRushButtons();
  renderRush();
}

// --- ルーレット ---

const spins = []; // { spin, revealed }

function renderRoulettes() {
  const box = $('roulettes');
  box.replaceChildren();
  const entries = Object.entries(config?.roulettes ?? {});
  for (const [id, r] of entries) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip pressable';
    b.append(icon('rotate-cw'), `${r.name || id}を回す`);
    b.addEventListener('click', () => api('/api/control', { target: 'roulette', action: 'spin', data: { id } }));
    box.append(b);
  }
  if (!entries.length) box.append(Object.assign(document.createElement('span'), { className: 'hint', textContent: 'ルーレットの設定がありません' }));
}

function renderResults() {
  const pending = spins.filter((s) => !s.revealed).length;
  $('rouletteQueue').textContent = pending ? `回転待ち ${pending}` : '';
  const list = $('results');
  const shown = spins.slice(0, 8);
  list.replaceChildren(
    ...shown.map(({ spin, revealed }) => {
      const li = document.createElement('li');
      if (!revealed) li.className = 'pending';
      const label = document.createElement('span');
      label.className = 'label';
      // 画面に出るまでは結果を伏せる（配信者が先に知ってしまわないように）
      label.textContent = revealed ? spin.label : '回転中…';
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = timeFmt.format(spin.at);
      const meta = document.createElement('span');
      meta.className = 'meta';
      const by = spin.trigger?.user ? `${spin.trigger.user.name}${spin.trigger.gift ? ` の ${spin.trigger.gift.name}` : ''}` : '手動';
      meta.textContent = `${spin.name} · ${by}`;
      li.append(label, time, meta);
      return li;
    }),
  );
  if (!shown.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'まだ回していません' }));
}

// --- 目標・ランキング ---

function renderGoals() {
  const box = $('goals');
  const goals = Object.entries(config?.goals ?? {});
  box.replaceChildren();
  for (const [id, g] of goals) {
    const current = (state?.[g.metric] ?? 0) + g.start;
    let goal = Math.max(1, g.goal);
    if (g.step > 0) while (goal <= current) goal += g.step;
    const row = document.createElement('div');
    row.className = `goal-row${current >= goal ? ' done' : ''}`;
    const top = document.createElement('div');
    top.className = 'goal-top';
    const name = Object.assign(document.createElement('span'), { className: 'name', textContent: g.title || id });
    const num = Object.assign(document.createElement('span'), { className: 'num', textContent: fmtNum(current) });
    const of = Object.assign(document.createElement('span'), { className: 'of', textContent: `/ ${fmtNum(goal)}` });
    top.append(name, num, of);
    const meter = document.createElement('div');
    meter.className = 'meter';
    const fill = document.createElement('i');
    fill.style.transform = `scaleX(${Math.min(1, current / goal)})`;
    meter.append(fill);
    row.append(top, meter);
    box.append(row);
  }
  if (!goals.length) box.append(Object.assign(document.createElement('span'), { className: 'hint', textContent: '目標の設定がありません' }));
}

function renderRanking() {
  const list = $('ranking');
  const top = (state?.topGifters ?? []).slice(0, 5);
  list.replaceChildren(
    ...top.map((r, i) => {
      const li = document.createElement('li');
      li.append(
        Object.assign(document.createElement('span'), { className: 'rank', textContent: String(i + 1) }),
        Object.assign(document.createElement('span'), { className: 'name', textContent: r.user?.name ?? '' }),
        Object.assign(document.createElement('span'), { className: 'num', textContent: fmtNum(r.diamonds) }),
      );
      return li;
    }),
  );
  if (!top.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'まだいません' }));
}

// --- Minecraft ---

const mcLog = [];
function renderMinecraftStatus(st) {
  if (!st) return;
  $('mcSection').hidden = st.state === 'off';
  const el = $('mcStatus');
  el.dataset.mode = { ok: 'live', error: 'error', off: 'idle' }[st.state] ?? 'idle';
  el.querySelector('span:last-child').textContent = st.state === 'ok' ? `接続中 · 送信 ${st.sent}` : st.message;
}
function renderMinecraftLog() {
  $('mcLog').replaceChildren(
    ...mcLog.slice(0, 6).map((l) => {
      const li = document.createElement('li');
      const t = Object.assign(document.createElement('span'), { className: 'time', textContent: timeFmt.format(l.ts) });
      const c = Object.assign(document.createElement('span'), { className: `text mono ${l.ok ? '' : 'fail'}`, textContent: l.command, title: l.response ?? '' });
      li.append(t, icon(l.ok ? 'check' : 'x'), c);
      return li;
    }),
  );
}

// --- 接続状態 ---

function renderStatus(status) {
  $('status').dataset.mode = status.mode;
  $('statusText').textContent = statusText(status);
}

// --- 起動 ---

setupKpis();
setupFeedFilter();
renderResults();
({ config } = await api('/api/config'));
me = await api('/api/me').catch(() => me);
renderRoulettes();
await syncSession();
const { recent } = await api('/api/status');
for (const e of [...recent].reverse()) addFeed(e);

setInterval(renderElapsed, 1000);
setInterval(renderRush, 1000);
api('/api/wins').then((w) => {
  winCounts = w;
  renderWins();
}).catch(() => {});
api('/api/rush').then((r) => {
  setRush(r);
  renderRushButtons();
}).catch(() => {});
setInterval(syncSession, 5000);
setInterval(syncTimeline, 20000);

connect({
  hello(status, st) {
    renderStatus(status);
    state = st;
    renderNumbers();
    renderGoals();
    renderRanking();
  },
  status(status) {
    renderStatus(status);
    syncSession();
  },
  state(st) {
    state = st;
    renderNumbers();
    renderGoals();
    renderRanking();
  },
  event(e, st) {
    state = st;
    // 本番中のテスト送信は配信の記録に入らないので、数字にも足さない
    if (e.kind === 'gift' && session && (session.demo || !String(e.user?.id).startsWith('demo_'))) localCoins += e.totalDiamonds;
    addFeed(e);
    renderNumbers();
    renderGoals();
    renderRanking();
  },
  config(c) {
    config = c;
    renderRoulettes();
    renderGoals();
    renderRushButtons();
    renderWins();
  },
  rush(msg) {
    setRush(msg.rush);
  },
  wins(msg) {
    winCounts[msg.id] = msg.counter;
    renderWins();
  },
  // 管理者が豪華な演出をオン/オフしたとき
  entitlements() {
    location.reload();
  },
  roulette({ spin }) {
    spins.unshift({ spin, revealed: false });
    spins.length = Math.min(spins.length, 30);
    renderResults();
  },
  rouletteResult({ spin }) {
    const s = spins.find((x) => x.spin.seq === spin.seq);
    if (s) s.revealed = true;
    renderResults();
  },
  minecraft(msg) {
    renderMinecraftStatus(msg.status);
    if (msg.log) {
      mcLog.unshift(msg.log);
      mcLog.length = Math.min(mcLog.length, 50);
      renderMinecraftLog();
    }
  },
});
