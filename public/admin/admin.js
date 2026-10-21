// 管理画面: 契約している配信者の追加・URL の発行・ウィジェットごとの ON / OFF（ずっと・時間指定・全員まとめて・選んだ人にまとめて）。
// 配信者が増えても伸びないよう、左に1人1行の一覧、右に「選んだ1人 / 選んだ何人か / 全員まとめて」の設定を出す。
// API は /admin/api/...（合言葉を x-admin-token で送る）

import { icon } from '/widgets/lib/overlay.js';
import { $, store, setupPanels, setupTheme, copyText } from '/dashboard/common.js';

setupPanels();
setupTheme();

let token = store.get('adminToken', '');
let data = null; // GET /admin/api/tenants
let selected = null; // 右に開いている配信者の id
const checked = new Set(); // 一覧でチェックした配信者の id
let filter = store.get('adminFilter', 'all');
let search = '';
let page = store.get('adminPage', 'tenants');

// 右のパネルは中身だけ入れ替える（なめらかな角の塗りを残すため）
const detailBody = document.createElement('div');
detailBody.className = 'detail-body';
$('detail').append(detailBody);

// カードを縦に並べるページ（見出しはカードの外、中の項目は線で区切った行）
const CARD_PAGES = ['lul', 'notes', 'keys', 'billing', 'ai-tokens'];

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

