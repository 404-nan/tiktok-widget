// 管理画面: 契約している配信者の追加・URL の発行・豪華な演出のオン/オフ（ずっと・時間指定・全員まとめて）。
// API は /admin/api/...（合言葉を x-admin-token で送る）

import { icon } from '/widgets/lib/overlay.js';
import { $, store, setupPanels, setupTheme } from '/dashboard/common.js';

setupPanels();
setupTheme();

let token = store.get('adminToken', '');
let data = null;

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
  el.className = `form-message${error ? ' error' : ' ok'}`;
  clearTimeout(message.t);
  message.t = setTimeout(() => (el.textContent = ''), 4000);
}

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

// --- 表示 ---

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null));
  return n;
};

const left = (until) => {
  const h = (until - Date.now()) / 3600_000;
  if (h <= 0) return 'まもなく終わり';
  if (h < 1) return `あと${Math.max(1, Math.round(h * 60))}分`;
  if (h < 48) return `あと${Math.round(h)}時間`;
  return `あと${Math.round(h / 24)}日`;
};

/** 豪華な演出1つ分の行: 名前 / 今の状態 / ずっとオン・1時間・3時間・24時間・○時間・オフ */
function grantRow(target, feature, label, st, note = '') {
  const state = el('span', { className: 'state' });
  if (st?.active) {
    state.textContent = st.until == null ? 'ずっとオン' : `オン（${left(st.until)}）`;
    state.classList.add(st.until == null ? 'on' : 'temp');
  } else {
    state.textContent = 'オフ';
  }
  if (note) state.textContent += note;
  const set = (mode, hours) => async () => {
    try {
      await api('/premium', { target, feature, mode, hours }, 'PUT');
      await load();
    } catch (err) {
      message(err.message, true);
    }
  };
  const chip = (text, onClick) => {
    const b = el('button', { type: 'button', className: 'chip pressable', textContent: text });
    b.addEventListener('click', onClick);
    return b;
  };
  const hours = el('input', { type: 'number', min: '1', step: '1', placeholder: '時間', className: 'hours' });
  return el(
    'div',
    { className: 'grant' },
    el('span', { className: 'name', textContent: label }),
    state,
    el(
      'div',
      { className: 'btns' },
      chip('ずっとオン', set('on')),
      chip('1時間', set('for', 1)),
      chip('3時間', set('for', 3)),
      chip('24時間', set('for', 24)),
      hours,
      chip('時間だけオン', () => (Number(hours.value) > 0 ? set('for', Number(hours.value))() : message('何時間か入れてください', true))),
      chip('オフ', set('off')),
    ),
  );
}

function renderGlobal() {
  const box = $('globalGrants');
  box.replaceChildren(
    ...Object.entries(data.premiumLabels).map(([f, label]) => grantRow('global', f, label, data.global[f])),
    grantRow('global', 'all', '全部まとめて', null),
  );
  // 「全部まとめて」の状態は出さない
  box.lastElementChild.querySelector('.state').textContent = '';
}

function copyRow(label, url) {
  const input = el('input', { value: url, readOnly: true });
  const b = el('button', { type: 'button', className: 'chip pressable' }, icon('copy'), 'コピー');
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    b.lastChild.textContent = 'コピーしました';
    setTimeout(() => (b.lastChild.textContent = 'コピー'), 1500);
  });
  return el('div', { className: 'url' }, el('span', { textContent: label }), input, b);
}

