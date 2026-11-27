// 管理者だけが紹介、確認済みの入金、紹介報酬の支払いを記録できることを HTTP で確かめる。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { localScenario, startHostedServer } from '../helpers/guard-harness.js';

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
  const form = { tenantId: invitee.id, amount: 4980, reference: 'confirmed-01' };
  await request(400, '/money/payments', form);
  await request(400, '/money/payments', { ...form, tenantId: 'unknown', confirmed: true });
  await request(400, '/money/payments/missing/payout', {});
  assert.equal((await request(200, '/money')).received, 0);
  const { payment } = await request(200, '/money/payments', { ...form, confirmed: true });
  assert.equal(payment.reward.amount, 2490);
  await request(400, '/money/payments', { ...form, confirmed: true });
  assert.match((await request(400, `/tenants/${invitee.id}/referral`, { code })).error, /初回入金/);
  const pending = await request(200, '/money');
  assert.deepEqual([pending.received, pending.owed, pending.paid, pending.balance], [4980, 2490, 0, 4980]);
  await request(200, `/money/payments/${payment.id}/payout`, {});
  await request(400, `/money/payments/${payment.id}/payout`, {});
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
  const extra = { ...form, amount: 1000, reference: 'confirmed-02', confirmed: true };
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