$('sideLogoutBtn').addEventListener('click', () => $('logoutBtn').click());
$('sideThemeBtn').addEventListener('click', () => $('themeBtn').click());
document.querySelectorAll('.admin-side .side-item[data-page]').forEach((b) => b.addEventListener('click', () => {
  page = b.dataset.page;
  store.set('adminPage', page);
  if (page !== 'tenants') {
    selected = null;
    checked.clear();
  }
  renderShell();
  renderDetail(true);
}));

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
  const b = button('コピー', () => {
    copyText(url, input);
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

const TEMPLATE_NAMES = {
  talk: 'おしゃべり・歌', roulette: 'ルーレット企画',
  clear: 'クリア数', boss: 'ボス討伐', custom: '自分で選ぶ',
  bougai: '妨害マイクラ', bakkin: '罰ゲーム雑談',
  endurance: '耐久・目標配信',
};

function tenantNote(t) {
  const notes = [];
  if (t.template) notes.push(TEMPLATE_NAMES[t.template] ?? t.template);
  if (t.rental?.now) notes.push('いまマイクラの枠');
  return notes.join('・') || '遊び方は未選択';
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
        el('span', { className: `status ${cls}` }, el('i'), text, el('small', { className: 'tenant-note', textContent: tenantNote(t) })),
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
    button('← 配信者の一覧', () => {
      selected = null;
      renderRows();
      renderDetail();
    }, { cls: 'chip back-button' }),
    el(
      'div',
      { className: 'detail-head' },
      name,
      el('div', { className: 'row' }, el('span', { className: `status ${cls}` }, el('i'), text), el('label', { className: 'row' }, enabled, '使える')),
    ),
    el('div', { className: 'group' },
      el('label', { className: 'field' },
        el('span', { className: 'field-label', textContent: 'TikTok の ID' }),
        (() => { const input = el('input', { value: t.tiktokId ?? '', placeholder: '例: username' }); input.addEventListener('change', act(() => api(`/tenants/${t.id}`, { tiktokId: input.value }, 'PATCH'), 'TikTok の ID を保存しました')); return input; })(),
      ),
    ),
    el(
      'div',
      { className: 'group' },
      el('p', { className: 'sub', textContent: '配信者に渡す URL' }),
      copyField('短い URL', t.urls.short),
      el('div', { className: 'group-item' },
        el('span', { className: 'url-label', textContent: '4桁の数字' }),
        el('div', { className: 'url' },
          el('input', { value: t.pin ?? '', readOnly: true, className: 'pin-value' }),
          button('作り直す', () => {
            if (!confirm(`${t.name} の 4桁の数字を作り直しますか？ 今の数字で開いていたスマホ・PC は、新しい数字を入れ直すことになります。`)) return;
            act(() => api(`/tenants/${t.id}/repin`, {}), '作り直しました。新しい数字を渡してください')();
          }, { iconName: 'refresh-cw' }),
        ),
      ),
      el('p', { className: 'sub hint', textContent: '短い URL と 4桁の数字を渡すと、配信者は数字を入れて開けます（一度入れた端末は次から数字なし）。下の URL はそのまま開けます。' }),
      copyField('ダッシュボード', t.urls.dashboard),
      el('div', { className: 'monitor-url' }, copyField('モニター', t.urls.monitor)),
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
          if (!confirm(`${t.name} の URL を作り直しますか？ 鍵の入った今の URL（ダッシュボードと OBS）は使えなくなります。短い URL と 4桁の数字はそのまま使えます（OBS の URL は貼り直しです）。`)) return;
          act(() => api(`/tenants/${t.id}/rekey`, { which: 'both' }), '作り直しました。OBS の URL を貼り直してもらってください')();
        }, { iconName: 'key-round' }),
        button('削除', () => {
          if (!confirm(`${t.name} を削除しますか？（設定と記録のファイルは data/tenants/${t.id}/ に残ります）`)) return;
          selected = null;
          act(() => api(`/tenants/${t.id}`, undefined, 'DELETE'), '削除しました')();
        }, { iconName: 'trash-2' }),
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

// --- 右: TikTok につなぐための API キー（全員の接続で共通） ---

function signKeyGroup() {
  const st = data.signKey ?? { set: false };
  const from = st.source === 'env' ? 'サーバーの環境変数' : 'ここで入れたもの';
  const state = st.set ? `入っています（${from}${st.tail ? `・末尾 ${st.tail}` : ''}）` : '入っていません';
  const input = el('input', { type: 'password', autocomplete: 'off', placeholder: st.set ? '新しいキーに入れ替える' : 'API キー' });
  input.setAttribute('aria-label', 'TikTok につなぐための API キー');
  const save = () => {
    const key = input.value.trim();
    if (!key) return message('API キーを入れてください', true);
    input.value = '';
    act(() => api('/sign-key', { key }, 'PUT'), 'API キーを保存しました。次に接続するときから使います')();
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  const remove = button('消す', () => {
    if (!confirm('ここで入れた API キーを消しますか？')) return;
    act(() => api('/sign-key', { key: '' }, 'PUT'), 'API キーを消しました')();
  });
  return el(
    'div',
    { className: 'group' },
    el('p', { className: 'sub', textContent: 'TikTok につなぐための API キー' }),
    el('p', { className: `sub hint${st.set ? ' key-on' : ''}`, textContent: `${state}。全員の接続で共通に使います。つながりにくいときに入れてください。` }),
    el('div', { className: 'url' }, input, button('保存', save, { iconName: 'key-round' })),
    st.source === 'admin' ? el('div', { className: 'danger' }, remove) : null,
  );
}

// --- 右: 「AI にたのむ」の設定（どの AI を使うか・キー・モデル・1日の回数・追加の指示） ---

const AI_MODEL_LABELS = { 'claude-opus-5-5': 'Claude Opus 5.5（いちばん賢い）', 'claude-sonnet-5-5': 'Claude Sonnet 5.5（料金は半分くらい）', 'claude-haiku-4-5': 'Claude Haiku 4.5（いちばん安い）' };

function aiGroup() {
  const st = data.ai ?? { set: false, providers: [] };
  const put = (body, done) => act(() => api('/ai', body, 'PUT'), done);
  const item = (label, control) => el('label', { className: 'group-item' }, el('span', { className: 'url-label', textContent: label }), control);

  const provider = el('select');
  provider.setAttribute('aria-label', '使う AI');
  for (const p of st.providers ?? []) provider.append(new Option(p.label, p.id, false, p.id === st.provider));
  provider.addEventListener('change', () => put({ provider: provider.value }, '使う AI を変えました')());

  const from = st.source === 'env' ? 'サーバーの環境変数' : 'ここで入れたもの';
  const state = !st.set ? 'キーが入っていません（入れるまで、だれも使えません）' : st.ready ? `使えます（キー: ${from}${st.tail ? `・末尾 ${st.tail}` : ''}）` : 'キーは入っています。API の場所とモデルを入れると使えます';
  const key = el('input', { type: 'password', autocomplete: 'off', placeholder: st.set ? '新しいキーに入れ替える' : 'API のキー' });
  key.setAttribute('aria-label', 'AI の API キー');
  const saveKey = () => {
    if (!key.value.trim()) return message('キーを入れてください', true);
    const body = { key: key.value.trim() };
    key.value = '';
    put(body, 'AI のキーを保存しました')();
  };
  key.addEventListener('keydown', (e) => e.key === 'Enter' && saveKey());

  // モデル: Claude は選ぶ、ほかは名前を入れる
  let model;
  if (st.models) {
    model = el('select');
    for (const m of st.models) model.append(new Option(AI_MODEL_LABELS[m] ?? m, m, false, m === st.model));
  } else {
    model = el('input', { value: st.model ?? '', placeholder: 'モデルの名前' });
  }
  model.setAttribute('aria-label', 'AI のモデル');
  model.addEventListener('change', () => put({ model: model.value.trim() }, 'モデルを変えました')());

  const baseUrl = el('input', { value: st.baseUrl ?? '', placeholder: 'https://…/v1' });
  baseUrl.setAttribute('aria-label', 'API の場所');
  baseUrl.addEventListener('change', () => put({ baseUrl: baseUrl.value.trim() }, 'API の場所を変えました')());

  const limit = el('input', { type: 'number', min: '0', max: '1000', step: '1', value: String(st.dailyLimit ?? 20), className: 'ai-limit' });
  limit.setAttribute('aria-label', '配信者1人が1日にたのめる回数');
  limit.addEventListener('change', () => put({ dailyLimit: Number(limit.value) }, '1日の回数を変えました')());

  const extra = el('textarea', { rows: 3, value: st.extra ?? '', placeholder: '例: TNT や爆発の演出は使わない。返事はていねい語で。' });
  extra.setAttribute('aria-label', 'AI への追加の指示');
  extra.addEventListener('change', () => put({ extra: extra.value }, 'AI への追加の指示を保存しました')());

  const remove = button('キーを消す', () => {
    if (!confirm('ここで入れた AI のキーを消しますか？（だれも AI を使えなくなります）')) return;
    put({ key: '' }, 'AI のキーを消しました')();
  });
  return el(
    'div',
    { className: 'group' },
    el('p', { className: 'sub', textContent: '「AI にたのむ」（配信者が文章でたのむと、設定の案を作る）' }),
    el('p', { className: `sub hint${st.ready ? ' key-on' : ''}`, textContent: `${state}。` }),
    el('p', { className: 'sub hint', textContent: '料金がかかる AI では、1回たのむごとに料金がかかります。使える配信者は、下の「AI にたのむ」のスイッチで決めます（初めは全員使えません）。' }),
    item('使う AI', provider),
    el('div', { className: 'url' }, key, button('保存', saveKey, { iconName: 'key-round' })),
    st.provider === 'openai' ? item('API の場所', baseUrl) : null,
    item('モデル', model),
    item('配信者1人が1日にたのめる回数', limit),
    item('AI への追加の指示（全員のたのみに付く。事務所の決まりなど）', extra),
    st.source === 'admin' ? el('div', { className: 'danger' }, remove) : null,
  );
}

// --- 右: 全員まとめて（何も選んでいないとき） ---

function globalDetail() {
  return [
    el(
      'div',
      { className: 'detail-head' },
      el('h2', { textContent: '全員の ON / OFF' }),
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

function singlePage(title, body) {
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: title })), body];
}

function settingsEditor(t, section) {
  const label = section === 'roulettes' ? 'ルーレット' : section === 'timers' ? 'タイマー' : 'RUSH';
  const textarea = el('textarea', { rows: 7, value: JSON.stringify(t.settings?.[section] ?? {}, null, 2), spellcheck: false });
  textarea.setAttribute('aria-label', `${t.name}の${label}の設定`);
  const save = button('保存', async () => {
    try {
      const value = JSON.parse(textarea.value);
      await api(`/tenants/${t.id}/settings`, { path: [section], value }, 'PATCH');
      await load();
      message(`${t.name}の${label}の設定を保存しました`);
    } catch (err) { message(`保存できませんでした: ${err.message}`, true); }
  }, { cls: 'btn primary' });
  return el('div', { className: 'lul-setting' }, el('div', { className: 'lul-setting-head' }, el('strong', { textContent: label })), textarea, el('div', { className: 'btn-row' }, save));
}

function lulDetail() {
  const rows = data.tenants.map((t) => el('article', { className: 'lul-tenant' },
    el('div', { className: 'lul-tenant-head' }, el('h3', { textContent: t.name }), el('span', { className: 'hint', textContent: t.status.mode === 'live' ? '配信中' : '停止中' })),
    el('p', { className: 'hint', textContent: `使っているウィジェット: ${(t.settings?.widgets ?? []).map((key) => data.features[key]?.label ?? key).join('・') || 'なし'}` }),
    ...['roulettes', 'timers', 'rush'].map((section) => settingsEditor(t, section)),
  ));
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: 'LuL 管理ダッシュボード' }), el('p', { className: 'sub', textContent: '配信者ごとの設定をまとめて確認して、その場で直せます。' })), el('div', { className: 'lul-list' }, ...rows)];
}

