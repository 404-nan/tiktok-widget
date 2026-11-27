// 管理画面の右ペイン: 配信者詳細（プランの申し込みを含む）、まとめて、接続キー、AI 設定、全員、LuL。
// admin.js が initDetail() で遅延バインディングを渡す。

import { icon } from '/widgets/lib/overlay.js';
import { $, copyText } from '/dashboard/common.js';
import { el, button, api, message, act, accessRow, accessGroups, setter, copyField, handoverMessage, left } from './admin-parts.js';

let _getData, _getSelected, _setSelected, _getChecked, _renderRows, _renderDetail, _load;

export function initDetail({ getData, getSelected, setSelected, getChecked, renderRows, renderDetail, load }) {
  _getData = getData;
  _getSelected = getSelected;
  _setSelected = setSelected;
  _getChecked = getChecked;
  _renderRows = renderRows;
  _renderDetail = renderDetail;
  _load = load;
}

// --- 右: 選んだ1人 ---

function statusOf(t) {
  if (!t.enabled) return ['off', '止めている'];
  if (t.status.mode === 'live') return ['live', `LIVE · @${t.status.username}`];
  if (t.status.mode === 'demo') return ['demo', 'デモ中'];
  return ['', '配信していません'];
}

function liveDetails(t) {
  if (t.status.mode !== 'live') return '';
  const name = t.name || t.status.username || '配信者';
  return `${name}・${t.status.elapsedMinutes ?? 0}分・視聴者 ${t.status.viewers ?? 0}人・コイン ${t.status.coins ?? 0}`;
}

export function tenantDetail(t) {
  const data = _getData();
  const [cls, text] = statusOf(t);
  const name = el('input', { className: 'name-input', value: t.name });
  name.setAttribute('aria-label', '名前');
  name.addEventListener('change', act(() => api(`/tenants/${t.id}`, { name: name.value }, 'PATCH'), '名前を変えました'));
  const enabled = el('input', { type: 'checkbox', checked: t.enabled });
  enabled.addEventListener('change', act(() => api(`/tenants/${t.id}`, { enabled: enabled.checked }, 'PATCH'), enabled.checked ? '使えるようにしました' : '利用を止めました'));

  return [
    button('← 配信者の一覧', () => {
      _setSelected(null);
      _renderRows();
      _renderDetail();
    }, { cls: 'chip back-button' }),
    el(
      'div',
      { className: 'detail-head' },
      name,
      el('div', { className: 'row' }, el('span', { className: `status ${cls}` }, el('i'), text), el('label', { className: 'row' }, enabled, '使える')),
    ),
    t.status.mode === 'live' ? el('p', { className: 'hint live-summary', textContent: liveDetails(t) }) : null,
    planRequestsGroup(t),
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
      button('案内文をコピー', () => {
        copyText(handoverMessage(t));
        message('案内文をコピーしました');
      }),
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
          _setSelected(null);
          act(() => api(`/tenants/${t.id}`, undefined, 'DELETE'), '削除しました')();
        }, { iconName: 'trash-2' }),
      ),
    ),
  ];
}

// --- 右: プランの申し込み ---
// 配信者が送った申し込みを、確かめてから1回押して反映する。お金の記録はここでは入れない（支払いの台帳で入れる）。

function requestWhen(row) {
  const day = (iso) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const times = row.count > 1 ? `・${row.count}回押されました（最後は ${day(row.lastAt)}）` : '';
  return `${day(row.at)}${times}`;
}

function requestTitle(row) {
  return row.type === 'cancel' ? `解約（次の更新をしない）・いまは ${row.planLabel || 'プラン未設定'}` : `${row.planLabel} にしたい`;
}

function pendingRequestRow(t, row) {
  const decide = (action, done) => act(() => api(`/tenants/${t.id}/plan-requests/${row.id}/${action}`, {}), done);
  const paidUntil = t.billing?.paidUntil;
  const actions = row.type === 'cancel'
    ? [button('解約を確かめる', decide('approve', `解約を受けました。${paidUntil ? `${paidUntil} まではそのまま使えます` : ''}`), { cls: 'btn primary', iconName: 'check' })]
    : [button('確かめて有効にする', decide('approve', `${row.planLabel} を有効にしました（支払った日まで +1か月）`), { cls: 'btn primary', iconName: 'check' })];
  actions.push(button('見送る', () => {
    if (!confirm(`${t.name} の「${requestTitle(row)}」を見送りますか？`)) return;
    decide('reject', '見送りました')();
  }));
  return el('div', { className: 'group-item plan-request' },
    el('span', { className: 'url-label', textContent: requestTitle(row) }),
    el('span', { className: 'hint', textContent: requestWhen(row) }),
    el('div', { className: 'row' }, ...actions),
  );
}

