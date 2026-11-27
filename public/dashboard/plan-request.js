// プランの申し込みの部品（「Plus にする」「Pro にする」「解約する（次の更新をしない）」）。
// ホームの「プラン」と、その他のウィジェットの鍵つきカードの両方から使う。申し込んだら「確認中」を出す。
// 鍵つきカードを押した瞬間から、2回押せば申し込みが終わるようにする（上げたい気持ちが一番強いときに迷わせない）。

import { fmt } from '/widgets/lib/overlay.js';
import { api } from './common.js';

export const PLAN_REQUEST_SENT = 'plan-request-sent';

const node = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null));
  return n;
};
const pressable = (text, className, onClick) => {
  const b = node('button', { type: 'button', className: `${className} pressable`, textContent: text });
  b.addEventListener('click', onClick);
  return b;
};

function priceText(option) {
  if (!option.priceYen) return '';
  return `${fmt(option.priceYen)}円／月${option.draft ? '・仮の値段' : ''}`;
}

const dayText = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : '';
};

/** 確認中の1件を1行の文にする */
export function pendingText(request) {
  const what = request.type === 'cancel' ? '解約（次の更新をしない）' : `${request.planLabel} の申し込み`;
  return `確認中: ${what}（${dayText(request.at)}に受けました）。LuL が確かめたら、ここに出ます`;
}

/** 申し込みの返事を、何が起きたかの文にする。二重に押したときは、まとめたことを伝える */
export function sentText(result) {
  if (result.merged) return `同じ申し込みがもう確認中なので、1件にまとめました（${result.request.count}回押されています）。そのままお待ちください`;
  if (result.request.type === 'cancel') return '解約を受けました。確認中です。支払った日までは、今のまま使えます';
  return `${result.request.planLabel} の申し込みを受けました。確認中です`;
}

/**
 * 申し込みを送る。返事には新しい /api/me が入っているので、画面はそれで描き直す
 * （app.js と editor.js が PLAN_REQUEST_SENT を受けて「確認中」を出す）。
 */
export async function sendPlanRequest(body) {
  const result = await api('/api/me/plan-request', body);
  window.dispatchEvent(new CustomEvent(PLAN_REQUEST_SENT, { detail: result }));
  return result;
}

export const pendingFor = (state, type, plan = null) =>
  (state?.pending ?? []).find((row) => row.type === type && (type === 'cancel' || row.plan === plan)) ?? null;

/**
 * 1つの申し込みの確かめ欄: 払い方の案内（plans.json の paymentNote）と「○○を申し込む」「やめる」。
 * onClose はやめたとき・送れたときに呼ぶ（送れたときは返事を渡す）。
 */
export function requestConfirm({ state, type, option = null, paidUntil = '', onClose = () => {} }) {
  const note = node('p', { className: 'plan-request-note', role: 'status' });
  const lead = type === 'cancel'
    ? `次の更新をしません。${paidUntil ? `${paidUntil} までは` : '支払った日までは'}今のまま使えます。そのあとは無料のプランで続けられます`
    : `${option.label}プラン${priceText(option) ? `（${priceText(option)}）` : ''}を申し込みます。LuL が確かめてから使えるようになります`;
  const send = pressable(type === 'cancel' ? '解約を申し込む' : `${option.label}を申し込む`, 'btn primary', async () => {
    send.disabled = true;
    try {
      const result = await sendPlanRequest(type === 'cancel' ? { type } : { type, plan: option.id });
      note.textContent = sentText(result);
      onClose(result);
    } catch (err) {
      note.textContent = err.message;
      note.classList.add('error');
      send.disabled = false;
    }
  });
  return node('div', { className: 'plan-request-box' },
    node('p', { className: 'plan-request-lead', textContent: lead }),
    state?.paymentNote ? node('p', { className: 'plan-request-pay', textContent: state.paymentNote }) : null,
    node('div', { className: 'plan-request-actions' }, send, pressable('やめる', 'btn', () => onClose(null))),
    note,
  );
}

/**
 * ホームの「プラン」に出す申し込みの欄。確認中のものは「確認中」、まだのプランは「○○にする」のボタン。
 * 押すとその場で確かめ欄が開き、もう1回押すと申し込みが終わる。
 */
export function planRequestNodes(me) {
  const state = me?.planRequest;
  if (!state) return [];
  const out = (state.pending ?? []).map((row) => node('p', { className: 'plan-request-pending', textContent: pendingText(row) }));
  const slot = node('div', { className: 'plan-request-slot' });
  const open = (args) => slot.replaceChildren(requestConfirm({ state, paidUntil: me.plan?.paidUntil ?? '', ...args, onClose: (result) => { if (!result) slot.replaceChildren(); } }));
  const buttons = [];
  for (const option of state.options ?? []) {
    if (pendingFor(state, 'upgrade', option.id)) continue;
    buttons.push(pressable(`${option.label}にする${priceText(option) ? `（${priceText(option)}）` : ''}`, 'btn', () => open({ type: 'upgrade', option })));
  }
  if (state.canCancel && !pendingFor(state, 'cancel')) buttons.push(pressable('解約する（次の更新をしない）', 'text-btn', () => open({ type: 'cancel' })));
  if (buttons.length) out.push(node('div', { className: 'plan-request-actions' }, ...buttons));
  out.push(slot);
  if (state.error) out.push(node('p', { className: 'plan-request-note error', textContent: state.error }));
  return out;
}