function notesDetail() {
  const form = el('form', { className: 'note-form stack' });
  const title = el('input', { placeholder: 'タイトル', required: true });
  const body = el('textarea', { rows: 5, placeholder: '本文', required: true });
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10), required: true });
  form.append(el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'タイトル' }), title), el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '本文' }), body), el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '日付' }), date), el('div', { className: 'btn-row' }, button('追加', () => form.requestSubmit(), { cls: 'btn primary' })));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => api('/notes', { title: title.value, body: body.value, date: date.value }), 'お知らせを追加しました')();
  });
  const list = data.notes ?? [];
  const rows = list.map((note) => {
    const editTitle = el('input', { value: note.title });
    const editBody = el('textarea', { rows: 4, value: note.body });
    const editDate = el('input', { type: 'date', value: note.date });
    return el('article', { className: 'admin-note' }, el('div', { className: 'field-row' }, editTitle, editDate), editBody, el('div', { className: 'btn-row' }, button('保存', act(() => api(`/notes/${note.id}`, { title: editTitle.value, body: editBody.value, date: editDate.value }, 'PATCH'), 'お知らせを保存しました'), { cls: 'btn primary' }), button('削除', () => { if (confirm('このお知らせを削除しますか？')) act(() => api(`/notes/${note.id}`, undefined, 'DELETE'), 'お知らせを削除しました')(); }, { cls: 'chip' })));
  });
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: '更新のお知らせ' }), el('p', { className: 'sub', textContent: '配信者のダッシュボードの上に表示します。OBS の画面には表示しません。' })), el('section', { className: 'form-card' }, el('h3', { textContent: 'お知らせを追加' }), form), el('div', { className: 'admin-note-list' }, ...rows)];
}

