// 管理画面: 契約している配信者の追加・URL の発行・豪華な演出のオン/オフ（ずっと・時間指定・全員まとめて・選んだ人にまとめて）。
// 配信者が増えても伸びないよう、左に1人1行の一覧、右に「選んだ1人 / 選んだ何人か / 全員まとめて」の設定を出す。
// API は /admin/api/...（合言葉を x-admin-token で送る）

import { icon } from '/widgets/lib/overlay.js';
import { $, store, setupPanels, setupTheme } from '/dashboard/common.js';

setupPanels();
setupTheme();

let token = store.get('adminToken', '');
let data = null; // GET /admin/api/tenants
let selected = null; // 右に開いている配信者の id
const checked = new Set(); // 一覧でチェックした配信者の id
let filter = store.get('adminFilter', 'all');
let search = '';

// 右のパネルは中身だけ入れ替える（なめらかな角の塗りを残すため）
const detailBody = document.createElement('div');
detailBody.className = 'detail-body';
$('detail').append(detailBody);
Object.assign(detailBody.style, { display: 'grid', gap: '16px' });

async function api(path, body, method) {
  const res = await fetch(`/admin/api${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', 'x-admin-token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showLogin('合言葉が違います');
    throw new Error(json.error);
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function message(text, error = false) {
  const el = $('message');
  el.textContent = text;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(message.t);
  message.t = setTimeout(() => el.classList.remove('show'), 3200);
}

// 失敗したら知らせ、成功したら読み直す
const act = (fn, done) => async () => {
  try {
    await fn();
    await load();
    if (done) message(done);
  } catch (err) {
    message(err.message, true);
  }
};

// --- 合言葉 ---

function showLogin(text = '') {
  $('loginPanel').hidden = false;
  $('main').hidden = true;
  $('logoutBtn').hidden = true;
  $('loginMessage').textContent = text;
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = $('tokenInput').value.trim();
  store.set('adminToken', token);
  await load();
});
$('logoutBtn').addEventListener('click', () => {
  store.set('adminToken', '');
  token = '';
  showLogin();
});

// --- 部品 ---

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null && c !== false));
  return n;
};
const button = (text, onClick, { cls = 'chip', iconName = null } = {}) => {
  const b = el('button', { type: 'button', className: `${cls} pressable` }, iconName ? icon(iconName) : null, text);
  b.addEventListener('click', onClick);
  return b;
};

const left = (until) => {
  const h = (until - Date.now()) / 3600_000;
  if (h <= 0) return 'まもなく終わり';
  if (h < 1) return `あと${Math.max(1, Math.round(h * 60))}分`;
  if (h < 48) return `あと${Math.round(h)}時間`;
  return `あと${Math.round(h / 24)}日`;
};
const stateText = (st) => (!st?.active ? 'オフ' : st.until == null ? 'ずっとオン' : `オン（${left(st.until)}）`);
const stateClass = (st) => (!st?.active ? '' : st.until == null ? 'on' : 'temp');

/**
 * 豪華な演出1つ分の行。set(mode, hours) で変える。st は今の状態（null なら状態を出さない）
 */
function grantRow(label, st, set, note = '') {
  // 好きな時間: 数を入れて Enter
  const hours = el('input', { type: 'number', min: '1', step: '1', placeholder: '○時間', className: 'hours', title: '時間を入れて Enter で、その時間だけオン' });
  hours.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (Number(hours.value) > 0) set('for', Number(hours.value))();
    else message('何時間か入れてください', true);
  });
  const chip = (text, mode, h, on) => {
    const b = button(text, set(mode, h));
    if (on) b.classList.add('on');
    return b;
  };
  return el(
    'div',
    { className: 'grant' },
    el(
      'div',
      { className: 'grant-top' },
      el('span', { className: 'gname', textContent: label }),
      st !== null ? el('span', { className: `state ${stateClass(st)}`, textContent: stateText(st) + note }) : null,
    ),
    el(
      'div',
      { className: 'btns' },
      chip('オフ', 'off', 0, st && !st.active),
      chip('1時間', 'for', 1),
      chip('3時間', 'for', 3),
      chip('24時間', 'for', 24),
      chip('ずっと', 'on', 0, st?.active && st.until == null),
      hours,
    ),
  );
}

function copyField(label, url) {
  const input = el('input', { value: url, readOnly: true });
  const b = button('コピー', async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    message(`${label}の URL をコピーしました`);
  }, { iconName: 'copy' });
  return el('div', { className: 'group-item' }, el('span', { className: 'url-label', textContent: label }), el('div', { className: 'url' }, input, b));
}

// --- 人数 ---

function renderKpis() {
  const box = $('kpis');
  box.querySelectorAll('.kpi').forEach((n) => n.remove());
  const ts = data.tenants;
  const items = [
    ['配信者', ts.length, 'users'],
    ['配信中', ts.filter((t) => t.status.mode === 'live').length, 'radio'],
    ['豪華な演出オン', ts.filter((t) => Object.values(t.premium).some((p) => p.active)).length, 'sparkles'],
    ['止めている', ts.filter((t) => !t.enabled).length, 'circle-pause'],
  ];
  for (const [label, value, iconName] of items) {
    box.append(el('div', { className: 'kpi' }, el('div', { className: 'kpi-label' }, icon(iconName), label), el('div', { className: 'kpi-value', textContent: String(value) })));
  }
}

// --- 一覧 ---

const FILTERS = [
  ['all', 'すべて', () => true],
  ['live', '配信中', (t) => t.status.mode === 'live'],
  ['premium', '豪華オン', (t) => Object.values(t.premium).some((p) => p.active)],
  ['off', '止めている', (t) => !t.enabled],
];

function visible() {
  const f = FILTERS.find(([k]) => k === filter)?.[2] ?? (() => true);
  const q = search.trim().toLowerCase();
  return data.tenants
    .filter((t) => f(t) && (!q || t.name.toLowerCase().includes(q)))
    // 配信中を上に、あとは名前順
    .sort((a, b) => (b.status.mode === 'live') - (a.status.mode === 'live') || a.name.localeCompare(b.name, 'ja'));
}

function renderFilters() {
  const box = $('filters');
  box.replaceChildren(
    ...FILTERS.map(([k, label]) => {
      const b = el('button', { type: 'button', className: 'pressable', textContent: label });
      b.setAttribute('aria-selected', String(k === filter));
      b.addEventListener('click', () => {
        filter = k;
        store.set('adminFilter', k);
        renderFilters();
        renderRows();
      });
      return b;
    }),
  );
}

function statusOf(t) {
  if (!t.enabled) return ['off', '止めている'];
  if (t.status.mode === 'live') return ['live', `LIVE · @${t.status.username}`];
  if (t.status.mode === 'demo') return ['demo', 'デモ中'];
  return ['', '配信していません'];
}

function renderRows() {
  const list = visible();
  const box = $('rows');
  $('legend').replaceChildren(...Object.values(data.premiumLabels).map((label) => el('span', { title: label, textContent: label.slice(0, 1) })));
  box.replaceChildren(
    ...list.map((t) => {
      const [cls, text] = statusOf(t);
      const check = el('input', { type: 'checkbox', checked: checked.has(t.id) });
      check.setAttribute('aria-label', `${t.name} を選ぶ`);
      check.addEventListener('click', (e) => e.stopPropagation());
      check.addEventListener('change', () => {
        if (check.checked) checked.add(t.id);
        else checked.delete(t.id);
        renderDetail();
        syncCheckAll();
      });
      const dots = el(
        'span',
        { className: 'dots' },
        ...Object.entries(data.premiumLabels).map(([f, label]) => {
          const st = t.premium[f];
          return el('i', { className: stateClass(st), title: `${label}: ${stateText(st)}` });
        }),
      );
      const li = el(
        'li',
        { className: t.enabled ? '' : 'off' },
        el('label', { className: 'check' }, check),
        el('span', { className: 'name', textContent: t.name }),
        el('span', { className: `status ${cls}` }, el('i'), text),
        dots,
      );
      li.setAttribute('aria-selected', String(t.id === selected));
      li.addEventListener('click', () => {
        selected = selected === t.id ? null : t.id;
        renderRows();
        renderDetail();
      });
      return li;
    }),
  );
  const empty = $('empty');
  empty.hidden = list.length > 0;
  empty.textContent = data.tenants.length ? '当てはまる配信者はいません。' : 'まだ配信者がいません。「＋ 追加」から追加してください。';
  syncCheckAll();
}

function syncCheckAll() {
  const ids = visible().map((t) => t.id);
  const all = $('checkAll');
  const n = ids.filter((id) => checked.has(id)).length;
  all.checked = ids.length > 0 && n === ids.length;
  all.indeterminate = n > 0 && n < ids.length;
}

$('checkAll').addEventListener('change', (e) => {
  for (const t of visible()) {
    if (e.target.checked) checked.add(t.id);
    else checked.delete(t.id);
  }
  renderRows();
  renderDetail();
});
$('search').addEventListener('input', (e) => {
  search = e.target.value;
  renderRows();
});

// --- 右: 選んだ1人 ---

function tenantDetail(t) {
  const [cls, text] = statusOf(t);
  const name = el('input', { className: 'name-input', value: t.name });
  name.setAttribute('aria-label', '名前');
  name.addEventListener('change', act(() => api(`/tenants/${t.id}`, { name: name.value }, 'PATCH'), '名前を変えました'));
  const enabled = el('input', { type: 'checkbox', checked: t.enabled });
  enabled.addEventListener('change', act(() => api(`/tenants/${t.id}`, { enabled: enabled.checked }, 'PATCH'), enabled.checked ? '使えるようにしました' : '利用を止めました'));

  const picks = el('div', { className: 'picks' });
  for (const [s, title] of Object.entries(data.sections)) {
    const on = t.widgets.includes(s);
    const b = el('button', { type: 'button', className: 'pick pressable' }, on ? icon('check') : null, title);
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', act(() => api(`/tenants/${t.id}`, { widgets: on ? t.widgets.filter((w) => w !== s) : [...t.widgets, s] }, 'PATCH')));
    picks.append(b);
  }

  return [
    el(
      'div',
      { className: 'detail-head' },
      name,
      el('div', { className: 'row' }, el('span', { className: `status ${cls}` }, el('i'), text), el('label', { className: 'row' }, enabled, '使える')),
    ),
    el(
      'div',
      { className: 'group' },
      el('p', { className: 'sub', textContent: 'URL（ダッシュボードは配信者だけに渡す。OBS の URL は配信者のダッシュボードに出ます）' }),
      copyField('ダッシュボード', t.urls.dashboard),
      copyField('モニター', t.urls.monitor),
    ),
    el(
      'div',
      { className: 'group' },
      el('p', { className: 'sub', textContent: '豪華な演出（この配信者だけ）' }),
      ...Object.entries(data.premiumLabels).map(([f, label]) => {
        const st = t.premium[f];
        const own = st.own ? { active: true, until: st.own.until } : { active: false };
        const note = st.everyone && !st.own ? '・全員のオンで使えています' : '';
        return grantRow(label, own, (mode, hours) => act(() => api('/premium', { target: t.id, feature: f, mode, hours }, 'PUT')), note);
      }),
    ),
    el('div', { className: 'group' }, el('p', { className: 'sub', textContent: '使うウィジェット（配信者もダッシュボードで選べます）' }), picks),
    el(
      'div',
      { className: 'group' },
      el(
        'div',
        { className: 'danger' },
        button('URL を作り直す', () => {
          if (!confirm(`${t.name} の URL を作り直しますか？ 今の URL（ダッシュボードと OBS）は使えなくなります。`)) return;
          act(() => api(`/tenants/${t.id}/rekey`, { which: 'both' }), '作り直しました。新しい URL を渡してください')();
        }, { iconName: 'key-round' }),
        button('削除', () => {
          if (!confirm(`${t.name} を削除しますか？（設定と記録のファイルは data/tenants/${t.id}/ に残ります）`)) return;
          selected = null;
          act(() => api(`/tenants/${t.id}`, undefined, 'DELETE'), '削除しました')();
        }, { iconName: 'trash-2' }),
        button('閉じる', () => {
          selected = null;
          renderRows();
          renderDetail();
        }),
      ),
    ),
  ];
}

// --- 右: 選んだ何人かにまとめて ---

function bulkDetail(ids) {
  const names = data.tenants.filter((t) => ids.includes(t.id)).map((t) => t.name);
  const forEach = (fn) => Promise.all(ids.map(fn));
  return [
    el('div', { className: 'detail-head' }, el('h2', { textContent: `選んだ ${ids.length} 人にまとめて` }), el('p', { className: 'sub', textContent: names.join('・') })),
    el(
      'div',
      { className: 'group' },
      el('p', { className: 'sub', textContent: '豪華な演出（選んだ人それぞれに付けます）' }),
      ...[...Object.entries(data.premiumLabels), ['all', '全部まとめて']].map(([f, label]) =>
        grantRow(label, null, (mode, hours) => act(() => forEach((id) => api('/premium', { target: id, feature: f, mode, hours }, 'PUT')), `${ids.length} 人に反映しました`)),
      ),
    ),
    el(
      'div',
      { className: 'group' },
      el(
        'div',
        { className: 'danger' },
        button('使えるようにする', act(() => forEach((id) => api(`/tenants/${id}`, { enabled: true }, 'PATCH')), '使えるようにしました')),
        button('利用を止める', () => {
          if (!confirm(`${ids.length} 人の利用を止めますか？`)) return;
          act(() => forEach((id) => api(`/tenants/${id}`, { enabled: false }, 'PATCH')), '利用を止めました')();
        }),
        button('選ぶのをやめる', () => {
          checked.clear();
          renderRows();
          renderDetail();
        }),
      ),
    ),
  ];
}

// --- 右: 全員まとめて（何も選んでいないとき） ---

function globalDetail() {
  return [
    el(
      'div',
      { className: 'detail-head' },
      el('h2', { textContent: '全員まとめて' }),
      el('p', { className: 'sub', textContent: 'ここでオンにすると、配信者ごとの設定に関係なく全員が使えます。配信者を選ぶと、その人の設定が開きます。' }),
    ),
    el(
      'div',
      { className: 'group' },
      ...Object.entries(data.premiumLabels).map(([f, label]) =>
        grantRow(label, data.global[f], (mode, hours) => act(() => api('/premium', { target: 'global', feature: f, mode, hours }, 'PUT'))),
      ),
      grantRow('全部まとめて', null, (mode, hours) => act(() => api('/premium', { target: 'global', feature: 'all', mode, hours }, 'PUT'))),
    ),
    el(
      'div',
      { className: 'group' },
      button('全員の個別のオンを消す', () => {
        if (!confirm('全員の「配信者ごとのオン」を消しますか？（全員まとめてのオンはそのまま）')) return;
        act(() => api('/premium', { target: 'everyone', feature: 'all', mode: 'off' }, 'PUT'), '全員の個別のオンを消しました')();
      }),
    ),
  ];
}

function renderDetail() {
  // 名前などを打っている最中は作り直さない
  if (detailBody.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox])')) return;
  const ids = [...checked].filter((id) => data.tenants.some((t) => t.id === id));
  const t = data.tenants.find((x) => x.id === selected);
  if (ids.length >= 2) detailBody.replaceChildren(...bulkDetail(ids));
  else if (t) detailBody.replaceChildren(...tenantDetail(t));
  else {
    selected = null;
    detailBody.replaceChildren(...globalDetail());
  }
}

// --- 読み込み ---

async function load() {
  try {
    data = await api('/tenants');
  } catch {
    return;
  }
  $('loginPanel').hidden = true;
  $('main').hidden = false;
  $('logoutBtn').hidden = false;
  for (const id of [...checked]) if (!data.tenants.some((t) => t.id === id)) checked.delete(id);
  renderKpis();
  renderFilters();
  renderRows();
  renderDetail();
}

// 追加
const toggleAdd = (open) => {
  $('createForm').hidden = !open;
  if (open) $('newName').focus();
};
$('addBtn').addEventListener('click', () => toggleAdd($('createForm').hidden));
$('addCancel').addEventListener('click', () => toggleAdd(false));
$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { tenant } = await api('/tenants', { name: $('newName').value });
    $('newName').value = '';
    toggleAdd(false);
    selected = tenant.id;
    checked.clear();
    await load();
    message(`${tenant.name} を追加しました。ダッシュボードの URL を渡してください`);
  } catch (err) {
    message(err.message, true);
  }
});

// 配信中かどうか・残り時間を新しくする
setInterval(() => data && !$('main').hidden && load(), 20_000);

if (token) load();
else showLogin();
