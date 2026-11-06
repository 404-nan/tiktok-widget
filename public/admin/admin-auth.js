// 管理画面の合言葉: ログイン画面の表示、ログイン、ログアウト。
// admin.js が initAuth() で遅延バインディングを渡す。

import { $, store } from '/dashboard/common.js';

let _setToken, _load, _renderShell, _renderDetail, _setPage, _setSelected, _clearChecked;

export function initAuth({ setToken, load, renderShell, renderDetail, setPage, setSelected, clearChecked }) {
  _setToken = setToken;
  _load = load;
  _renderShell = renderShell;
  _renderDetail = renderDetail;
  _setPage = setPage;
  _setSelected = setSelected;
  _clearChecked = clearChecked;
}

export function showLogin(text = '') {
  $('loginPanel').hidden = false;
  $('main').hidden = true;
  $('logoutBtn').hidden = true;
  $('loginMessage').textContent = text;
}

export function setupAuth() {
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    _setToken($('tokenInput').value.trim());
    await _load();
  });
  $('logoutBtn').addEventListener('click', () => {
    _setToken('');
    showLogin();
  });

  $('sideLogoutBtn').addEventListener('click', () => $('logoutBtn').click());
  $('sideThemeBtn').addEventListener('click', () => $('themeBtn').click());
  document.querySelectorAll('.admin-side .side-item[data-page]').forEach((b) => b.addEventListener('click', () => {
    _setPage(b.dataset.page);
    store.set('adminPage', b.dataset.page);
    if (b.dataset.page !== 'tenants') {
      _setSelected(null);
      _clearChecked();
    }
    _renderShell();
    _renderDetail(true);
  }));
}