const FLAG_ALIASES = {
  bosses: ['bosses', 'boss'],
  gacha: ['gacha'],
  omikuji: ['omikuji'],
  mediaAlerts: ['mediaAlerts', 'media'],
  giftSounds: ['giftSounds', 'sounds'],
  roulettes: ['roulettes'],
  rouletteLinks: ['rouletteLinks'],
};

function billingDetail() {
  const settings = data.billing ?? { enforcement: null, effective: false, multiplier: 1.5, premiumFeatures: [], plans: [] };
  const plans = settings.plans?.length ? settings.plans : [
    { id: 'pct5', label: '5%プラン', price: null },
    { id: 'flat2000', label: '2000円プラン', price: 2000 },
    { id: 'flat5000', label: '5000円プラン', price: 5000 },
  ];
  const selected = new Set(settings.premiumFeatures ?? []);
  const features = Object.entries(data.features ?? {});
  const known = new Set(features.flatMap(([key]) => FLAG_ALIASES[key] ?? [key]));
  const enforcement = el('select');
  enforcement.setAttribute('aria-label', '支払いの確認');
  enforcement.append(new Option('初期値（本番はオフ、開発はオン）', '', false, settings.enforcement == null));
  enforcement.append(new Option('オン（停止と7日の猶予）', 'on', false, settings.enforcement === true));
  enforcement.append(new Option('オフ（誰も止めない）', 'off', false, settings.enforcement === false));
  const multiplier = el('select');
  multiplier.setAttribute('aria-label', '紹介の倍率');
  multiplier.append(new Option('1.5倍', '1.5', false, settings.multiplier !== 2));
  multiplier.append(new Option('2倍', '2', false, settings.multiplier === 2));
  const checks = features.map(([key, feature]) => {
    const input = el('input', { type: 'checkbox' });
    input.dataset.flag = key;
    input.checked = (FLAG_ALIASES[key] ?? [key]).some((name) => selected.has(name));
    return el('label', {}, input, el('span', { textContent: feature.label }));
  });
  const flagBox = el('div', { className: 'flag-row' }, ...checks);
  const extra = el('input', { value: (settings.premiumFeatures ?? []).filter((name) => !known.has(name)).join(', '), placeholder: '例: rouletteLinks' });
  extra.setAttribute('aria-label', 'そのほかの機能名');
  const saveGlobal = button('保存', () => {
    const flags = [...flagBox.querySelectorAll('input:checked')].map((input) => input.dataset.flag);
    const more = extra.value.split(/[,、\s]+/).map((name) => name.trim()).filter(Boolean);
    act(() => api('/billing', {
      enforcement: enforcement.value === 'on' ? true : enforcement.value === 'off' ? false : null,
      multiplier: Number(multiplier.value),
      premiumFeatures: [...flags, ...more],
    }, 'PUT'), 'プランの設定を保存しました')();
  }, { cls: 'btn primary' });
  const globalCard = el(
    'section',
    { className: 'form-card' },
    el('h3', { textContent: '全体' }),
    el(
      'div',
      { className: 'note-form' },
      el('p', { className: 'sub', textContent: settings.effective ? 'オンです。停止の配信者は新しい接続を始めず、配信画面も出ません。支払い待ちは7日です。5000円プラン以外は、下で選んだ機能を止めます。' : 'オフです。配信も機能も止めていません。状態とお知らせは、これまでどおり出します。' }),
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '支払いの確認' }), el('div', { className: 'enforcement-row' }, enforcement, el('span', { className: 'hint', textContent: 'オフの間は誰も止まりません' }))),
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '紹介の倍率' }), multiplier),
      el('div', { className: 'field' }, el('span', { className: 'field-label', textContent: '5000円プランだけの機能' }), flagBox),
      el('p', { className: 'sub', textContent: '空のままだと、まだ決めていません。5%プランと2000円プランは同じ機能です。' }),
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'そのほかの機能名' }), extra),
      el('div', { className: 'btn-row' }, saveGlobal),
    ),
  );
  const rows = (data.tenants ?? []).map((t) => tenantBillingCard(t, plans));
  return [
    el('div', { className: 'detail-head' }, el('h2', { textContent: 'プラン・支払い' }), el('p', { className: 'sub', textContent: '配信者の状態・期限・プランを手で入れます。決済サービスにはつなぎません。' })),
    globalCard,
    el('div', { className: 'admin-note-list' }, ...rows),
  ];
}

const BILLING_STATUS = [['trial', 'お試し'], ['active', '支払い済み'], ['past_due', '支払い待ち'], ['suspended', '停止']];
const BILLING_LABELS = { status: '状態', trialEndsAt: 'お試しの終わり', paidUntil: '支払った日まで', plan: 'プラン', note: 'メモ' };
const PLAN_TEXT = { pct5: '5%プラン', flat2000: '2000円プラン', flat5000: '5000円プラン', percent5: '5%プラン', yen2000: '2000円プラン', yen5000: '5000円プラン' };

