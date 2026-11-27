// 管理画面の課金: お知らせ、プラン・支払い、配信者ごとの課金カード。
// admin.js が initBilling() で遅延バインディングを渡す。

import { $, copyText } from '/dashboard/common.js';
import { el, button, api, message, act } from './admin-parts.js';

let _getData;

export function initBilling({ getData }) {
  _getData = getData;
}

// --- お知らせ ---

export function notesDetail() {
  const data = _getData();
  const form = el('form', { className: 'note-form stack' });
  const title = el('input', { placeholder: 'タイトル', required: true });
  const body = el('textarea', { rows: 5, placeholder: '本文', required: true });
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10), required: true });
  const url = el('input', { placeholder: '/help/#roulette や https://…（なくてもよい）' });
  form.append(el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'タイトル' }), title), el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '本文' }), body), el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '日付' }), date), el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'くわしいページ' }), url), el('div', { className: 'btn-row' }, button('追加', () => form.requestSubmit(), { cls: 'btn primary' })));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    act(() => api('/notes', { title: title.value, body: body.value, date: date.value, url: url.value }), 'お知らせを追加しました')();
  });
  const list = data.notes ?? [];
  const rows = list.map((note) => {
    const editTitle = el('input', { value: note.title });
    const editBody = el('textarea', { rows: 4, value: note.body });
    const editDate = el('input', { type: 'date', value: note.date });
    const editUrl = el('input', { value: note.url ?? '', placeholder: 'くわしいページ（なくてもよい）' });
    return el('article', { className: 'admin-note' }, el('div', { className: 'field-row' }, editTitle, editDate), editBody, editUrl, el('div', { className: 'btn-row' }, button('保存', act(() => api(`/notes/${note.id}`, { title: editTitle.value, body: editBody.value, date: editDate.value, url: editUrl.value }, 'PATCH'), 'お知らせを保存しました'), { cls: 'btn primary' }), button('削除', () => { if (confirm('このお知らせを削除しますか？')) act(() => api(`/notes/${note.id}`, undefined, 'DELETE'), 'お知らせを削除しました')(); }, { cls: 'chip' })));
  });
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: '更新のお知らせ' }), el('p', { className: 'sub', textContent: '配信者のダッシュボードの上に表示します。OBS の画面には表示しません。' })), el('section', { className: 'form-card' }, el('h3', { textContent: 'お知らせを追加' }), form), el('div', { className: 'admin-note-list' }, ...rows)];
}

// --- 課金の定数 ---

const FLAG_ALIASES = {
  bosses: ['bosses', 'boss'],
  gacha: ['gacha'],
  omikuji: ['omikuji'],
  mediaAlerts: ['mediaAlerts', 'media'],
  giftSounds: ['giftSounds', 'sounds'],
  roulettes: ['roulettes'],
  rouletteLinks: ['rouletteLinks'],
};

const BILLING_STATUS = [['trial', 'お試し'], ['active', '支払い済み'], ['past_due', '支払い待ち'], ['suspended', '停止']];
const BILLING_LABELS = { status: '状態', trialEndsAt: 'お試しの終わり', paidUntil: '支払った日まで', plan: 'プラン', note: 'メモ' };
const PLAN_TEXT = { pct5: '5%プラン', flat2000: '2000円プラン', flat5000: '5000円プラン', percent5: '5%プラン', yen2000: '2000円プラン', yen5000: '5000円プラン' };

export function billingValueText(key, value) {
  if (value == null || value === '') return 'なし';
  if (key === 'status') {
    for (let i = 0; i < BILLING_STATUS.length; i++) if (BILLING_STATUS[i][0] === value) return BILLING_STATUS[i][1];
  }
  if (key === 'plan') return PLAN_TEXT[value] || String(value);
  return String(value);
}

export function billingHistory(billing) {
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

// --- 配信者の課金カード ---

export function tenantBillingCard(t, plans) {
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
    if (!confirm('この紹介コードを適用します。紹介報酬は初回の入金を確認した後に発生します。')) return;
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

// --- プラン・支払い全体 ---

export function billingDetail() {
  const data = _getData();
  const settings = data.billing ?? { enforcement: null, effective: false, premiumFeatures: [], plans: [] };
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
