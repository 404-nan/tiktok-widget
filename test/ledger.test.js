import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ledger, monthInTokyo, sourceAmountsByKey } from '../src/ledger.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ledger-'));
const at = '2026-11-10T12:00:00.000Z';
const cashTotals = ({ received, owed, paid, balance }) => [received, owed, paid, balance];

function charge(ledger, amount = 1000, key = 'test:charge') {
  return ledger.append({
    kind: 'accrual',
    streamerId: 's1',
    signedAmountYen: amount,
    at,
    period: { month: '2026-11' },
    source: { system: 'manual', key, evidenceHash: null },
    note: 'テスト発生',
  });
}

test('同じ clientRequestId の集金を2回送っても1行だけで、残高は二重に減らない', () => {
  const ledger = new Ledger({ dir: tmp() });
  charge(ledger, 1000);
  const first = ledger.recordCollection({ streamerId: 's1', amountYen: 400, collectedAt: at, method: 'paypay', clientRequestId: 'req-1' });
  const second = ledger.recordCollection({ streamerId: 's1', amountYen: 400, collectedAt: at, method: 'paypay', clientRequestId: 'req-1' });
  assert.equal(second.id, first.id);
  assert.equal(second.duplicate, true);
  assert.equal(ledger.entries().length, 2);
  assert.equal(ledger.balance('s1').balanceYen, 600);
});

test('部分集金は古い発生からFIFOで配分し、残りは未集金のまま残る', () => {
  const ledger = new Ledger({ dir: tmp() });
  const older = charge(ledger, 600, 'test:older');
  const newer = charge(ledger, 400, 'test:newer');
  const collection = ledger.recordCollection({ streamerId: 's1', amountYen: 700, collectedAt: at, method: 'bank', clientRequestId: 'req-fifo' });
  assert.deepEqual(collection.allocations, [
    { targetId: older.id, amountYen: 600 },
    { targetId: newer.id, amountYen: 100 },
  ]);
  const breakdown = ledger.paymentBreakdown('s1');
  assert.equal(breakdown.find((row) => row.id === older.id).status, 'paid');
  assert.equal(breakdown.find((row) => row.id === newer.id).status, 'partial');
  assert.equal(ledger.balance('s1').balanceYen, 300);
});

test('前回集金からの累計は、集金より後の発生・調整・取り消しだけを数える', () => {
  const ledger = new Ledger({ dir: tmp() });
  charge(ledger, 1000);
  ledger.recordCollection({ streamerId: 's1', amountYen: 1000, collectedAt: at, method: 'cash', clientRequestId: 'req-full' });
  ledger.recordAdjustment({ streamerId: 's1', signedAmountYen: 300, reason: '追加請求', at: '2026-11-11T00:00:00.000Z', clientRequestId: 'adj-1' });
  assert.equal(ledger.balance('s1').sinceLastCollectionYen, 300);
  assert.equal(ledger.balance('s1').balanceYen, 300);
});

test('さかのぼって集金を記録しても実際の前回集金とその後の増分を保つ', () => {
  const ledger = new Ledger({ dir: tmp() });
  charge(ledger, 1000);
  const latest = ledger.recordCollection({ streamerId: 's1', amountYen: 200, collectedAt: '2026-11-12T00:00:00Z', clientRequestId: 'latest' });
  ledger.recordAdjustment({ streamerId: 's1', signedAmountYen: 300, reason: '追加', at: '2026-11-13T00:00:00Z' });
  ledger.recordCollection({ streamerId: 's1', amountYen: 100, collectedAt: '2026-11-11T00:00:00Z', clientRequestId: 'older' });
  assert.equal(ledger.balance('s1').lastCollection.id, latest.id);
  assert.equal(ledger.balance('s1').sinceLastCollectionYen, 300);
});

test('取り消しは元行を消さず逆符号を足し、残高だけ元に戻る', () => {
  const ledger = new Ledger({ dir: tmp() });
  const original = ledger.recordAdjustment({ streamerId: 's1', signedAmountYen: 500, reason: '追加請求', at, clientRequestId: 'adj-rev' });
  const reversal = ledger.reverseEntry(original.id, { reason: '入力間違い', clientRequestId: 'rev-1' });
  assert.equal(reversal.kind, 'reversal');
  assert.equal(reversal.signedAmountYen, -500);
  assert.equal(ledger.entries().some((entry) => entry.id === original.id), true);
  assert.equal(ledger.balance('s1').balanceYen, 0);
  const retry = ledger.reverseEntry(original.id, { reason: '入力間違い', clientRequestId: 'rev-1' });
  assert.equal(retry.id, reversal.id);
  assert.equal(retry.duplicate, true);
  assert.throws(() => ledger.reverseEntry(original.id, { reason: 'もう一度', clientRequestId: 'rev-2' }), /すでに取り消し/);
});