function billingValueText(key, value) {
  if (value == null || value === '') return 'なし';
  if (key === 'status') {
    for (let i = 0; i < BILLING_STATUS.length; i++) if (BILLING_STATUS[i][0] === value) return BILLING_STATUS[i][1];
  }
  if (key === 'plan') return PLAN_TEXT[value] || String(value);
  return String(value);
}

function billingHistory(billing) {
  const items = Array.isArray(billing.history) ? billing.history : [];
  const rows = [];
  const keys = ['status', 'plan', 'trialEndsAt', 'paidUntil', 'note'];
  for (let i = items.length - 1; i >= 0 && rows.length < 8; i--) {
    const changes = items[i].changes || {};
    const parts = [];
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      if (!changes[key]) continue;
      parts.push(`${BILLING_LABELS[key]}を${billingValueText(key, changes[key].after)}に変更`);
    }
    if (!parts.length) continue;
    const when = String(items[i].at || '').slice(0, 16).replace('T', ' ');
    rows.push(el('p', { className: 'sub', textContent: `${when} ${parts.join('、')}` }));
  }
  return el('div', {}, el('p', { className: 'sub', textContent: '変更の履歴' }), ...(rows.length ? rows : [el('p', { className: 'sub', textContent: '変更の履歴はまだありません' })]));
}

function tenantBillingCard(t, plans) {
  const b = t.billing ?? {};
  const yen = (n) => `${Number(n || 0).toLocaleString('ja-JP')}円`;
  const shownStatus = b.storedStatus || b.status || 'trial';
  const status = el('select');
  status.setAttribute('aria-label', `${t.name}の状態`);
  for (let i = 0; i < BILLING_STATUS.length; i++) {
    const item = BILLING_STATUS[i];
    status.append(new Option(item[1], item[0], false, shownStatus === item[0]));
  }
  const plan = el('select');
  plan.setAttribute('aria-label', `${t.name}のプラン`);
  plan.append(new Option('未設定', '', false, !b.plan));
  for (const item of plans) plan.append(new Option(item.label, item.id, false, b.plan === item.id));
  const free = el('input', { type: 'checkbox' });
  free.checked = Boolean(b.free) && shownStatus !== 'suspended';
  const trialEnds = el('input', { type: 'date', value: b.trialEndsAt || '' });
  trialEnds.setAttribute('aria-label', `${t.name}のお試しの終わり`);
  const until = el('input', { type: 'date', value: b.paidUntil || '' });
  until.setAttribute('aria-label', `${t.name}の支払った日まで`);
  const dateWrap = (input) => {
    const empty = el('span', { className: 'date-empty', textContent: '未設定' });
    const sync = () => { empty.hidden = Boolean(input.value); };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
    return el('span', { className: 'date-wrap' }, input, empty);
  };
  const note = el('input', { type: 'text', value: b.note || '', maxLength: 500 });
  note.setAttribute('aria-label', `${t.name}のメモ`);
  const price = el('input', { type: 'number', min: '0', step: '1', value: b.monthlyPrice == null ? '' : String(b.monthlyPrice), placeholder: '空ならプランの金額' });
  price.setAttribute('aria-label', `${t.name}の月額`);
  const save = button('保存', () => {
    const stopping = status.value === 'suspended';
    act(() => api(`/tenants/${t.id}/billing`, {
      status: free.checked && !stopping ? 'trial' : status.value,
      plan: plan.value || null,
      free: stopping ? false : free.checked,
      paidUntil: until.value || null,
      trialEndsAt: trialEnds.value || null,
      note: note.value,
      monthlyPrice: price.value === '' ? null : Number(price.value),
    }, 'PUT'), `${t.name}のプランを保存しました`)();
  }, { cls: 'btn primary' });
  const codeLine = b.code ? el('p', { className: 'sub', textContent: `紹介コード: ${b.code}` }) : null;
  const useCode = el('input', { placeholder: '相手の紹介コード', value: '' });
  useCode.setAttribute('aria-label', `${t.name}に適用する紹介コード`);
  if (b.referredBy) useCode.disabled = true;
  const makeCode = b.code ? null : button('紹介コードを作る', () => act(() => api(`/tenants/${t.id}/billing/code`, {}, 'POST'), '紹介コードを作りました')(), { cls: 'btn' });
  const apply = button('コードを適用', () => {
    if (!useCode.value.trim()) return message('紹介コードを入れてください', true);
    if (!confirm('この紹介コードを適用します。双方の割引残高が増えます。現金にはなりません。')) return;
    act(() => api(`/tenants/${t.id}/referral`, { code: useCode.value.trim() }, 'POST'), '紹介コードを適用しました')();
  }, { cls: 'btn' });
  if (b.referredBy) apply.disabled = true;
  const discount = b.discount ?? { price: 0, discount: 0, due: 0 };
  const use = button('1か月分の割引を残高から引く', () => {
    if (!confirm('残高から1か月分の割引を引きます。現金にはなりません。')) return;
    act(() => api(`/tenants/${t.id}/billing/credit`, {}, 'POST'), '割引を残高から引きました')();
  }, { cls: 'btn' });
  if (!discount.discount) use.disabled = true;
  return el(
    'article',
    { className: 'admin-note' },
    el('div', { className: 'lul-tenant-head' }, el('h3', { textContent: t.name }), el('span', { className: 'hint', textContent: `${b.statusLabel || 'お試し'}・割引残高 ${yen(b.credit)}` })),
    b.graceUntil ? el('p', { className: 'sub', textContent: `支払い待ちの猶予は ${b.graceUntil} までです。` }) : null,
    el('p', { className: 'sub', textContent: `次の月: ${yen(discount.price)}のうち ${yen(discount.discount)}が割引（残る支払額 ${yen(discount.due)}）` }),
    el('div', { className: 'field-row' },
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '状態' }), status),
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'プラン' }), plan),
    ),
    el('div', { className: 'field-row' },
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'お試しの終わり' }), dateWrap(trialEnds)),
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '支払った日まで' }), dateWrap(until)),
    ),
    el('div', { className: 'field-row' },
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'メモ' }), note),
      el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '月額（円）' }), price),
    ),
    el('label', { className: 'row' }, free, el('span', { textContent: '無料提供' })),
    el('div', { className: 'btn-row' }, save),
    billingHistory(b),
    codeLine,
    b.referredBy
      ? el('p', { className: 'sub', textContent: '紹介コードは適用済みです。' })
      : el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '相手の紹介コード' }), useCode),
    el('div', { className: 'btn-row referral-actions' }, makeCode, apply, use),
  );
}

