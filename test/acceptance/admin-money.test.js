// 管理者だけが紹介、確認済みの入金、紹介報酬の支払いを記録できることを HTTP で確かめる。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { localScenario, startHostedServer } from '../helpers/guard-harness.js';

function renderMoney(money, tenants) {
  const source = fs.readFileSync(new URL('../../public/admin/admin-money.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/m, '').replace('export function moneyDetail', 'function moneyDetail');
  const nodes = [];
  const context = {
    el(tag, props, ...children) {
      const node = { tag, ...props, children, append: (...items) => children.push(...items), addEventListener() {} };
      nodes.push(node);
      return node;
    },
    button(text) { return context.el('button', { textContent: text }); },
    Option: class Option {
      constructor(text, value) { Object.assign(this, { text, value }); }
    },
  };
  vm.runInNewContext(source, context);
  context.moneyDetail(money, tenants);
  return nodes;
}

test('名前が同じ配信者も入金先の選択肢は ID で見分けられる', () => {
  const nodes = renderMoney(
    { received: 0, owed: 0, paid: 0, balance: 0, draftPlans: [], referrals: [], payments: [], payouts: [], overpayments: [] },
    [{ name: '同じ名前', id: 'first' }, { name: '同じ名前', id: 'second' }],
  );
  const select = nodes.find(({ tag }) => tag === 'select');
  assert.deepEqual(select.children.map(({ text, value }) => [text, value]), [
    ['配信者を選ぶ', ''], ['同じ名前（first）', 'first'], ['同じ名前（second）', 'second'],
  ]);
});

test('入金を減額または取り消しても、支払った金額と要回収額を別に表示する', () => {
  const base = {
    received: 1000, owed: 0, paid: 750, balance: 250, draftPlans: [], referrals: [],
    payouts: [{ tenantId: 'b', referrerId: 'a', amount: 750, paidAt: '2026-11-20T12:00:00Z' }],
  };
  const tenants = [{ id: 'a', name: '紹介元' }, { id: 'b', name: '紹介先' }];
  const corrected = [{ tenantId: 'b', amount: 1000, reward: { amount: 500, paidAt: base.payouts[0].paidAt } }];
  for (const [payments, amount] of [[corrected, 250], [[], 750]]) {
    const nodes = renderMoney({ ...base, payments, overpayments: [{ tenantId: 'b', referrerId: 'a', amount }] }, tenants);
    assert.ok(nodes.some(({ textContent }) => textContent === '紹介元：750円'));
    assert.ok(nodes.some(({ textContent }) => textContent === `過払い・要回収：紹介元（紹介した相手：紹介先） ${amount}円`));
    assert.ok(!nodes.some(({ textContent }) => textContent === '紹介元：500円'));
  }
});

test('管理 API は紹介元と実際のお金の動きを記録し、未確認・重複・権限なしを拒む', async (t) => {
  const { env } = localScenario();
  const ledgerDir = path.join(env.TW_DATA, 'ledger');
  const token = 'money-test-admin-token';
  const { child, ready } = await startHostedServer({ env: { ...env, TW_LEDGER_DIR: ledgerDir, TW_ADMIN_TOKEN: token, TW_RESUME_CONNECT: '0', TW_DRAFT_PLUS_YEN: '2980', TW_DRAFT_PRO_YEN: '5000' } });
  t.after(() => child.kill());
  let logs = '';
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const base = await ready;
  async function request(status, path, body, passphrase = token) {
    const res = await fetch(`${base}/admin/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(passphrase ? { 'x-admin-token': passphrase } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(json)}`);
    return json;
  }

  for (const [path, body] of [['/money'], ['/money/payments', {}], ['/money/payments/id/payout', {}]]) {
    await request(401, path, body, null);
  }
  await request(401, '/money', undefined, `é${token.slice(1)}`);
  const empty = await request(200, '/money');
  assert.equal(empty.received, 0);
  assert.equal(empty.balance, 0);
  assert.deepEqual(empty.draftPlans, [{ label: 'Plus', price: 2980 }, { label: 'Pro', price: 5000 }]);
  const { tenant: inviter } = await request(200, '/tenants', { name: '招待した人' });
  const { code } = await request(200, `/tenants/${inviter.id}/billing/code`, {});
  await request(400, '/tenants', { name: '無効', referralCode: 'no-such-code' });
  const { tenant: invitee } = await request(200, '/tenants', { name: '招待された人', referralCode: code });
  const { tenants } = await request(200, '/tenants');
  assert.equal(tenants.length, 2);

  const start = await request(200, '/money');
  assert.deepEqual(start.referrals, [{ tenantId: invitee.id, referrerId: inviter.id }]);
  assert.equal(start.owed, 0);
  assert.equal(invitee.billing.credit, 0);
  const form = { tenantId: invitee.id, amount: 4980, reference: 'confirmed-01', paidOn: '2026-10-01' };
  await request(400, '/money/payments', form);
  await request(400, '/money/payments', { ...form, tenantId: 'unknown', confirmed: true });
  await request(400, '/money/payments/missing/payout', {});
  assert.equal((await request(200, '/money')).received, 0);
  const { payment } = await request(200, '/money/payments', { ...form, confirmed: true });
  assert.equal(payment.reward.amount, 2490);
  assert.equal(payment.paidOn, form.paidOn);
  await request(400, '/money/payments', { ...form, confirmed: true });
  assert.match((await request(400, `/tenants/${invitee.id}/referral`, { code })).error, /初回入金/);
  const pending = await request(200, '/money');
  assert.deepEqual([pending.received, pending.owed, pending.paid, pending.balance], [4980, 2490, 0, 4980]);
  await request(409, `/money/payments/${payment.id}/payout`, {});
  await request(200, `/money/payments/${payment.id}/payout`, { confirmedAmount: 2490 });
  await request(400, `/money/payments/${payment.id}/payout`, { confirmedAmount: 2490 });
  const paid = await request(200, '/money');
  assert.deepEqual([paid.received, paid.owed, paid.paid, paid.balance], [4980, 0, 2490, 2490]);
  const file = path.join(ledgerDir, 'entries.jsonl');
  const before = fs.readFileSync(file, 'utf8');
  assert.deepEqual(before.trim().split('\n').map((line) => JSON.parse(line).kind), ['subscription-payment', 'referral-payout']);
  const billingPath = path.join(env.TW_DATA, 'billing.json');
  const oldSave = JSON.parse(fs.readFileSync(billingPath, 'utf8'));
  assert.equal(Object.hasOwn(oldSave, 'payments'), false);
  fs.writeFileSync(billingPath, JSON.stringify({ enforcement: true, accounts: oldSave.accounts }));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.match(logs, /adminGuard: 合言葉が違います/);
  assert.match(logs, /POST \/admin\/api\/money\/payments: 入金を確認してから記録してください/);
  assert.match(logs, /POST \/admin\/api\/money\/payments\/:id\/payout: その紹介報酬は支払い済みです/);
  const extra = { ...form, amount: 1000, reference: 'confirmed-02', paidOn: '2026-11-01', confirmed: true };
  const { payment: second } = await request(200, '/money/payments', extra);
  const changePath = `/money/payments/${second.id}`;
  await request(401, `${changePath}/correction`, {}, null);
  await request(401, `${changePath}/void`, {}, null);
  await request(400, `${changePath}/correction`, { amount: 2000 });
  const reason = '入力ミス';
  assert.equal((await request(200, `${changePath}/correction`, { amount: 2000, reason })).payment.amount, 2000);
  assert.equal((await request(200, '/money')).balance, 4490);
  await request(200, `${changePath}/void`, { reason });
  assert.equal((await request(200, '/money')).balance, 2490);
  await request(200, '/money/payments', extra);
});

test('入金額の訂正前に確認した報酬額では支払いを記録しない', async (t) => {
  const { env } = localScenario();
  const token = 'money-confirmation-test';
  const { child, ready } = await startHostedServer({ env: { ...env, TW_LEDGER_DIR: path.join(env.TW_DATA, 'ledger'), TW_ADMIN_TOKEN: token, TW_RESUME_CONNECT: '0' } });
  t.after(() => child.kill());
  const base = await ready;
  const post = (route, body) => fetch(`${base}/admin/api${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(body),
  });
  const { tenant: inviter } = await (await post('/tenants', { name: '紹介元' })).json();
  const { code } = await (await post(`/tenants/${inviter.id}/billing/code`, {})).json();
  const { tenant } = await (await post('/tenants', { name: '配信者', referralCode: code })).json();
  const { payment } = await (await post('/money/payments', { tenantId: tenant.id, amount: 1000, reference: 'old', paidOn: '2026-10-01', confirmed: true })).json();
  const route = `/money/payments/${payment.id}`;
  const corrected = await post(`${route}/correction`, { amount: 1500, reason: '入力ミス' });
  assert.equal(corrected.status, 200);
  const stale = await post(`${route}/payout`, { confirmedAmount: payment.reward.amount });
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /確認した金額/);
  const rows = fs.readFileSync(path.join(env.TW_DATA, 'ledger', 'entries.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(({ kind }) => kind), ['subscription-payment', 'adjustment']);
  assert.equal((await post(`${route}/payout`, { confirmedAmount: 750 })).status, 200);
});
