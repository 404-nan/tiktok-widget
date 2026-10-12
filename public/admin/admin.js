// 管理画面: 契約している配信者の追加・URL の発行・ウィジェットごとの ON / OFF（ずっと・時間指定・全員まとめて・選んだ人にまとめて）。
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
  if (h * 60 < 59.5) return `あと${Math.max(1, Math.round(h * 60))}分`;
  if (h < 48) return `あと${Math.round(h)}時間`;
  return `あと${Math.round(h / 24)}日`;
};
// 4つの点（豪華な演出）: 緑 = ずっと使える、黄 = 時間つきで使える、輪 = 使えない
const dotClass = (st) => (!st?.on ? '' : st.until == null ? 'on' : 'temp');
const onText = (st) => (st?.on ? '使える' : '使えない');

// 時間のプルダウン（0 はずっと）
const DURATIONS = [[0, 'ずっと'], [1, '1時間'], [3, '3時間'], [6, '6時間'], [12, '12時間'], [24, '24時間'], [72, '3日'], [168, '7日']];

// その画面で決めた設定か（配信者の画面ならその人の、全員の画面なら全員の）
const own = (st, where) => (where === 'tenant' ? st.source === 'own' : st.source === 'everyone');

/**
 * ウィジェット1つ分の行: 名前と今の状態 / ON・OFF のスイッチ / 時間のプルダウン / 初めに戻す。
 * st: 今の状態 { on, until, source }（null なら「まとめて」用に ON・OFF のボタンを出す）
 * apply(on, hours): on は true / false / null（初めに戻す）
 * where: 'tenant' | 'global'（状態の書き方が変わる）
 */
function accessRow(key, st, apply, { where = 'tenant', note = '' } = {}) {
  const f = data.features[key] ?? (key === 'premium' ? { label: '豪華な演出をまとめて', premium: true } : { label: key });
  const select = el('select', { className: 'dur', title: 'ON / OFF にする長さ（過ぎたら初めの状態に戻る）' });
  if (st?.until) select.append(new Option(left(st.until), 'keep'));
  for (const [h, text] of DURATIONS) select.append(new Option(text, String(h)));
  const hours = () => (select.value === 'keep' ? Math.max(0.02, (st.until - Date.now()) / 3600_000) : Number(select.value));

  // 状態の文: 「使える・この人だけ」「使えない・あと3時間で戻る」「使える・全員の設定」「使えない・初め」
  let detail = '';
  if (st) {
    if (own(st, where)) detail = st.until ? `${left(st.until)}で戻る` : where === 'tenant' ? 'この人だけ' : '全員';
    else detail = st.source === 'everyone' ? '全員の設定' : '初め';
  }
  const label = el(
    'div',
    { className: 'a-name' },
    el('span', { className: 'gname', textContent: f.label }),
    note ? el('span', { className: 'tag soft', textContent: note }) : null,
    st ? el('span', { className: `state ${st.on ? (st.until ? 'temp' : 'on') : ''}`, textContent: `${onText(st)}・${detail}` }) : null,
  );

  let control;
  if (st) {
    control = el('button', { type: 'button', className: 'switch pressable' });
    control.setAttribute('role', 'switch');
    control.setAttribute('aria-checked', String(st.on));
    control.setAttribute('aria-label', `${f.label}を${st.on ? '使えなく' : '使えるように'}する`);
    control.addEventListener('click', apply(!st.on, () => hours()));
    // 時間だけ変えたとき: 自分で決めた ON / OFF があれば、その長さで付け直す（なければ次にスイッチを押すときの長さ）
    if (own(st, where)) select.addEventListener('change', apply(st.on, () => hours()));
  } else {
    control = el('div', { className: 'onoff' }, button('ON', apply(true, () => hours())), button('OFF', apply(false, () => hours())));
  }
  const canReset = !st || own(st, where);
  const reset = button('↺', apply(null, () => 0));
  reset.title = where === 'tenant' ? 'この人の設定を消す（全員の設定か初めの状態に戻す）' : '全員の設定を消す（初めの状態に戻す）';
  reset.classList.add('reset');
  reset.disabled = !canReset;
  return el('div', { className: 'access' }, label, control, select, reset);
}