function keysDetail() {
  const addForm = el('form', { className: 'key-form stack' });
  const name = el('input', { placeholder: '名前', required: true });
  const type = el('input', { placeholder: '種類', required: true });
  const value = el('input', { type: 'password', placeholder: 'API キー', autocomplete: 'off', required: true });
  addForm.append(el('div', { className: 'field-row' }, name, type), value, el('div', { className: 'btn-row' }, button('追加', () => addForm.requestSubmit(), { cls: 'btn primary' })));
  addForm.addEventListener('submit', (event) => { event.preventDefault(); act(() => api('/keys', { name: name.value, type: type.value, value: value.value }), 'API キーを追加しました')(); });
  const rows = (data.keys ?? []).map((key) => {
    const nameInput = el('input', { value: key.name, disabled: key.id === 'eulerstream' && key.readOnly });
    const typeInput = el('input', { value: key.type, disabled: key.id === 'eulerstream' && key.readOnly });
    const secret = el('input', { type: 'password', placeholder: key.set ? '新しいキーに入れ替える' : 'API キー', autocomplete: 'off', disabled: key.readOnly });
    const save = button('保存', () => {
      const patch = { name: nameInput.value, type: typeInput.value };
      if (secret.value) patch.value = secret.value;
      if (key.id === 'eulerstream' && !patch.value) return message('新しいキーを入れてください', true);
      act(() => api(`/keys/${key.id}`, patch, 'PATCH'), 'API キーを保存しました')();
    }, { cls: 'btn primary' });
    const remove = key.readOnly ? null : button('削除', () => { if (confirm(`${key.name}を削除しますか？`)) act(() => api(`/keys/${key.id}`, undefined, 'DELETE'), 'API キーを削除しました')(); });
    return el('article', { className: 'admin-key' }, el('div', { className: 'key-meta' }, el('strong', { textContent: key.name }), el('span', { className: 'hint', textContent: `${key.type}・${key.environment === 'data' ? 'この画面で保存' : key.environment}・${key.savedAt ? key.savedAt.slice(0, 10) : '保存日なし'}` })), el('code', { textContent: key.masked || '未設定' }), el('div', { className: 'field-row' }, nameInput, typeInput, secret), el('div', { className: 'btn-row' }, save, remove));
  });
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: 'API キー' }), el('p', { className: 'sub', textContent: 'キーの値は最初の8文字と末尾4文字だけ表示します。環境変数のキーは読み取り専用です。' })), el('section', { className: 'form-card' }, el('h3', { textContent: 'API キーを追加' }), addForm), el('div', { className: 'admin-key-list' }, ...rows)];
}

