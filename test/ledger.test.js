import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ledger, monthInTokyo, sourceAmountsByKey } from '../src/ledger.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ledger-'));
const at = '2026-11-10T12:00:00.000Z';

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
