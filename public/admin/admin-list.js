// 管理画面の一覧: KPI、フィルター、配信者リスト。
// admin.js が initList() で遅延バインディングを渡す。

import { icon } from '/widgets/lib/overlay.js';
import { $, store } from '/dashboard/common.js';
import { el, left, dotClass, onText } from './admin-parts.js';

let _getData, _getSelected, _setSelected, _getChecked, _getFilter, _setFilter, _getSearch, _setSearch, _renderDetail;

export function initList({ getData, getSelected, setSelected, getChecked, getFilter, setFilter, getSearch, setSearch, renderDetail }) {
  _getData = getData;
  _getSelected = getSelected;
  _setSelected = setSelected;
  _getChecked = getChecked;
  _getFilter = getFilter;
  _setFilter = setFilter;
  _getSearch = getSearch;
  _setSearch = setSearch;
  _renderDetail = renderDetail;
}

const premiumKeys = () => Object.keys(_getData().features).filter((k) => _getData().features[k].premium);
export const premiumOn = (t) => premiumKeys().some((k) => t.access[k]?.on);

export function renderKpis() {
  const data = _getData();
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
  const data = _getData();
  const filter = _getFilter();
  const search = _getSearch();
  const f = FILTERS.find(([k]) => k === filter)?.[2] ?? (() => true);
  const q = search.trim().toLowerCase();
  return data.tenants
    .filter((t) => f(t) && (!q || t.name.toLowerCase().includes(q)))
    .sort((a, b) => (b.status.mode === 'live') - (a.status.mode === 'live') || a.name.localeCompare(b.name, 'ja'));
}

export function renderFilters() {
  const filter = _getFilter();
  const box = $('filters');
  box.replaceChildren(
    ...FILTERS.map(([k, label]) => {
      const b = el('button', { type: 'button', className: 'pressable', textContent: label });
      b.setAttribute('aria-selected', String(k === filter));
      b.addEventListener('click', () => {
        _setFilter(k);
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

function liveDetails(t) {
  if (t.status.mode !== 'live') return '';
  const name = t.name || t.status.username || '配信者';
  return `${name}・${t.status.elapsedMinutes ?? 0}分・視聴者 ${t.status.viewers ?? 0}人・コイン ${t.status.coins ?? 0}`;
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

function syncCheckAll() {
  const checked = _getChecked();
  const ids = visible().map((t) => t.id);
  const all = $('checkAll');
  const n = ids.filter((id) => checked.has(id)).length;
  all.checked = ids.length > 0 && n === ids.length;
  all.indeterminate = n > 0 && n < ids.length;
}

export function renderRows() {
  const data = _getData();
  const selected = _getSelected();
  const checked = _getChecked();
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
        _renderDetail();
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
        el('span', { className: 'name', textContent: t.name }, t.planRequests?.pending?.length ? el('span', { className: 'tag', textContent: '申し込み' }) : null),
        el('span', { className: `status ${cls}` }, el('i'), text, el('small', { className: 'tenant-note', textContent: liveDetails(t) || tenantNote(t) })),
        dots,
      );
      li.setAttribute('aria-selected', String(t.id === selected));
      li.addEventListener('click', () => {
        _setSelected(_getSelected() === t.id ? null : t.id);
        renderRows();
        _renderDetail();
      });
      return li;
    }),
  );
  const empty = $('empty');
  empty.hidden = list.length > 0;
  empty.textContent = data.tenants.length ? '当てはまる配信者はいません。' : 'まだ配信者がいません。「＋ 追加」から追加してください。';
  syncCheckAll();
}

export function setupListEvents() {
  $('checkAll').addEventListener('change', (e) => {
    const checked = _getChecked();
    for (const t of visible()) {
      if (e.target.checked) checked.add(t.id);
      else checked.delete(t.id);
    }
    renderRows();
    _renderDetail();
  });
  $('search').addEventListener('input', (e) => {
    _setSearch(e.target.value);
    renderRows();
  });
}