test('集金そのものを取り消すと、配分済みの発生も未集金へ戻る', () => {
  const ledger = new Ledger({ dir: tmp() });
  const original = charge(ledger, 100, 'test:reverse-collection');
  const collection = ledger.recordCollection({ streamerId: 's1', amountYen: 100, collectedAt: at, method: 'cash', clientRequestId: 'pay-rev' });
  assert.equal(ledger.paymentBreakdown('s1').find((row) => row.id === original.id).status, 'paid');
  ledger.reverseEntry(collection.id, { reason: '入金確認の間違い' });
  assert.equal(ledger.balance('s1').balanceYen, 100);
  assert.equal(ledger.paymentBreakdown('s1').find((row) => row.id === original.id).status, 'unpaid');
});

test('集金を取り消しても、取り消した金額を前回集金からの増分には加えない', () => {
  const ledger = new Ledger({ dir: tmp(), now: () => Date.parse('2026-11-14T00:00:00Z') });
  charge(ledger, 1000);
  const valid = ledger.recordCollection({ streamerId: 's1', amountYen: 200, collectedAt: '2026-11-11T00:00:00Z', clientRequestId: 'valid' });
  ledger.recordAdjustment({ streamerId: 's1', signedAmountYen: 300, reason: '追加', at: '2026-11-12T00:00:00Z' });
  const invalid = ledger.recordCollection({ streamerId: 's1', amountYen: 100, collectedAt: '2026-11-13T00:00:00Z', clientRequestId: 'invalid' });
  ledger.reverseEntry(invalid.id, { reason: '誤記' });
  assert.equal(ledger.balance('s1').lastCollection.id, valid.id);
  assert.equal(ledger.balance('s1').sinceLastCollectionYen, 300);
  assert.equal(ledger.balance('s1').balanceYen, 1100);
});

test('壊れた entries.jsonl は0円として読まず、同期停止のエラーにする', () => {
  const dir = tmp();
  const ledger = new Ledger({ dir });
  charge(ledger, 100);
  fs.appendFileSync(path.join(dir, 'entries.jsonl'), '{"kind":"accrual"\n');
  assert.throws(() => ledger.entries(), /壊れています/);
});

test('JSTの月境界では、翌日の朝まで前の月に入れない', () => {
  assert.equal(monthInTokyo(Date.parse('2026-11-30T14:59:59.000Z')), '2026-11');
  assert.equal(monthInTokyo(Date.parse('2026-11-30T15:00:00.000Z')), '2026-12');
  assert.equal(monthInTokyo(Date.parse('2026-11-30T23:30:00.000Z')), '2026-12');
});

test('import-state が消えても entries の source.key から同期済み金額を再構成できる', () => {
  const ledger = new Ledger({ dir: tmp() });
  const first = charge(ledger, 100, 'rental:r1');
  ledger.append({
    kind: 'adjustment',
    streamerId: 's1',
    signedAmountYen: 50,
    at,
    period: { month: '2026-11' },
    source: { system: 'rental', key: 'rental:r1', evidenceHash: null },
    reason: '訂正差分',
  });
  assert.equal(sourceAmountsByKey(ledger.entries()).get('rental:r1'), 150);
  assert.equal(first.seq, 1);
  const state = ledger.readImportState();
  ledger.writeImportState({ ...state, sources: { 'rental:r1': { lastShareYen: 150 } } });
  assert.equal(ledger.readImportState().sources['rental:r1'].lastShareYen, 150);
});

