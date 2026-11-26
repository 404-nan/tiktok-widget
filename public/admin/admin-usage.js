// 管理画面の API 使用量ページ。Euler の公式の上限と、このサーバーが記録した回数を並べて見せる。
// 上限はアカウント全体の枠。配信者別の表は、どの配信で呼び出しが増えているかを見るための内訳。

import { el, button, api, message } from './admin-parts.js';

let _openTenant = () => {};
export function initUsage({ openTenant }) {
  _openTenant = openTenant;
}

const state = {
  range: '24h',
  summary: null,
  tenants: null,
  series: null,
  error: null,
  loading: false,
  selectedTenant: null,
  chartTenant: '',
  sortKey: 'today',
  sortAsc: false,
};

const fmtInt = (n) => Number(n ?? 0).toLocaleString('ja-JP');
const pctText = (n) => (n == null ? '—' : `${n}%`);
const dateFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
const fmtTime = (t) => {
  if (!t) return '—';
  const d = new Date(t);
  return dateFmt.format(d);
};
const resetText = (iso, day) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return day ? dateFmt.format(d) : timeFmt.format(d);
};
const opCount = (aggregate, op) => aggregate?.operations?.[op]?.total ?? 0;

function levelOf(percent) {
  if (percent == null) return '';
  if (percent >= 95) return 'danger';
  if (percent >= 80) return 'warning';
  return '';
}

function progress(percent, level = '') {
  const bar = el('div', { className: `usage-progress ${level}` });
  bar.append(el('i', { style: `width:${Math.max(0, Math.min(100, percent ?? 0))}%` }));
  return bar;
}

function metricCard(title, main, sub, percent = null, extra = null) {
  const level = levelOf(percent);
  return el(
    'article',
    { className: `usage-card ${level}` },
    el('div', { className: 'usage-card-head' }, el('h3', { textContent: title }), percent != null ? el('strong', { className: 'usage-percent', textContent: pctText(percent) }) : null),
    el('div', { className: 'usage-main', textContent: main }),
    percent != null ? progress(percent, level) : null,
    el('p', { className: 'hint', textContent: sub }),
    extra,
  );
}

function eulerCard(title, aggregate, dayWindow) {
  const limit = aggregate?.limit;
  const local = fmtInt(aggregate?.total);
  if (!limit) {
    return metricCard(title, `${local} 件`, '上限をまだ読めていません。下の「上限を更新」で読み直せます', null);
  }
  const main = `${fmtInt(limit.used)} / ${fmtInt(limit.max)}`;
  const sub = `残り ${fmtInt(limit.remaining)}・${resetText(limit.reset_at, dayWindow)}にリセット・このサーバーの記録 ${local} 件`;
  return metricCard(title, main, sub, limit.percent);
}

function aiCard(aggregate) {
  const sub = `入力 ${fmtInt(aggregate?.input)} token・出力 ${fmtInt(aggregate?.output)} token・キャッシュ読み ${fmtInt(aggregate?.cacheRead)} token`;
  return metricCard('AI 今日', `${fmtInt(aggregate?.total)} 回`, sub, null);
}

function alertsCard(alerts) {
  return el(
    'article',
    { className: `usage-card usage-alerts ${alerts?.some((a) => a.level === 'danger') ? 'danger' : alerts?.length ? 'warning' : ''}` },
    el('div', { className: 'usage-card-head' }, el('h3', { textContent: '注意' })),
    alerts?.length
      ? el('ul', { className: 'usage-alert-list' }, ...alerts.map((a) => el('li', { className: a.level, textContent: a.text })))
      : el('p', { className: 'hint', textContent: '今は注意はありません' }),
  );
}

function cards(summary) {
  return el(
    'section',
    { className: 'usage-cards', ariaLabel: 'API 使用量のまとめ' },
    eulerCard('Euler 今日', summary.services.euler.today, true),
    eulerCard('Euler この1時間', summary.services.euler.hour, false),
    aiCard(summary.services.ai.today),
    alertsCard(summary.alerts),
  );
}

function tenantValue(row, key) {
  if (key === 'name') return row.name ?? row.tenant;
  if (key === 'today') return row.today.total;
  if (key === 'hour') return row.hour.total;
  if (key === 'connect' || key === 'signature' || key === 'roomId' || key === 'gifts') return opCount(row.today, key);
  if (key === 'failed') return row.today.failed;
  if (key === 'lastAt') return row.today.lastAt ?? 0;
  return row.range.total;
}