function renderTenant(t) {
  const card = el('section', { className: `panel card${t.enabled ? '' : ' off'}` });
  card.append(el('div', { className: 'panel-bg' }));

  // 名前（その場で書き換え）と、配信中かどうか
  const name = el('input', { className: 'name-input', value: t.name });
  name.addEventListener('change', async () => {
    try {
      await api(`/tenants/${t.id}`, { name: name.value }, 'PATCH');
      message('名前を変えました');
    } catch (err) {
      message(err.message, true);
    }
  });
  const live = el('span', { className: `live${t.status.mode === 'live' ? ' on' : ''}` });
  live.textContent = t.status.mode === 'live' ? `LIVE · @${t.status.username}` : t.status.mode === 'demo' ? 'デモ中' : '配信していません';
  const enabled = el('label', { className: 'row' }, el('input', { type: 'checkbox', checked: t.enabled }), '使える');
  enabled.querySelector('input').addEventListener('change', async (e) => {
    try {
      await api(`/tenants/${t.id}`, { enabled: e.target.checked }, 'PATCH');
      await load();
    } catch (err) {
      message(err.message, true);
    }
  });
  card.append(el('div', { className: 'card-head' }, name, live, enabled));

  // URL
  card.append(
    el(
      'div',
      { className: 'urls' },
      copyRow('ダッシュボード', t.urls.dashboard),
      copyRow('モニター', t.urls.monitor),
      copyRow('OBS 用（の前半）', t.urls.obs),
      el('p', { className: 'hint', textContent: 'ダッシュボードの URL は配信者だけに渡してください（設定を変えられます）。OBS に入れる URL は配信者のダッシュボードに出ます。' }),
    ),
  );

  // 豪華な演出（この配信者だけ）
  card.append(el('p', { className: 'sub', textContent: '豪華な演出（この配信者だけ）' }));
  card.append(
    el(
      'div',
      { className: 'grants' },
      ...Object.entries(data.premiumLabels).map(([f, label]) => {
        const st = t.premium[f];
        const own = st.own ? { active: true, until: st.own.until } : null;
        return grantRow(t.id, f, label, own, st.everyone && !st.own ? '（全員のオンで使えています）' : '');
      }),
    ),
  );

  // 使うウィジェット（配信者も自分で選べる）
  card.append(el('p', { className: 'sub', textContent: '使うウィジェット（配信者もダッシュボードで選べます）' }));
  const picks = el('div', { className: 'picks' });
  for (const [s, title] of Object.entries(data.sections)) {
    const on = t.widgets.includes(s);
    const b = el('button', { type: 'button', className: 'pick pressable' }, on ? icon('check') : null, title);
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', async () => {
      const next = on ? t.widgets.filter((w) => w !== s) : [...t.widgets, s];
      try {
        await api(`/tenants/${t.id}`, { widgets: next }, 'PATCH');
        await load();
      } catch (err) {
        message(err.message, true);
      }
    });
    picks.append(b);
  }
  card.append(picks);

  // 鍵の作り直し・削除
  const rekey = el('button', { type: 'button', className: 'chip pressable' }, icon('key-round'), 'URL を作り直す');
  rekey.addEventListener('click', async () => {
    if (!confirm(`${t.name} の URL を作り直しますか？ 今の URL（ダッシュボードと OBS）は使えなくなります。`)) return;
    try {
      await api(`/tenants/${t.id}/rekey`, { which: 'both' });
      await load();
      message('URL を作り直しました。新しい URL を配信者に渡してください');
    } catch (err) {
      message(err.message, true);
    }
  });
  const del = el('button', { type: 'button', className: 'chip pressable' }, icon('trash-2'), '削除');
  del.addEventListener('click', async () => {
    if (!confirm(`${t.name} を削除しますか？（設定と記録のファイルは data/tenants/${t.id}/ に残ります）`)) return;
    try {
      await api(`/tenants/${t.id}`, undefined, 'DELETE');
      await load();
    } catch (err) {
      message(err.message, true);
    }
  });
  card.append(el('div', { className: 'danger-zone' }, rekey, del));
  return card;
}

function render() {
  renderGlobal();
  const box = $('tenants');
  box.replaceChildren(...data.tenants.map(renderTenant));
  if (!data.tenants.length) box.append(el('p', { className: 'hint', textContent: 'まだ配信者がいません。上の「配信者を追加」から追加してください。' }));
}

async function load() {
  try {
    data = await api('/tenants');
  } catch {
    return;
  }
  $('loginPanel').hidden = true;
  $('main').hidden = false;
  $('logoutBtn').hidden = false;
  render();
}

$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { tenant } = await api('/tenants', { name: $('newName').value });
    $('newName').value = '';
    await load();
    message(`${tenant.name} を追加しました。ダッシュボードの URL を渡してください`);
  } catch (err) {
    message(err.message, true);
  }
});

$('everyoneOff').addEventListener('click', async () => {
  if (!confirm('全員の「配信者ごとのオン」を消しますか？（全員まとめてのオンはそのまま）')) return;
  try {
    await api('/premium', { target: 'everyone', feature: 'all', mode: 'off' }, 'PUT');
    await load();
  } catch (err) {
    message(err.message, true);
  }
});

// 残り時間の表示を新しくする
setInterval(() => data && !$('main').hidden && load(), 60_000);

if (token) load();
else showLogin();
