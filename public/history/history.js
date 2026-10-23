// 配信の統計・履歴。/api/history の一覧と1回分の記録から作る。

import { connect, giftLabel, ensureGiftNames } from '/widgets/lib/overlay.js';
import { $, api, store, setupChrome, statusText, createStatusGate } from '/dashboard/common.js';
import { columnChart, lineChart, fmtNum } from '/dashboard/charts.js';

setupChrome('history');

let sessions = [];
let current = null; // 表示中の配信の id
let showDemo = store.get('history-demo', false);
let me = { mode: 'local' };

const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const durationText = (ms) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`;
};
const widgetText = (s) => {
  if (s.widgetMs == null) return '記録なし';
  return s.widgetUsed ? `使った ${durationText(s.widgetMs)}` : '使っていない';
};
const minuteLabel = (t) => `${t + 1}分目`;

// --- 一覧 ---

function visible() {
  return sessions.filter((s) => showDemo || !s.demo);
}

function renderList() {
  for (const b of $('sessionFilter').querySelectorAll('button')) b.setAttribute('aria-selected', String((b.dataset.demo === '1') === showDemo));
  const list = $('sessions');
  const rows = visible();
  list.replaceChildren(
    ...rows.map((s) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pressable';
      b.setAttribute('aria-current', String(s.id === current));
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = dateFmt.format(s.startedAt);
      const coins = document.createElement('span');
      coins.className = 'coins';
      coins.textContent = fmtNum(s.totals.coins);
      const meta = document.createElement('span');
      meta.className = 'meta';
      if (s.live) meta.append(Object.assign(document.createElement('span'), { className: 'live-mark', textContent: '● 配信中 · ' }));
      meta.append(`${s.demo ? 'デモ' : `@${s.username}`} · ${durationText(s.durationMs)} · フォロー ${fmtNum(s.totals.follows)}`);
      const widget = Object.assign(document.createElement('span'), { className: 'widget-usage', textContent: widgetText(s) });
      b.append(date, coins, meta, widget);
      b.addEventListener('click', () => open(s.id));
      li.append(b);
      return li;
    }),
  );
  if (!rows.length) list.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: showDemo ? 'まだ記録がありません' : 'まだ本番の記録がありません（「デモも」で切り替え）' }));
  $('historyEmpty').hidden = rows.length > 0;
  $('sessionsPanel').hidden = rows.length === 0;
  $('detail').hidden = rows.length === 0;
}

// --- 1回分 ---

/** 同じ種類（本番かデモか）の1つ前の配信 */
function previousOf(s) {
  const same = sessions.filter((x) => x.demo === s.demo && x.startedAt < s.startedAt);
  return same[0] ?? null; // sessions は新しい順
}

function delta(now, prev, { unit = '', higherIsBetter = true } = {}) {
  const el = document.createElement('div');
  el.className = 'delta';
  if (prev == null) {
    el.textContent = '前回の記録なし';
    return el;
  }
  const d = now - prev;
  if (d === 0) {
    el.textContent = '前回と同じ';
    return el;
  }
  el.classList.add((d > 0) === higherIsBetter ? 'up' : 'down');
  el.textContent = `前回より ${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}${unit}`;
  return el;
}

const STATS = [
  ['follows', 'フォロー'],
  ['likes', 'いいね'],
  ['peakViewers', '最大視聴者'],
  ['comments', 'コメント'],
  ['uniqueGifters', 'ギフトをくれた人'],
  ['duration', '配信時間'],
  ['widgetUsage', 'ウィジェット'],
];

function renderSummary(s, prev) {
  $('title').textContent = `${dateFmt.format(s.startedAt)}${s.live ? '（配信中）' : ''}`;
  $('subtitle').textContent = `${s.demo ? 'デモ' : `@${s.username}`} · ${durationText(s.durationMs)}`;
  $('deleteBtn').hidden = Boolean(s.live);
  $('heroCoins').textContent = fmtNum(s.totals.coins);
  $('heroDelta').replaceWith(Object.assign(delta(s.totals.coins, prev?.totals.coins, { unit: ' コイン' }), { id: 'heroDelta' }));
  $('stats').replaceChildren(
    ...STATS.map(([key, label]) => {
      const box = document.createElement('div');
      box.className = 'stat';
      const l = Object.assign(document.createElement('div'), { className: 'kpi-label', textContent: label });
      const isDur = key === 'duration';
      const isWidget = key === 'widgetUsage';
      const value = isDur ? s.durationMs : s.totals[key] ?? 0;
      const v = Object.assign(document.createElement('div'), { className: 'kpi-value', textContent: isWidget ? widgetText(s) : isDur ? durationText(value) : fmtNum(value) });
      if (isWidget) v.classList.add('widget-value');
      const prevValue = prev ? (isDur ? prev.durationMs : prev.totals[key] ?? 0) : null;
      const d = isWidget
        ? Object.assign(document.createElement('div'), { className: 'delta', textContent: '配信時間の半分以上で「使った」' })
        : isDur
        ? prev
          ? Object.assign(document.createElement('div'), { className: 'delta', textContent: `前回 ${durationText(prev.durationMs)}` })
          : delta(0, null)
        : delta(value, prevValue);
      box.append(l, v, d);
      return box;
    }),
  );
}

function renderCharts(full) {
  const tl = full.timeline;
  const best = tl.reduce((b, m, i) => (m.coins > (tl[b]?.coins ?? -1) ? i : b), 0);
  $('coinsNote').textContent = tl.length && tl[best].coins > 0 ? `いちばん多かったのは ${minuteLabel(best)}（${fmtNum(tl[best].coins)} コイン）` : '';
  columnChart($('coinsChart'), tl.map((m) => ({ value: m.coins, label: minuteLabel(m.t) })), { height: 220, unit: ' コイン', ariaLabel: '1分ごとのコイン' });
  lineChart($('viewersChart'), tl.map((m) => ({ value: m.viewers, label: minuteLabel(m.t) })), { height: 180, unit: ' 人', ariaLabel: '視聴者の推移' });
  columnChart($('likesChart'), tl.map((m) => ({ value: m.likes, label: minuteLabel(m.t) })), { height: 180, unit: ' いいね', ariaLabel: '1分ごとのいいね' });
}

function table(el, head, rows, empty) {
  el.replaceChildren();
  const thead = el.createTHead().insertRow();
  for (const [text, cls] of head) {
    const th = document.createElement('th');
    th.textContent = text;
    if (cls) th.className = cls;
    thead.append(th);
  }
  const body = el.createTBody();
  if (!rows.length) {
    const tr = body.insertRow();
    tr.className = 'empty-row';
    const td = tr.insertCell();
    td.colSpan = head.length;
    td.textContent = empty;
    return;
  }
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach(([content, cls]) => {
      const td = tr.insertCell();
      if (cls) td.className = cls;
      if (content instanceof Node) td.append(content);
      else td.textContent = content;
    });
  }
}

function renderTables(full) {
  table(
    $('gifters'),
    [['', 'rank'], ['名前'], ['コイン', 'num'], ['個数', 'num']],
    full.gifters.slice(0, 10).map((g, i) => [[String(i + 1), 'rank'], [g.name, 'name'], [fmtNum(g.coins), 'num'], [fmtNum(g.gifts), 'num']]),
    'ギフトはまだありません',
  );

  const maxCoins = Math.max(1, ...full.giftTypes.map((g) => g.coins));
  table(
    $('giftTypes'),
    [['ギフト'], ['', 'bar-cell'], ['個数', 'num'], ['コイン', 'num']],
    full.giftTypes.slice(0, 12).map((g) => {
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.width = `${Math.max(2, (g.coins / maxCoins) * 100)}%`;
      bar.title = `${fmtNum(g.coins)} コイン`;
      return [[giftLabel(g), 'name'], [bar, 'bar-cell'], [fmtNum(g.count), 'num'], [fmtNum(g.coins), 'num']];
    }),
    'ギフトはまだありません',
  );

  const box = $('rouletteResults');
  box.replaceChildren();
  $('roulettePanel').hidden = !full.roulettes.length;
  for (const r of full.roulettes) {
    const wrap = document.createElement('div');
    const h = Object.assign(document.createElement('h3'), { textContent: r.name });
    const hint = Object.assign(document.createElement('div'), { className: 'hint', textContent: `${r.spins} 回` });
    const t = document.createElement('table');
    t.className = 'table';
    table(t, [['結果'], ['回数', 'num']], r.results.map((x) => [[x.label, 'name'], [fmtNum(x.count), 'num']]), '');
    wrap.append(h, hint, t);
    box.append(wrap);
  }

  table(
    $('timelineTable'),
    [['時間'], ['コイン', 'num'], ['ギフト', 'num'], ['いいね', 'num'], ['フォロー', 'num'], ['コメント', 'num'], ['視聴者', 'num']],
    full.timeline.map((m) => [[minuteLabel(m.t)], ...['coins', 'gifts', 'likes', 'follows', 'comments', 'viewers'].map((k) => [fmtNum(m[k]), 'num'])]),
    '記録がありません',
  );
}

async function open(id) {
  current = id;
  store.set('history-current', id);
  renderList();
  let full;
  try {
    full = await api(`/api/history/${encodeURIComponent(id)}`);
  } catch {
    return;
  }
  const summary = sessions.find((s) => s.id === id) ?? full;
  renderSummary({ ...full, live: summary.live }, previousOf(summary));
  renderCharts(full);
  renderTables(full);
}

async function load() {
  sessions = await api('/api/history');
  const want = store.get('history-current');
  const rows = visible();
  const pick = rows.find((s) => s.id === current) ?? rows.find((s) => s.id === want) ?? rows[0];
  renderList();
  if (pick) await open(pick.id);
}

for (const b of $('sessionFilter').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    showDemo = b.dataset.demo === '1';
    store.set('history-demo', showDemo);
    current = null;
    load();
  });
}

$('deleteBtn').addEventListener('click', async () => {
  if (!current || !confirm('この配信の記録を消します。元に戻せません。よろしいですか？')) return;
  await api(`/api/history/${encodeURIComponent(current)}`, undefined, 'DELETE');
  current = null;
  store.set('history-current', null);
  load();
});

await ensureGiftNames();
me = await api('/api/me').catch(() => me);
const historyName = me.mode === 'tenant' ? (me.name || me.tiktokId || '配信者') : (me.tiktokId || '配信');
$('brandTitle').textContent = `${historyName} の統計`;
document.title = `${historyName} の統計`;
const env = await api('/api/env').catch(() => ({ dev: false }));
// 開発では、まだ選んでいなければテスト送信（デモ記録）を最初から出す。ボタンの選択は renderList が付ける。
if (env.dev && store.get('history-demo', null) === null) showDemo = true;
await load();
// 配信中の記録は少しずつ増えるので、表示中なら読み直す。
// 開発では、まだ選んでいないときも短い間隔で読み直し、最初のテスト送信をリロードなしで出す。
setInterval(() => {
  const live = Boolean(sessions.find((s) => s.id === current)?.live);
  if (live || (env.dev && current == null)) load();
}, env.dev ? 5_000 : 30_000);

// WebSocket が通らない環境（プロキシ・古い内蔵ブラウザ）でも接続の状態を出す。
// 出した時点より新しい受信がある返事は捨て、遅れた idle で live を戻さない。
const statusGate = createStatusGate();
const showStatus = (status) => {
  if (!status) return;
  $('status').dataset.mode = status.mode;
  $('statusText').textContent = statusText(status);
};
const pollStatus = () => {
  const ticket = statusGate.startPoll();
  api('/api/status').then((s) => {
    if (!statusGate.acceptPoll(ticket)) return;
    showStatus(s.status);
  }).catch(() => {});
};
pollStatus();
setInterval(pollStatus, 5000);

connect({
  hello(status) {
    statusGate.markReceived();
    showStatus(status);
  },
  status(status) {
    statusGate.markReceived();
    showStatus(status);
    setTimeout(load, 500); // 配信の始まり・終わりで一覧が変わる
  },
});