function tenantDetail(row) {
  const ops = ['connect', 'signature', 'roomId', 'gifts'];
  return el(
    'div',
    { className: 'usage-tenant-detail' },
    el('strong', { textContent: `${row.name ?? row.tenant} の内訳` }),
    el('div', { className: 'usage-op-grid' }, ...ops.map((op) => el('span', { textContent: `${op}: 今日 ${fmtInt(opCount(row.today, op))}・期間 ${fmtInt(opCount(row.range, op))}` }))),
    el('p', { className: 'hint', textContent: `失敗: 今日 ${fmtInt(row.today.failed)} 件・期間 ${fmtInt(row.range.failed)} 件。最後の呼び出し: ${fmtTime(row.range.lastAt)}` }),
    el('div', { className: 'btn-row' }, button('配信者の設定を開く', () => _openTenant(row.tenant))),
  );
}

function tenantTable(rows) {
  const sorted = [...rows].sort((a, b) => {
    const av = tenantValue(a, state.sortKey);
    const bv = tenantValue(b, state.sortKey);
    const cmp = typeof av === 'string' ? String(av).localeCompare(String(bv), 'ja') : av - bv;
    return state.sortAsc ? cmp : -cmp;
  });
  const table = el('table', { className: 'usage-table' });
  const head = el('tr');
  for (const [key, label] of [
    ['name', '配信者'], ['today', '今日'], ['hour', '1時間'], ['connect', 'connect'], ['signature', 'signature'], ['roomId', 'roomId'], ['gifts', 'gifts'], ['failed', '失敗'], ['lastAt', '最後の呼び出し'],
  ]) {
    const th = el('th');
    const b = button(label, () => {
      if (state.sortKey === key) state.sortAsc = !state.sortAsc;
      else { state.sortKey = key; state.sortAsc = key === 'name'; }
      const page = table.closest('.usage-page');
      if (page) render(page);
    });
    if (state.sortKey === key) b.append(state.sortAsc ? ' ↑' : ' ↓');
    th.append(b);
    head.append(th);
  }
  table.append(el('thead', {}, head));
  const body = el('tbody');
  for (const row of sorted) {
    const tr = el('tr', { className: state.selectedTenant === row.tenant ? 'selected' : '' });
    const statusText = row.enabled === false ? '停止中' : row.statusMode === 'live' ? '配信中' : row.statusMode === 'connecting' ? 'つないでいます' : '待機中';
    const meta = [row.tiktokId ? `@${row.tiktokId}` : row.tenant, statusText, row.planLabel || null].filter(Boolean).join('・');
    const name = el('td', {}, el('strong', { textContent: row.name ?? row.tenant }), el('span', { className: 'tenant-note', textContent: meta }));
    for (const cell of [
      name,
      el('td', { textContent: fmtInt(row.today.total) }),
      el('td', { textContent: fmtInt(row.hour.total) }),
      el('td', { textContent: fmtInt(opCount(row.today, 'connect')) }),
      el('td', { textContent: fmtInt(opCount(row.today, 'signature')) }),
      el('td', { textContent: fmtInt(opCount(row.today, 'roomId')) }),
      el('td', { textContent: fmtInt(opCount(row.today, 'gifts')) }),
      el('td', { className: row.today.failed ? 'bad' : '', textContent: fmtInt(row.today.failed) }),
      el('td', { textContent: fmtTime(row.range.lastAt) }),
    ]) tr.append(cell);
    tr.addEventListener('click', () => {
      state.selectedTenant = state.selectedTenant === row.tenant ? null : row.tenant;
      const page = table.closest('.usage-page');
      if (page) render(page);
    });
    body.append(tr);
    if (state.selectedTenant === row.tenant) {
      const detail = el('tr', { className: 'detail-row' });
      const td = el('td', { colSpan: 9 }, tenantDetail(row));
      detail.append(td);
      body.append(detail);
    }
  }
  table.append(body);
  return el('div', { className: 'usage-table-wrap' }, table);
}

function chart(points, granularity) {
  if (!points?.length) return el('p', { className: 'hint', textContent: 'まだ記録がありません' });
  const max = Math.max(1, ...points.map((p) => p.total));
  const bars = el('div', { className: 'usage-chart', role: 'img', ariaLabel: '時間ごとの API 呼び出し数。赤い部分は失敗です' });
  for (const point of points) {
    const okHeight = (point.ok / max) * 100;
    const badHeight = (point.failed / max) * 100;
    const bar = el('div', { className: 'usage-bar', title: `${fmtTime(point.start)}: ${fmtInt(point.total)} 件（失敗 ${fmtInt(point.failed)}）` });
    bar.append(el('i', { className: 'bad', style: `height:${badHeight}%` }), el('i', { className: 'good', style: `height:${okHeight}%` }));
    bars.append(bar);
  }
  const first = points[0]?.start;
  const last = points.at(-1)?.start;
  const label = granularity === 'day'
    ? `${dateFmt.format(new Date(first))} から ${dateFmt.format(new Date(last))} まで`
    : '直近24時間（1時間ごと）';
  return el('div', { className: 'usage-chart-wrap' }, bars, el('p', { className: 'hint', textContent: `${label}。緑は成功、赤は失敗です` }));
}

