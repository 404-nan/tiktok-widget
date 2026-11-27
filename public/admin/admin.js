// 管理画面: 契約している配信者の追加・URL の発行・ウィジェットごとの ON / OFF（ずっと・時間指定・全員まとめて・選んだ人にまとめて）。
// 配信者が増えても伸びないよう、左に1人1行の一覧、右に「選んだ1人 / 選んだ何人か / 全員まとめて」の設定を出す。
// API は /admin/api/...（合言葉を x-admin-token で送る）

import { $, store, setupPanels, setupTheme } from '/dashboard/common.js';
import { initParts, api, el, message } from './admin-parts.js';
import { initAuth, showLogin, setupAuth } from './admin-auth.js';
import { initList, renderKpis, renderFilters, renderRows, setupListEvents } from './admin-list.js';
import { initDetail, tenantDetail, bulkDetail, signKeyGroup, aiGroup, globalDetail, singlePage, lulDetail } from './admin-detail.js';
import { initBilling, notesDetail, billingDetail } from './admin-billing.js';
import { initKeys, keysDetail, aiTokensDetail } from './admin-keys.js';
import { ledgerDetail, refreshLedger } from './admin-ledger.js';
import { refreshMoney } from './admin-money.js';

setupPanels();
setupTheme();

// --- 状態 ---

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
const CARD_PAGES = ['lul', 'notes', 'keys', 'billing', 'money', 'ai-tokens', 'ledger'];

// --- 遅延バインディングの初期化 ---

// 共通ゲッター
const getToken = () => token;
const getData = () => data;
const getSelected = () => selected;
const getChecked = () => checked;
const getFilter = () => filter;
const getSearch = () => search;

initParts({
  getToken,
  showLogin,
  load,
  getData,
});

initAuth({
  setToken: (v) => { token = v; store.set('adminToken', v); },
  load,
  renderShell,
  renderDetail,
  setPage: (v) => { page = v; },
  setSelected: (v) => { selected = v; },
  clearChecked: () => checked.clear(),
});

initList({
  getData,
  getSelected,
  setSelected: (v) => { selected = v; },
  getChecked,
  getFilter,
  setFilter: (v) => { filter = v; },
  getSearch,
  setSearch: (v) => { search = v; },
  renderDetail,
});

initDetail({
  getData,
  getSelected,
  setSelected: (v) => { selected = v; },
  getChecked,
  renderRows,
  renderDetail,
  load,
});

initBilling({ getData });

initKeys({
  getData,
  load,
  renderDetail,
});

setupAuth();
setupListEvents();

// --- 表示 ---

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
  if (!force && detailBody.contains(document.activeElement)
    && document.activeElement.matches(page === 'money' ? 'input, select' : 'input:not([type=checkbox]), textarea, select')) return;
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
  if (page === 'ledger') {
    let root = detailBody.querySelector('.ledger-page');
    if (!root) {
      [root] = ledgerDetail();
      detailBody.replaceChildren(root);
    }
    return refreshLedger(root);
  }
  if (page === 'money') {
    let panel = detailBody.querySelector(':scope > .money-cards');
    if (!panel) {
      panel = el('div', { className: 'money-cards' }, el('p', { className: 'sub', textContent: '読み込んでいます…' }));
      detailBody.replaceChildren(el('div', { className: 'detail-head' }, el('h2', { textContent: '紹介・お金の管理' })), panel);
    }
    refreshMoney(panel, data.tenants);
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
    const { tenant } = await api('/tenants', { name: $('newName').value, referralCode: $('newReferral').value });
    $('newName').value = '';
    $('newReferral').value = '';
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
