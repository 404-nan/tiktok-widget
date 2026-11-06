// 管理画面の共通部品: DOM ヘルパー、API 呼び出し、メッセージ表示、ウィジェット行。
// admin.js が initParts() で遅延バインディングを渡す。

import { icon } from '/widgets/lib/overlay.js';
import { $, copyText } from '/dashboard/common.js';

// --- 遅延バインディング ---
let _getToken, _showLogin, _load, _getData;
export function initParts({ getToken, showLogin, load, getData }) {
  _getToken = getToken;
  _showLogin = showLogin;
  _load = load;
  _getData = getData;
}

// --- API ---

export async function api(path, body, method) {
  const res = await fetch(`/admin/api${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', 'x-admin-token': _getToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    _showLogin('合言葉が違います');
    throw new Error(json.error);
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// --- メッセージ ---

export function message(text, error = false) {
  const msgEl = $('message');
  msgEl.textContent = text;
  msgEl.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(message.t);
  message.t = setTimeout(() => msgEl.classList.remove('show'), 3200);
}

// 失敗したら知らせ、成功したら読み直す
export const act = (fn, done) => async () => {
  try {
    await fn();
    await _load();
    if (done) message(done);
  } catch (err) {
    message(err.message, true);
  }
};

// --- DOM ヘルパー ---

export const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null && c !== false));
  return n;
};
export const button = (text, onClick, { cls = 'chip', iconName = null } = {}) => {
  const b = el('button', { type: 'button', className: `${cls} pressable` }, iconName ? icon(iconName) : null, text);
  b.addEventListener('click', onClick);
  return b;
};

// --- ウィジェット行の部品 ---

export const left = (until) => {
  const h = (until - Date.now()) / 3600_000;
  if (h <= 0) return 'まもなく終わり';
  if (h * 60 < 59.5) return `あと${Math.max(1, Math.round(h * 60))}分`;
  if (h < 48) return `あと${Math.round(h)}時間`;
  return `あと${Math.round(h / 24)}日`;
};
export const dotClass = (st) => (!st?.on ? '' : st.until == null ? 'on' : 'temp');
export const onText = (st) => (st?.on ? '使える' : '使えない');

export const DURATIONS = [[0, 'ずっと'], [1, '1時間'], [3, '3時間'], [6, '6時間'], [12, '12時間'], [24, '24時間'], [72, '3日'], [168, '7日']];

export const own = (st, where) => (where === 'tenant' ? st.source === 'own' : st.source === 'everyone');

/**
 * ウィジェット1つ分の行: 名前と今の状態 / ON・OFF のスイッチ / 時間のプルダウン / 初めに戻す。
 * st: 今の状態 { on, until, source }（null なら「まとめて」用に ON・OFF のボタンを出す）
 * apply(on, hours): on は true / false / null（初めに戻す）
 * where: 'tenant' | 'global'（状態の書き方が変わる）
 */
export function accessRow(key, st, apply, { where = 'tenant', note = '' } = {}) {
  const data = _getData();
  const f = data.features[key] ?? (key === 'premium' ? { label: '豪華な演出をまとめて', premium: true } : { label: key });
  const select = el('select', { className: 'dur', title: 'ON / OFF にする長さ（過ぎたら初めの状態に戻る）' });
  if (st?.until) select.append(new Option(left(st.until), 'keep'));
  for (const [h, text] of DURATIONS) select.append(new Option(text, String(h)));
  const hours = () => (select.value === 'keep' ? Math.max(0.02, (st.until - Date.now()) / 3600_000) : Number(select.value));

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
export function accessGroups(rowOf, extraPremium = null) {
  const data = _getData();
  const keys = Object.keys(data.features);
  const normal = keys.filter((k) => !data.features[k].premium);
  const premium = keys.filter((k) => data.features[k].premium);
  return [
    el('div', { className: 'group' }, el('p', { className: 'sub', textContent: '豪華な演出（初めは使えない）' }), ...premium.map(rowOf), extraPremium),
    el('div', { className: 'group' }, el('p', { className: 'sub', textContent: 'ウィジェット（初めから使える）' }), ...normal.map(rowOf)),
  ];
}

// apply(on, hours) を、API を呼ぶ関数にする
export const setter = (target, feature, done) => (on, hours) => act(() => api('/access', { target, feature, on, hours: hours() }, 'PUT'), done);

export function copyField(label, url) {
  const input = el('input', { value: url, readOnly: true });
  const b = button('コピー', () => {
    copyText(url, input);
    message(`${label}の URL をコピーしました`);
  }, { iconName: 'copy' });
  return el('div', { className: 'group-item' }, el('span', { className: 'url-label', textContent: label }), el('div', { className: 'url' }, input, b));
}

export function handoverMessage(t) {
  return [
    `①この URL を開きます: ${t.urls.short}`,
    `4桁の数字 ${t.pin} を入れます。`,
    '②出すものを選びます。',
    '③配信ソフトに URL を入れます。',
    '④「ためしに動かす」を押して、画面を確かめます。',
  ].join('\n');
}