test('確認済みの初回入金と報酬は既存の集金と同じ JSONL に1回ずつ追記し、集計は混ぜない', () => {
  const dir = tmp();
  const ledger = new Ledger({ dir });
  charge(ledger, 1000);
  ledger.recordCollection({ streamerId: 's1', amountYen: 400, clientRequestId: 'one' });
  const form = { tenantId: 'b', referrerId: 'a', amount: 2981, reference: 'one', paidOn: '2026-10-01', confirmed: true };
  assert.deepEqual(cashTotals(ledger.subscriptionCash()), [0, 0, 0, 0]);
  assert.throws(() => ledger.recordSubscriptionPayment({ ...form, confirmed: false }), /確認して/);
  for (const amount of [0, -1, 1.5, '2981', Infinity, 100_000_001]) {
    assert.throws(() => ledger.recordSubscriptionPayment({ ...form, amount }), /整数/);
  }
  assert.deepEqual(cashTotals(ledger.subscriptionCash()), [0, 0, 0, 0]);
  const first = ledger.recordSubscriptionPayment(form);
  assert.deepEqual(first.reward, { referrerId: 'a', amount: 1490, paidAt: null });
  assert.throws(() => ledger.recordSubscriptionPayment({ ...form, reference: ' one ' }), /記録済み/);
  assert.deepEqual(cashTotals(ledger.subscriptionCash()), [2981, 1490, 0, 2981]);
  assert.equal(ledger.recordSubscriptionPayment({ ...form, amount: 4000, reference: 'two' }).reward, null);
  assert.equal(ledger.recordSubscriptionPayment({ ...form, tenantId: 'c', referrerId: null, amount: 1000, reference: 'three' }).reward, null);
  assert.ok(ledger.recordReferralPayout(first.id, 1490).reward.paidAt);
  assert.throws(() => ledger.recordReferralPayout(first.id, 1490), /支払い済み/);
  assert.deepEqual(ledger.entries().map(({ kind }) => kind), ['accrual', 'collection', 'subscription-payment', 'subscription-payment', 'subscription-payment', 'referral-payout']);
  assert.equal(ledger.balance('s1').balanceYen, 600);
  assert.deepEqual(cashTotals(new Ledger({ dir }).subscriptionCash()), [7981, 0, 1490, 6491]);
});

test('残高不足または台帳ロック中の支払いは追記しない', () => {
  const ledger = new Ledger({ dir: tmp() });
  const form = { amount: 1000, reference: 'first', tenantId: 'b', referrerId: 'a', paidOn: '2026-10-01', confirmed: true };
  const first = ledger.recordSubscriptionPayment(form);
  const pending = ledger.recordSubscriptionPayment({ ...form, tenantId: 'c', reference: 'pending' });
  ledger.recordReferralPayout(first.id, 500);
  const rows = ledger.entries();
  rows.at(-1).signedAmountYen = -1800;
  const fixture = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  fs.writeFileSync(ledger.file, fixture);
  assert.equal(ledger.subscriptionCash().balance, 200);
  assert.throws(() => ledger.recordReferralPayout(pending.id, 500), /残高が足りません/);
  fs.closeSync(fs.openSync(ledger.lockFile, 'wx'));
  assert.throws(() => ledger.recordReferralPayout(pending.id, 500), /別の処理/);
  assert.throws(() => ledger.recordSubscriptionPayment({ ...form, reference: 'locked' }), /別の処理/);
  assert.equal(fs.readFileSync(ledger.file, 'utf8'), fixture);
});

test('入金の訂正と取り消しを追記し、報酬を再計算して照合番号を再利用できる', () => {
  const dir = tmp();
  const ledger = new Ledger({ dir });
  charge(ledger);
  const form = { amount: 1000, reference: 'first', tenantId: 'b', referrerId: 'a', paidOn: '2026-10-01', confirmed: true };
  const first = ledger.recordSubscriptionPayment(form);
  const second = ledger.recordSubscriptionPayment({ ...form, amount: 2000, reference: 'second', paidOn: '2026-11-01' });
  const reason = '記録した金額が違った';
  assert.throws(() => ledger.voidSubscriptionPayment(first.id, {}), /理由が必要/);
  assert.throws(() => ledger.correctSubscriptionPayment(first.id, { amount: 0, reason }), /整数/);
  assert.equal(ledger.correctSubscriptionPayment(first.id, { amount: 1401, reason }).reward.amount, 700);
  assert.deepEqual(cashTotals(ledger.subscriptionCash()), [3401, 700, 0, 3401]);
  ledger.recordReferralPayout(first.id, 700);
  assert.equal(ledger.correctSubscriptionPayment(first.id, { amount: 1600, reason }).reward.due, 100);
  assert.deepEqual(cashTotals(ledger.subscriptionCash()), [3600, 100, 700, 2900]);
  ledger.recordReferralPayout(first.id, 100);
  assert.throws(() => ledger.recordReferralPayout(first.id, 100), /支払い済み/);
  ledger.voidSubscriptionPayment(first.id, { reason });
  assert.throws(() => ledger.voidSubscriptionPayment(first.id, { reason }), /有効な月額入金/);
  const reloaded = new Ledger({ dir });
  assert.equal(reloaded.subscriptionCash().payments[0].id, second.id);
  assert.equal(reloaded.subscriptionCash().payments[0].reward.due, 200);
  assert.deepEqual(cashTotals(reloaded.subscriptionCash()), [2000, 200, 800, 1200]);
  assert.deepEqual(reloaded.entries().filter(({ targetId, kind }) => targetId === first.id && ['adjustment', 'reversal'].includes(kind))
    .map(({ kind, signedAmountYen, reason: why }) => [kind, signedAmountYen, why]),
  [['adjustment', 401, reason], ['adjustment', 199, reason], ['reversal', -1600, reason]]);
  assert.equal(sourceAmountsByKey(reloaded.entries()).has('first'), false);
  assert.equal(reloaded.balance('s1').balanceYen, 1000);
  assert.equal(reloaded.recordSubscriptionPayment(form).reward.amount, 500);
});

