import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ledger } from '../src/ledger.js';
import { createLedgerService } from '../src/ledger-service.js';
import { syncLedgerSources } from '../src/ledger-sync.js';
import { readLiveMonthlySales, readRentalState, rentalMonthlySales } from '../src/ledger-sources.js';
import { writeRentalOpsFixture, writeStreamers, writeRentalState, rentalSession, rentalReservation, liveKey } from './helpers/ledger-fixture.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ledger-src-'));

async function setup({ streamers = [{ id: 's1', name: '一人目', [liveKey]: [], rental: ['u1'] }], usage = [], reservations = [] } = {}) {
  const root = tmp();
  const ledger = new Ledger({ dir: path.join(root, 'ledger') });
  const streamersFile = path.join(root, 'streamers.json');
  const rentalStateDir = path.join(root, 'mc-state');
  const rentalOpsDir = path.join(root, 'rental-ops');
  writeStreamers(streamersFile, streamers);
  writeRentalState(rentalStateDir, { reservations, usage });
  writeRentalOpsFixture(rentalOpsDir);
  return { root, ledger, streamersFile, numbersFile: path.join(root, 'numbers.json'), rentalStateDir, rentalOpsDir };
}

test('取り消した請求や集金は元の月の集計に含めない', async () => {
  const s = await setup();
  const at = '2026-11-10T00:00:00.000Z';
  const service = createLedgerService({ ...s, dataDir: s.root, now: () => Date.parse(at) });
  const { ledger } = service;
  const charge = ledger.recordAdjustment({ streamerId: 's1', signedAmountYen: 1000, reason: '誤記', at });
  const collection = ledger.recordCollection({ streamerId: 's1', amountYen: 400, collectedAt: at, clientRequestId: 'monthly-test' });
  const totals = async () => {
    const { totals } = await service.summary();
    return [totals.monthChargeYen, totals.monthCollectedYen];
  };
  assert.deepEqual(await totals(), [1000, 400]);
  ledger.reverseEntry(charge.id, { reason: '誤記' });
  ledger.reverseEntry(collection.id, { reason: '誤記' });
  assert.deepEqual(await totals(), [0, 0]);
});

test('不正な同期開始日時では過去の貸出を台帳に追加しない', async () => {
  const s = await setup({
    usage: [rentalSession('r1', 'u1'), { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000 }],
    reservations: [rentalReservation('r1', 'u1')],
  });
  await assert.rejects(syncLedgerSources({ ...s, startAt: 'bad-date' }), { kind: 'rental-start-invalid' });
  assert.deepEqual(s.ledger.entries(), []);
});

test('貸出の申告は最初の10%だけ台帳化し、同じ sync を繰り返しても二重計上しない', async () => {
  const s = await setup({
    usage: [
      rentalSession('r1', 'u1'),
      { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000, reportedAt: '2026-11-10T12:00:00.000Z' },
    ],
    reservations: [rentalReservation('r1', 'u1')],
  });
  const first = await syncLedgerSources(s);
  assert.equal(first.ok, true);
  assert.equal(first.added.accrual, 1);
  assert.equal(s.ledger.entries().length, 1);
  assert.equal(s.ledger.entries()[0].signedAmountYen, 100);

  const second = await syncLedgerSources(s);
  assert.equal(second.added.accrual, 0);
  assert.equal(second.added.adjustment, 0);
  assert.equal(s.ledger.entries().length, 1);
  assert.equal(s.ledger.balance('s1').balanceYen, 100);
});

test('貸出の申告訂正は差分だけ足し、同じ値の重複では0行にする', async () => {
  const usage = [
    rentalSession('r1', 'u1'),
    { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000, reportedAt: '2026-11-10T12:00:00.000Z' },
  ];
  const s = await setup({ usage, reservations: [rentalReservation('r1', 'u1')] });
  await syncLedgerSources(s);
  fs.appendFileSync(path.join(s.rentalStateDir, 'usage.jsonl'), JSON.stringify({ kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1500, reportedAt: '2026-11-11T12:00:00.000Z' }) + '\n');
  const corrected = await syncLedgerSources(s);
  assert.equal(corrected.added.adjustment, 1);
  const rows = s.ledger.entries();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].kind, 'adjustment');
  assert.equal(rows[1].signedAmountYen, 50);
  const again = await syncLedgerSources(s);
  assert.equal(again.added.adjustment, 0);
  assert.equal(s.ledger.entries().length, 2);
  assert.equal(s.ledger.balance('s1').balanceYen, 150);
});

test('申告待ちの終了枠は0円に混ぜず warning になり、billable:false・cancelled・渡せなかった枠は除外する', async () => {
  const s = await setup({
    usage: [
      rentalSession('unreported', 'u1'),
      rentalSession('free', 'u1'),
      { kind: 'revenue', sessionId: 'free', reservationId: 'free', revenueYen: 1000 },
      rentalSession('cancelled', 'u1'),
      { kind: 'revenue', sessionId: 'cancelled', reservationId: 'cancelled', revenueYen: 1000 },
      rentalSession('failed', 'u1'),
      { kind: 'revenue', sessionId: 'failed', reservationId: 'failed', revenueYen: 1000 },
    ],
    reservations: [
      rentalReservation('unreported', 'u1'),
      rentalReservation('free', 'u1', { billable: false }),
      rentalReservation('cancelled', 'u1', { status: 'cancelled' }),
      rentalReservation('failed', 'u1', { preparedAt: null, prepareFailedAt: '2026-11-10T10:05:00.000Z' }),
    ],
  });
  const result = await syncLedgerSources(s);
  assert.equal(result.ok, true);
  assert.equal(result.added.accrual, 0);
  assert.equal(s.ledger.entries().length, 0);
  assert.deepEqual(result.warnings.filter((w) => w.kind === 'rental-unreported').map((w) => w.key), ['rental:unreported']);
});