export function planRequestsGroup(t) {
  const view = t.planRequests ?? { pending: [], recent: [], error: '' };
  const done = view.recent.filter((row) => row.state !== 'pending').slice(0, 3);
  if (!view.pending.length && !done.length && !view.error) return null;
  return el('div', { className: 'group' },
    el('p', { className: 'sub', textContent: `プランの申し込み${view.pending.length ? `（確認中 ${view.pending.length}件）` : ''}` }),
    view.error ? el('p', { className: 'sub hint error', textContent: view.error }) : null,
    ...view.pending.map((row) => pendingRequestRow(t, row)),
    view.pending.length ? el('p', { className: 'sub hint', textContent: '「確かめて有効にする」は、入金を確かめてから押してください。プラン・支払い済み・支払った日まで（今日から1か月。今の期限のほうが後なら今のまま）が入り、支払いの変更の履歴に残ります。入金の記録は支払いの台帳で入れてください。解約は、次の更新をしないことを残すだけで、支払った日までは今のまま使えます。' }) : null,
    ...done.map((row) => el('p', { className: 'sub hint', textContent: `${requestTitle(row)}: ${row.stateLabel}（${requestWhen(row)}）` })),
  );
}

// --- 右: 選んだ何人かにまとめて ---

export function bulkDetail(ids) {
  const data = _getData();
  const checked = _getChecked();
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
          _renderRows();
          _renderDetail();
        }),
      ),
    ),
  ];
}

// --- 右: TikTok につなぐための API キー ---

export function signKeyGroup() {
  const data = _getData();
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

// --- 右: 「AI にたのむ」の設定 ---

const AI_MODEL_LABELS = { 'claude-opus-5-5': 'Claude Opus 5.5（いちばん賢い）', 'claude-sonnet-5-5': 'Claude Sonnet 5.5（料金は半分くらい）', 'claude-haiku-4-5': 'Claude Haiku 4.5（いちばん安い）' };

export function aiGroup() {
  const data = _getData();
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

// --- 右: 全員まとめて ---

export function globalDetail() {
  const data = _getData();
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

export function singlePage(title, body) {
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: title })), body];
}

export function settingsEditor(t, section) {
  const label = section === 'roulettes' ? 'ルーレット' : section === 'timers' ? 'タイマー' : 'RUSH';
  const textarea = el('textarea', { rows: 7, value: JSON.stringify(t.settings?.[section] ?? {}, null, 2), spellcheck: false });
  textarea.setAttribute('aria-label', `${t.name}の${label}の設定`);
  const save = button('保存', async () => {
    try {
      const value = JSON.parse(textarea.value);
      await api(`/tenants/${t.id}/settings`, { path: [section], value }, 'PATCH');
      await _load();
      message(`${t.name}の${label}の設定を保存しました`);
    } catch (err) { message(`保存できませんでした: ${err.message}`, true); }
  }, { cls: 'btn primary' });
  return el('div', { className: 'lul-setting' }, el('div', { className: 'lul-setting-head' }, el('strong', { textContent: label })), textarea, el('div', { className: 'btn-row' }, save));
}

export function lulDetail() {
  const data = _getData();
  const rows = data.tenants.map((t) => el('article', { className: 'lul-tenant' },
    el('div', { className: 'lul-tenant-head' }, el('h3', { textContent: t.name }), el('span', { className: 'hint', textContent: t.status.mode === 'live' ? '配信中' : '停止中' })),
    el('p', { className: 'hint', textContent: `使っているウィジェット: ${(t.settings?.widgets ?? []).map((key) => data.features[key]?.label ?? key).join('・') || 'なし'}` }),
    ...['roulettes', 'timers', 'rush'].map((section) => settingsEditor(t, section)),
  ));
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: 'LuL 管理ダッシュボード' }), el('p', { className: 'sub', textContent: '配信者ごとの設定をまとめて確認して、その場で直せます。' })), el('div', { className: 'lul-list' }, ...rows)];
}