function render(root) {
  if (!root.isConnected && !root.classList.contains('usage-page')) return;
  root.replaceChildren();
  if (state.error) {
    root.append(el('p', { className: 'form-message error', textContent: state.error }));
  }
  if (!state.summary) {
    root.append(el('p', { className: 'hint', textContent: state.loading ? '使用量を読んでいます…' : 'まだ読めていません' }));
    return;
  }
  const refresh = button('上限を更新', async () => {
    try {
      await api('/usage/euler/refresh', {}, 'POST');
      message('Euler の上限を読み直しました');
    } catch (err) {
      message(err.message, true);
    }
    await loadUsage(root);
  });
  const range = el('select', { className: 'usage-range', ariaLabel: 'グラフの期間' });
  for (const [value, label] of [['24h', '24時間'], ['7d', '7日'], ['30d', '30日']]) range.append(new Option(label, value));
  range.value = state.range;
  range.addEventListener('change', () => {
    state.range = range.value;
    loadUsage(root);
  });
  const fetched = state.summary.limits?.fetchedAt ? fmtTime(state.summary.limits.fetchedAt) : 'まだ';
  root.append(
    el('div', { className: 'usage-toolbar' }, el('p', { className: 'hint', textContent: `Euler の上限はアカウント全体の枠です（配信者ごとの枠ではありません）。上限を読んだ時刻: ${fetched}` }), el('div', { className: 'usage-actions' }, range, refresh)),
    cards(state.summary),
  );
  if (state.summary.limits?.error) {
    const limitError = state.summary.limits.available
      ? `上限は前回の値を表示しています。読み直しに失敗: ${state.summary.limits.error.message}`
      : `上限を読めていません: ${state.summary.limits.error.message}`;
    root.append(el('p', { className: 'form-message error', textContent: limitError }));
  }
  const tenantFilter = el('select', { className: 'usage-range', ariaLabel: 'グラフに出す配信者' });
  tenantFilter.append(new Option('全員', ''));
  for (const row of state.tenants?.tenants ?? []) tenantFilter.append(new Option(row.name ?? row.tenant, row.tenant));
  tenantFilter.value = state.chartTenant;
  tenantFilter.addEventListener('change', () => {
    state.chartTenant = tenantFilter.value;
    loadUsage(root);
  });
  root.append(
    el('section', { className: 'usage-panel' },
      el('div', { className: 'usage-panel-head' }, el('h3', { textContent: '時間ごとの呼び出し' }), tenantFilter),
      state.series ? chart(state.series.points, state.series.granularity) : el('p', { className: 'hint', textContent: '読んでいます…' }),
      el('p', { className: 'hint', textContent: 'connect は配信接続、signature は署名、roomId は配信前確認、gifts はギフト一覧です。signature が多いときは接続し直しが多い可能性があります。' })),
    el('section', { className: 'usage-panel' }, el('h3', { textContent: '配信者別' }), state.tenants?.tenants?.length ? tenantTable(state.tenants.tenants) : el('p', { className: 'hint', textContent: 'まだ配信者別の記録がありません' })),
  );
}

async function loadUsage(root) {
  state.loading = true;
  if (!state.summary) render(root);
  try {
    const [summary, tenants, series] = await Promise.all([
      api('/usage/summary?range=7d'),
      api('/usage/tenants?service=euler&range=7d'),
      api(`/usage/timeseries?service=euler&range=${state.range}${state.chartTenant ? `&tenant=${encodeURIComponent(state.chartTenant)}` : ''}`),
    ]);
    state.summary = summary;
    state.tenants = tenants;
    state.series = series;
    state.error = null;
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loading = false;
    if (root.isConnected) render(root);
  }
}

export function usageDetail() {
  const body = el('div', { className: 'usage-page' });
  render(body);
  queueMicrotask(() => loadUsage(body));
  return [
    el('div', { className: 'detail-head' },
      el('h2', { textContent: 'API 使用量' }),
      el('p', { className: 'sub', textContent: 'Euler Stream と AI の呼び出し回数、上限までの割合、配信者ごとの内訳を見ます。' })),
    body,
  ];
}