test('配信者台帳に無い貸出 userId は誰の残高にも入れず warning にする', async () => {
  const s = await setup({
    streamers: [{ id: 's1', name: '一人目', [liveKey]: [], rental: ['other-user'] }],
    usage: [rentalSession('r1', 'u1'), { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000 }],
    reservations: [rentalReservation('r1', 'u1')],
  });
  const result = await syncLedgerSources(s);
  assert.equal(result.added.accrual, 0);
  assert.equal(s.ledger.entries().length, 0);
  assert.equal(result.warnings.some((w) => w.kind === 'rental-streamer-missing' && w.key === 'rental:r1'), true);
});

test('貸出の月次売上はJSTの終了月に入れ、申告ダイヤは円へ、コインは請求根拠にしない', async () => {
  const s = await setup({
    usage: [
      rentalSession('r1', 'u1', { startedAt: '2026-11-30T14:30:00.000Z', endedAt: '2026-11-30T15:30:00.000Z' }),
      { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueDiamonds: 2000 },
      { kind: 'gifts', sessionId: 'r1', reservationId: 'r1', giftCoins: 5000, giftCount: 20 },
    ],
    reservations: [rentalReservation('r1', 'u1')],
  });
  const state = readRentalState(s.rentalStateDir);
  const sales = rentalMonthlySales(state, { recordRevenueYen: (row) => row?.revenueYen ?? (row?.revenueDiamonds == null ? null : Math.floor(Number(row.revenueDiamonds) * 0.75)), shareAmountYen: (yen) => Math.floor(Number(yen) * 0.10) });
  assert.equal(sales.get('u1').get('2026-12').revenueYen, 1500);
  assert.equal(sales.get('u1').get('2026-12').chargeYen, 150);
  assert.equal(sales.get('u1').get('2026-12').giftCoinsReference, 5000);
  assert.equal(sales.get('u1').get('2026-11'), undefined);
});

test('ライコネの売上推移は demo と進行中を除き、コインを円に換算しない', () => {
  const root = tmp();
  const dir = path.join(root, 'data', 'tenants', 't1', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  const write = (name, row) => fs.writeFileSync(path.join(dir, name), JSON.stringify(row));
  write('live.json', { id: 'live', startedAt: Date.parse('2026-11-30T15:30:00.000Z'), endedAt: Date.parse('2026-11-30T16:30:00.000Z'), totals: { coins: 500, gifts: 5, uniqueGifters: 2 } });
  write('demo.json', { id: 'demo', demo: true, startedAt: Date.parse('2026-11-01T00:00:00.000Z'), endedAt: Date.parse('2026-11-01T01:00:00.000Z'), totals: { coins: 900, gifts: 9 } });
  write('ongoing.json', { id: 'ongoing', startedAt: Date.parse('2026-11-02T00:00:00.000Z'), endedAt: null, totals: { coins: 700, gifts: 7 } });
  const sales = readLiveMonthlySales({ dataDir: path.join(root, 'data'), tenantIds: ['t1'], months: 2, now: Date.parse('2026-12-03T00:00:00.000Z') });
  const december = sales.find((row) => row.month === '2026-12');
  const november = sales.find((row) => row.month === '2026-11');
  assert.equal(december.sessions, 1);
  assert.equal(december.giftCoins, 500);
  assert.equal(december.confirmedRevenueYen, null);
  assert.equal(november.sessions, 0);
  assert.equal(november.giftCoins, 0);
});

test('excludeStreamers の userId/userName は貸出の発生と売上推移から外す', async () => {
  const s = await setup({
    usage: [rentalSession('r1', 'u1', { userName: 'owner-name' }), { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000 }],
    reservations: [rentalReservation('r1', 'u1')],
  });
  process.env.TW_LEDGER_EXCLUDE = 'other-id,owner-name';
  try {
    const result = await syncLedgerSources(s);
    assert.equal(result.added.accrual, 0);
    assert.equal(s.ledger.entries().length, 0);
  } finally {
    delete process.env.TW_LEDGER_EXCLUDE;
  }
});

test('移行開始日より前に終わった枠は、後から sync しても発生させない', async () => {
  const s = await setup({
    usage: [rentalSession('r1', 'u1'), { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000 }],
    reservations: [rentalReservation('r1', 'u1')],
  });
  const result = await syncLedgerSources({ ...s, startAt: '2026-12-01T00:00:00.000Z' });
  assert.equal(result.added.accrual, 0);
  assert.equal(s.ledger.entries().length, 0);
});

test('reservations.json が無いときは、分からない枠を台帳化せず同期を止める', async () => {
  const s = await setup({
    usage: [rentalSession('r1', 'u1'), { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000 }],
    reservations: [rentalReservation('r1', 'u1')],
  });
  fs.unlinkSync(path.join(s.rentalStateDir, 'reservations.json'));
  const result = await syncLedgerSources(s);
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  assert.equal(s.ledger.entries().length, 0);
});