/** ウィジェットの行を「ウィジェット」と「豪華な演出」に分けて並べる */
function accessGroups(rowOf, extraPremium = null) {
  const keys = Object.keys(data.features);
  const normal = keys.filter((k) => !data.features[k].premium);
  const premium = keys.filter((k) => data.features[k].premium);
  return [
    el('div', { className: 'group' }, el('p', { className: 'sub', textContent: '豪華な演出（初めは使えない）' }), ...premium.map(rowOf), extraPremium),
    el('div', { className: 'group' }, el('p', { className: 'sub', textContent: 'ウィジェット（初めから使える）' }), ...normal.map(rowOf)),
  ];
}

// apply(on, hours) を、API を呼ぶ関数にする
const setter = (target, feature, done) => (on, hours) => act(() => api('/access', { target, feature, on, hours: hours() }, 'PUT'), done);

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

const premiumKeys = () => Object.keys(data.features).filter((k) => data.features[k].premium);
const premiumOn = (t) => premiumKeys().some((k) => t.access[k]?.on);

function renderKpis() {
  const box = $('kpis');
  box.querySelectorAll('.kpi').forEach((n) => n.remove());
  const ts = data.tenants;
  const items = [
    ['配信者', ts.length, 'users'],
    ['配信中', ts.filter((t) => t.status.mode === 'live').length, 'radio'],
    ['豪華な演出オン', ts.filter(premiumOn).length, 'sparkles'],
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
  ['premium', '豪華オン', (t) => premiumOn(t)],
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
  $('legend').replaceChildren(...premiumKeys().map((k) => el('span', { title: data.features[k].label, textContent: data.features[k].label.slice(0, 1) })));
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
        ...premiumKeys().map((k) => {
          const st = t.access[k];
          return el('i', { className: dotClass(st), title: `${data.features[k].label}: ${onText(st)}${st?.until ? `（${left(st.until)}）` : ''}` });
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
    el('p', { className: 'sub hint', textContent: 'ON / OFF はこの配信者だけに付きます。長さを選んでからスイッチを押すと、その時間が過ぎたら初めの状態に戻ります。↺ で全員の設定か初めの状態に戻します。' }),
    ...accessGroups((k) => accessRow(k, t.access[k], setter(t.id, k), { note: t.widgets.includes(k) ? '選んでいる' : '' })),
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
  const many = (feature) => (on, hours) => act(() => forEach((id) => api('/access', { target: id, feature, on, hours: hours() }, 'PUT')), `${ids.length} 人に反映しました`);
  return [
    el('div', { className: 'detail-head' }, el('h2', { textContent: `選んだ ${ids.length} 人にまとめて` }), el('p', { className: 'sub', textContent: names.join('・') })),
    el('p', { className: 'sub hint', textContent: '選んだ人それぞれに付けます。長さを選んでから ON か OFF を押してください。↺ でその人たちの設定を消します。' }),
    ...accessGroups(
      (k) => accessRow(k, null, many(k)),
      accessRow('premium', null, many('premium')),
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
      el('p', { className: 'sub', textContent: 'ここで決めた ON / OFF は全員に付きます（配信者ごとに決めた設定のほうが先）。配信者を選ぶと、その人の設定が開きます。' }),
    ),
    ...accessGroups(
      (k) => accessRow(k, data.global[k], setter('global', k), { where: 'global' }),
      accessRow('premium', null, setter('global', 'premium')),
    ),
    el(
      'div',
      { className: 'group' },
      button('配信者ごとの設定を全部消す', () => {
        if (!confirm('全員の「配信者ごとの ON / OFF」を消しますか？（全員まとめての設定はそのまま）')) return;
        act(() => api('/access', { target: 'everyone', feature: 'all', on: null }, 'PUT'), '配信者ごとの設定を全部消しました')();
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
