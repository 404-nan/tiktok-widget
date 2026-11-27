// 確認済みの入金、紹介元、受け取ったお金から支払う紹介報酬を管理する。

import { act, api, button, el } from './admin-parts.js';

const yen = (amount) => `${amount.toLocaleString('ja-JP')}円`;
const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tokyo' });
const p = (textContent) => el('p', { className: 'sub', textContent });
const field = (label, input) => el('label', { className: 'field' },
  el('span', { className: 'field-label', textContent: label }), input);
const card = (title, ...children) => el('section', { className: 'form-card' }, el('h3', { textContent: title }), ...children);

function paymentForm(tenants) {
  if (!tenants.length) return p('配信者を追加すると入金を記録できます。');
  const tenant = el('select', { required: true });
  tenant.append(new Option('配信者を選ぶ', ''));
  for (const { id, name } of tenants) tenant.append(new Option(`${name}（${id}）`, id));
  const amount = el('input', { type: 'number', min: '1', max: '100000000', step: '1', required: true });
  const paidOn = el('input', { type: 'date', required: true });
  const reference = el('input', { required: true, autocomplete: 'off' });
  const confirmed = el('input', { type: 'checkbox', required: true });
  const save = el('button', { type: 'submit', className: 'btn primary pressable', textContent: '確認済みの入金を記録' });
  const form = el('form', { className: 'note-form' },
    p('実際に受け取った月額料金と入金日を記録してください。照合番号は、同じ入金を二重に記録しないために使います。'),
    field('配信者', tenant), field('入金額（円）', amount), field('入金日（日本時間）', paidOn), field('入金の照合番号', reference),
    el('label', { className: 'row' }, confirmed, el('span', { textContent: '入金を確認しました' })),
    el('div', { className: 'btn-row' }, save));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    try {
      await act(async () => {
        await api('/money/payments', {
          tenantId: tenant.value, amount: amount.valueAsNumber, reference: reference.value, paidOn: paidOn.value, confirmed: confirmed.checked,
        });
        form.reset();
        if (form.contains(document.activeElement)) document.activeElement.blur();
      }, '入金を記録しました')();
    } finally {
      save.disabled = false;
    }
  });
  return form;
}

function paymentRow(payment, name) {
  const amount = el('input', { type: 'number', min: '1', max: '100000000', step: '1', required: true, value: payment.amount });
  const reason = el('input', { required: true, maxLength: 500 });
  const save = el('button', { type: 'submit', className: 'btn pressable', textContent: '金額を訂正' });
  const discard = button('入金記録を取り消す', async () => {
    if (!reason.reportValidity() || !confirm('この入金記録を取り消します。返金は行いません。')) return;
    await change('void', { reason: reason.value }, '入金記録を取り消しました');
  }, { cls: 'btn' });
  async function change(action, body, done) {
    if (save.disabled) return;
    save.disabled = discard.disabled = true;
    try {
      await act(() => api(`/money/payments/${payment.id}/${action}`, body), done)();
    } finally {
      save.disabled = discard.disabled = false;
    }
  }
  const form = el('form', { className: 'note-form' },
    field('正しい入金額（円）', amount), field('理由', reason), el('div', { className: 'btn-row' }, save, discard));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await change('correction', { amount: amount.valueAsNumber, reason: reason.value }, '入金額を訂正しました');
  });
  return el('details', { className: 'admin-note' },
    el('summary', { textContent: `${name(payment.tenantId)}：${yen(payment.amount)} ／ 入金日：${payment.paidOn} ／ 照合番号：${payment.reference}` }),
    form);
}

function payoutRow(payment, balance, name) {
  const { reward } = payment;
  const due = reward.due ?? reward.amount;
  const payout = button('支払いを記録', async () => {
    if (!confirm(`${name(reward.referrerId)}への ${yen(due)} の支払いを記録します。この画面から送金はしません。`)) return;
    payout.disabled = true;
    try {
      await act(() => api(`/money/payments/${payment.id}/payout`, { confirmedAmount: due }), '紹介報酬の支払いを記録しました')();
    } finally {
      payout.disabled = false;
    }
  }, { cls: 'btn' });
  return el('article', { className: 'admin-note' },
    el('strong', { textContent: `${name(reward.referrerId)}：${yen(reward.amount)}` }),
    p(`紹介した相手：${name(payment.tenantId)}`),
    reward.due ? p(`未払い分：${yen(due)}`) : null,
    reward.paidAt ? p(`支払い済み：${date.format(new Date(reward.paidAt))}`)
      : due > balance ? p('未払い・残高不足のため記録できません')
        : el('div', { className: 'btn-row' }, payout));
}

export function moneyDetail(money, tenants) {
  const names = new Map(tenants.map(({ id, name }) => [id, name]));
  const name = (id) => names.get(id) ?? `削除済みの配信者（${id}）`;
  const { received, owed, paid, balance, draftPlans, referrals, payments } = money;
  const rewards = payments.filter(({ reward }) => reward).reverse();
  return [
    card('お金の残高',
      p('一般公開までは無料です。ここでは入金と紹介報酬の支払いを記録するだけで、請求や送金はしません。'),
      p(`月額の案（未確定）：${draftPlans.map(({ label, price }) => `${label} ${yen(price)}`).join('、')}`),
      el('dl', { className: 'money-totals' }, ...[['受け取ったお金', received], ['未払いの紹介報酬', owed], ['支払い済みの紹介報酬', paid], ['残高（入金 − 支払い済み）', balance]]
        .flatMap(([label, value]) => [el('dt', { textContent: label }), el('dd', { textContent: yen(value) })])),
      balance < 0 ? p('残高が不足しています。紹介報酬の支払いは記録できません。') : null),
    card('紹介の記録',
      p('紹介した人への報酬は、紹介された人の初回の月額入金の50%です。1円未満は切り捨てます。'),
      ...(referrals.length ? referrals.map(({ tenantId, referrerId }) => p(`${name(referrerId)} → ${name(tenantId)}`)) : [p('紹介はまだありません。')])),
    card('受け取ったお金', paymentForm(tenants),
      ...(payments.length ? payments.slice().reverse().map((row) => paymentRow(row, name))
        : [p('入金の記録はまだありません。')])),
    card('紹介報酬', ...(rewards.length ? rewards.map((row) => payoutRow(row, balance, name)) : [p('紹介報酬はまだありません。')])),
  ];
}