test('初回入金を再登録しても、入金日と支払い済み報酬を元に報酬を計算する', () => {
  const dir = tmp();
  const ledger = new Ledger({ dir });
  const form = { amount: 1000, reference: 'first', tenantId: 'b', referrerId: 'a', paidOn: '2026-10-01', confirmed: true };
  const first = ledger.recordSubscriptionPayment(form);
  const second = ledger.recordSubscriptionPayment({ ...form, amount: 2000, reference: 'second', paidOn: '2026-11-01' });
  ledger.recordReferralPayout(first.id, 500);
  ledger.voidSubscriptionPayment(first.id, { reason: '初回の金額を誤記' });
  const replacement = ledger.recordSubscriptionPayment({ ...form, amount: 1200 });
  assert.notEqual(replacement.id, first.id);
  assert.deepEqual(replacement.reward, { referrerId: 'a', amount: 600, paidAt: null, due: 100 });
  const reloaded = new Ledger({ dir });
  assert.equal(reloaded.subscriptionCash().payments.find(({ id }) => id === second.id).reward, null);
  assert.deepEqual(cashTotals(reloaded.subscriptionCash()), [3200, 100, 500, 2700]);
  reloaded.recordReferralPayout(replacement.id, 100);
  assert.deepEqual(cashTotals(reloaded.subscriptionCash()), [3200, 0, 600, 2600]);
});

test('配信者を取り違えた入金を再登録すると、正しい配信者の初回は入金日で決まる', () => {
  const ledger = new Ledger({ dir: tmp(), now: () => Date.parse(at) });
  const form = { amount: 1300, reference: 'oct', tenantId: 'wrong', paidOn: '2026-10-01', confirmed: true };
  for (const paidOn of [undefined, '2026-02-30', '2026-10-01T00:00:00Z']) {
    assert.throws(() => ledger.recordSubscriptionPayment({ ...form, paidOn }), /正しい入金日/);
  }
  const wrong = ledger.recordSubscriptionPayment(form);
  const later = ledger.recordSubscriptionPayment({ ...form, tenantId: 'right', referrerId: 'a', amount: 3000, reference: 'nov', paidOn: '2026-11-01' });
  ledger.voidSubscriptionPayment(wrong.id, { reason: '配信者の取り違え' });
  const corrected = ledger.recordSubscriptionPayment({ ...form, tenantId: 'right', referrerId: 'a' });
  assert.equal(corrected.reward.amount, 650);
  assert.equal(corrected.paidOn, '2026-10-01');
  assert.equal(corrected.confirmedAt, at);
  assert.equal(ledger.entries().at(-1).period.month, '2026-10');
  assert.equal(ledger.subscriptionCash().payments.find(({ id }) => id === later.id).reward, null);
});

test('同じ入金日の初回入金は、再登録しても照合番号の元の順番を保つ', () => {
  const dir = tmp();
  const ledger = new Ledger({ dir });
  const form = { amount: 1000, reference: 'first', tenantId: 'b', referrerId: 'a', paidOn: '2026-10-01', confirmed: true };
  const first = ledger.recordSubscriptionPayment(form);
  const second = ledger.recordSubscriptionPayment({ ...form, amount: 2200, reference: 'second' });
  ledger.recordReferralPayout(first.id, 500);
  ledger.voidSubscriptionPayment(first.id, { reason: '再登録' });
  const replacement = ledger.recordSubscriptionPayment(form);
  assert.equal(replacement.reward.amount, 500);
  assert.ok(replacement.reward.paidAt);
  const cash = new Ledger({ dir }).subscriptionCash();
  assert.equal(cash.payments.find(({ id }) => id === second.id).reward, null);
  assert.deepEqual(cashTotals(cash), [3200, 0, 500, 2700]);
});