const AI_SCOPES = [
  ['read', '読む'],
  ['write', '設定を変える'],
  ['operate', '操作する'],
  ['test', 'テスト送信'],
  ['admin', '配信者の設定'],
];
const AI_SCOPE_LABEL = Object.fromEntries(AI_SCOPES);
const AI_PATH_LABEL = {
  'billing.plan': 'プラン',
  'billing.status': '状態',
  'billing.paidUntil': '支払った日まで',
  'billing.trialEndsAt': 'お試しの終わり',
  'billing.multiplier': '紹介の倍率',
  'billing.note': 'メモ',
  'billing.free': '無料提供',
  'billing.monthlyPrice': '月額（円）',
  'billing.premiumFeatures': '5000円プランだけの機能',
};
const AI_VALUE_LABEL = {
  flat2000: '2000円プラン',
  pct5: '売上5%プラン',
  flat5000: '5000円プラン',
  percent5: '売上5%プラン',
  yen2000: '2000円プラン',
  yen5000: '5000円プラン',
  trial: 'お試し',
  active: '支払い済み',
  past_due: '支払い待ち',
  suspended: '停止',
};
const AI_TOOL_LABEL = {
  get_status: '状態を見た',
  get_config: '設定を見た',
  validate_config: '設定を確かめた',
  get_history: '履歴を見た',
  list_widget_urls: 'ウィジェットのURLを見た',
  list_gifts: 'ギフトを見た',
  list_changes: '変更を見た',
  set_config: '設定を変えた',
  merge_config: '設定を一部変えた',
  delete_config: '設定を消した',
  spin_roulette: 'ルーレットを回した',
  timer: 'タイマーを動かした',
  wins: '勝ち数を動かした',
  boss: 'ボスを動かした',
  rush: 'ラッシュを動かした',
  test_event: 'テストを送った',
  tenant_widgets: 'ウィジェットを変えた',
  tenant_template: 'テンプレートを変えた',
  undo: '元に戻した',
  request_billing_change: '課金の変更を申請した',
};
let revealedToken = null;

function japanTime(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return String(iso || '');
  try {
    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    return fmt.format(new Date(ms));
  } catch (err) {
    const shifted = new Date(ms + 9 * 60 * 60 * 1000);
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  }
}

function streamerName(id) {
  if (!id) return '';
  const found = (data?.tenants || []).find((t) => t.id === id);
  return found && found.name ? found.name : id;
}

function aiPathText(path) {
  if (!path) return '課金';
  return AI_PATH_LABEL[path] || path;
}

function aiValueText(value) {
  if (value == null || value === '') return 'なし';
  if (typeof value === 'string') return AI_VALUE_LABEL[value] || value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(aiValueText).join('、');
  if (typeof value === 'object') {
    const parts = [];
    for (const key of Object.keys(value)) {
      const label = AI_PATH_LABEL[`billing.${key}`] || key;
      parts.push(`${label}: ${aiValueText(value[key])}`);
    }
    return parts.join('、') || 'なし';
  }
  return String(value);
}

function aiTokensDetail() {
  const name = el('input', { placeholder: '名前（例: 設定係）', required: true, autocomplete: 'off' });
  const tenants = el('input', { placeholder: '配信者の id。カンマで複数。* で全員', required: true, autocomplete: 'off' });
  const days = el('input', { type: 'number', min: '1', max: '366', value: '30' });
  days.setAttribute('aria-label', '有効な日数');
  const scopeBoxes = AI_SCOPES.map(([id, label]) => {
    const input = el('input', { type: 'checkbox', value: id });
    if (id === 'read') input.checked = true;
    return el('label', {}, input, label);
  });
  const form = el('form', { className: 'key-form stack' });
  form.append(
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '名前' }), name),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '使える配信者' }), tenants),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '有効な日数' }), days, el('span', { className: 'hint', textContent: '初めは30日です。' })),
    el('div', { className: 'flag-row' }, ...scopeBoxes),
    el('div', { className: 'btn-row' }, button('発行する', () => form.requestSubmit(), { cls: 'btn primary' })),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const scopes = scopeBoxes.map((label) => label.querySelector('input')).filter((input) => input.checked).map((input) => input.value);
    try {
      const issued = await api('/ai-tokens', {
        name: name.value,
        tenants: tenants.value.split(',').map((item) => item.trim()).filter(Boolean),
        scopes,
        days: Number(days.value || 30),
      });
      revealedToken = issued.value;
      await load();
      renderDetail(true);
      message('トークンを発行しました。値はこの画面に一度だけ出します');
    } catch (err) {
      message(err.message, true);
    }
  });

  const revealedInput = revealedToken ? el('input', { readOnly: true, value: revealedToken, spellcheck: false }) : null;
  const revealed = revealedToken
    ? el('div', { className: 'admin-key' },
      el('p', { className: 'form-message', textContent: 'この値は今だけ表示します。控えてください。あとから見ることはできません。' }),
      revealedInput,
      el('div', { className: 'btn-row' },
        button('コピー', () => { copyText(revealedToken, revealedInput); message('コピーしました'); }, { cls: 'btn primary' }),
        button('閉じる', () => { revealedToken = null; renderDetail(true); }),
      ))
    : null;

  const rows = (data.aiTokens ?? []).map((token) => {
    const when = String(token.expiresAt || '').slice(0, 10);
    const scopes = (token.scopes ?? []).map((scope) => AI_SCOPE_LABEL[scope] || scope).join('、');
    return el('article', { className: 'admin-key' },
      el('div', { className: 'key-meta' }, el('strong', { textContent: token.name }), el('span', { className: 'hint', textContent: `${when} まで` })),
      el('p', { className: 'hint', textContent: `配信者: ${(token.tenants ?? []).map(streamerName).join('、') || 'なし'}　権限: ${scopes}` }),
      el('div', { className: 'btn-row' }, button('失効させる', () => {
        if (!confirm(`${token.name} を失効させますか？この値ではもう操作できません。`)) return;
        act(() => api(`/ai-tokens/${token.id}`, undefined, 'DELETE'), 'トークンを失効させました')();
      })),
    );
  });

  const auditRows = (data.aiAudit ?? []).map((entry) => {
    const when = japanTime(entry.ts);
    const result = entry.ok ? (entry.dryRun ? '確認のみ' : '成功') : (entry.error || '失敗');
    const who = entry.tenant ? streamerName(entry.tenant) : '配信者なし';
    return el('article', { className: 'admin-key' },
      el('div', { className: 'key-meta' }, el('strong', { textContent: AI_TOOL_LABEL[entry.tool] || entry.tool || '操作' }), el('span', { className: 'hint', textContent: when })),
      el('p', { className: 'hint', textContent: `${who}　${result}` }),
    );
  });

  const approvalRows = (data.aiApprovals ?? []).map((item) => el('article', { className: 'admin-key' },
    el('div', { className: 'key-meta' }, el('strong', { textContent: aiPathText(item.path) }), el('span', { className: 'hint', textContent: '承認待ち' })),
    el('p', { className: 'hint', textContent: `${item.tenant ? streamerName(item.tenant) : '全体'}　${aiValueText(item.value)}` }),
    el('div', { className: 'btn-row' },
      button('承認する', () => act(() => api(`/ai-approvals/${item.id}/approve`, {}, 'POST'), '承認して反映しました')(), { cls: 'btn primary' }),
      button('却下する', () => act(() => api(`/ai-approvals/${item.id}/reject`, {}, 'POST'), '申請を却下しました')()),
    ),
  ));

  return [
    el('div', { className: 'detail-head' }, el('h2', { textContent: 'AIトークン' }), el('p', { className: 'sub', textContent: 'AI が設定を読んだり変えたりするときの合言葉です。値そのものは保存しません。' })),
    el('section', { className: 'form-card' }, el('h3', { textContent: 'トークンを発行' }), form, revealed),
    el('section', { className: 'form-card' }, el('h3', { textContent: '発行済み' }), el('div', { className: 'admin-key-list' }, ...(rows.length ? rows : [el('p', { className: 'hint', textContent: 'まだありません' })]))),
    el('section', { className: 'form-card' }, el('h3', { textContent: '承認待ちの課金' }), el('div', { className: 'admin-key-list' }, ...(approvalRows.length ? approvalRows : [el('p', { className: 'hint', textContent: '承認待ちはありません' })]))),
    el('section', { className: 'form-card' }, el('h3', { textContent: '最近の操作' }), el('p', { className: 'hint', textContent: '新しい20件です。トークンの値は残りません。' }), el('div', { className: 'admin-key-list' }, ...(auditRows.length ? auditRows : [el('p', { className: 'hint', textContent: 'まだありません' })]))),
  ];
}

function renderShell() {
  const tenants = page === 'tenants';
  $('tenantListPanel').hidden = !tenants;
  $('kpis').hidden = !tenants;
  const checkedCount = [...checked].filter((id) => data?.tenants.some((t) => t.id === id)).length;
  const hasDetail = !tenants || Boolean(selected) || checkedCount >= 2;
  $('detail').hidden = !hasDetail;
  $('detail').classList.toggle('page-detail', hasDetail);
  $('detail').classList.toggle('card-page', CARD_PAGES.includes(page));
  document.querySelectorAll('.admin-side .side-item[data-page]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.page === page)));
}

function renderDetail(force = false) {
  // 名前などを打っている最中は作り直さない
  if (!force && detailBody.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]), textarea, select')) return;
  renderShell();
  if (page === 'global') {
    detailBody.replaceChildren(...globalDetail());
    return;
  }
  if (page === 'ai') {
    detailBody.replaceChildren(...singlePage('AI にたのむ の設定', aiGroup()));
    return;
  }
  if (page === 'sign') {
    detailBody.replaceChildren(...singlePage('TikTok の接続キー', signKeyGroup()));
    return;
  }
  if (page === 'lul') {
    detailBody.replaceChildren(...lulDetail());
    return;
  }
  if (page === 'notes') {
    detailBody.replaceChildren(...notesDetail());
    return;
  }
  if (page === 'keys') {
    detailBody.replaceChildren(...keysDetail());
    return;
  }
  if (page === 'ai-tokens') {
    detailBody.replaceChildren(...aiTokensDetail());
    return;
  }
  if (page === 'billing') {
    detailBody.replaceChildren(...billingDetail());
    return;
  }
  const ids = [...checked].filter((id) => data.tenants.some((t) => t.id === id));
  const t = data.tenants.find((x) => x.id === selected);
  if (ids.length >= 2) detailBody.replaceChildren(...bulkDetail(ids));
  else if (t) detailBody.replaceChildren(...tenantDetail(t));
  else {
    selected = null;
    detailBody.replaceChildren();
  }
  renderShell();
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
  renderShell();
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
    message(`${tenant.name} を追加しました。短い URL と 4桁の数字を渡してください`);
  } catch (err) {
    message(err.message, true);
  }
});

// 配信中かどうか・残り時間を新しくする
setInterval(() => data && !$('main').hidden && load(), 20_000);

if (token) load();
else showLogin();