test('すでに支払った報酬で赤字になる訂正と取り消しは追記しない', () => {
  const ledger = new Ledger({ dir: tmp() });
  const first = ledger.recordSubscriptionPayment({ amount: 1000, reference: 'first', tenantId: 'b', referrerId: 'a', paidOn: '2026-10-01', confirmed: true });
  ledger.recordReferralPayout(first.id, 500);
  const before = ledger.entries();
  const reason = '誤記';
  assert.throws(() => ledger.voidSubscriptionPayment(first.id, { reason }), /残高が足りません/);
  assert.throws(() => ledger.correctSubscriptionPayment(first.id, { amount: 499, reason }), /残高が足りません/);
  assert.deepEqual(ledger.entries(), before);
  assert.equal(ledger.correctSubscriptionPayment(first.id, { amount: 500, reason }).reward.amount, 250);
  assert.deepEqual(cashTotals(ledger.subscriptionCash()), [500, 0, 500, 0]);
});

test('取り消せない入金も金額を変えずに入金日を訂正し、初回報酬を再計算できる', () => {
  const dir = tmp();
  const ledger = new Ledger({ dir, now: () => Date.parse(at) });
  const form = { tenantId: 'b', referrerId: 'a', reference: 'first', amount: 1000, paidOn: '2026-09-01', confirmed: true };
  const first = ledger.recordSubscriptionPayment(form);
  const second = ledger.recordSubscriptionPayment({ ...form, reference: 'second', amount: 200, paidOn: '2026-10-01' });
  ledger.recordReferralPayout(first.id, 500);
  const reason = '日付を誤記';
  assert.throws(() => ledger.voidSubscriptionPayment(first.id, { reason }), /残高が足りません/);
  assert.throws(() => ledger.correctSubscriptionPayment(first.id, { paidOn: '2026-02-30', reason }), /正しい入金日/);
  assert.throws(() => ledger.correctSubscriptionPayment(first.id, { paidOn: '2026-11-01', amount: 1, reason }), /別々に訂正/);
  assert.equal(ledger.entries().length, 3);
  const corrected = ledger.correctSubscriptionPayment(first.id, { paidOn: '2026-11-01', reason });
  assert.deepEqual([corrected.paidOn, corrected.amount, corrected.reward], ['2026-11-01', 1000, null]);
  const reloaded = new Ledger({ dir });
  const cash = reloaded.subscriptionCash();
  assert.deepEqual(cashTotals(cash), [1200, 0, 500, 700]);
  assert.equal(cash.payments.find(({ id }) => id === second.id).reward.amount, 100);
  assert.deepEqual(cash.overpayments, [{ tenantId: 'b', referrerId: 'a', amount: 400 }]);
  const row = reloaded.entries().at(-1);
  assert.deepEqual([row.kind, row.signedAmountYen, row.targetId, row.period.month, row.createdAt, row.reason],
    ['adjustment', 0, first.id, '2026-11', at, reason]);
  assert.equal(reloaded.entries()[0].period.month, '2026-09');
});

test('入金を減額・取り消ししても実際の支払い行が残り、過払いを計算する', () => {
  const ledger = new Ledger({ dir: tmp(), now: () => Date.parse(at) });
  const form = { amount: 1500, reference: 'first', tenantId: 'b', referrerId: 'a', paidOn: '2026-10-01', confirmed: true };
  const first = ledger.recordSubscriptionPayment(form);
  ledger.recordSubscriptionPayment({ ...form, tenantId: 'c', referrerId: null, reference: 'other' });
  ledger.recordReferralPayout(first.id, 750);
  const payout = ledger.entries().at(-1);
  const reason = '入金の誤記';
  ledger.correctSubscriptionPayment(first.id, { amount: 1000, reason });
  const corrected = ledger.subscriptionCash();
  assert.deepEqual(corrected.payouts, [
    { id: payout.id, paymentId: first.id, tenantId: 'b', referrerId: 'a', amount: 750, paidAt: at },
  ]);
  assert.deepEqual(corrected.overpayments, [{ tenantId: 'b', referrerId: 'a', amount: 250 }]);
  ledger.voidSubscriptionPayment(first.id, { reason });
  const voided = ledger.subscriptionCash();
  assert.equal(voided.payments.some(({ id }) => id === first.id), false);
  assert.deepEqual(voided.payouts, corrected.payouts);
  assert.deepEqual(voided.overpayments, [{ tenantId: 'b', referrerId: 'a', amount: 750 }]);
  assert.deepEqual(cashTotals(voided), [1500, 0, 750, 750]);
});
