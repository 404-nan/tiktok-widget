// 管理画面向けの集金台帳サービス。streamers.json の人ごとに、台帳残高・前回集金からの増分・
// ライコネ/貸出の月次売上（コインは参考値のまま）をまとめて返す。

import path from 'node:path';
import { Ledger, LedgerError, monthInTokyo } from './ledger.js';
import { readStreamers, readRentalState, rentalMonthlySales, readLiveMonthlySales, monthRange, readExcludedStreamers, LIVE_SERVICE_KEY, defaultStreamersFile, defaultRentalStateDir, defaultRentalOpsDir, SourceError } from './ledger-sources.js';
import { syncLedgerSources, loadRentalOps } from './ledger-sync.js';

export class LedgerServiceError extends Error {
  constructor(message, { status = 400, kind = 'ledger-service-error' } = {}) {
    super(message);
    this.name = 'LedgerServiceError';
    this.status = status;
    this.kind = kind;
  }
}

const zeroRental = () => ({ sessions: 0, minutes: 0, reportedDiamonds: 0, revenueYen: 0, chargeYen: 0, unreportedSessions: 0, giftCoinsReference: 0, hasReportedRevenue: false });
const zeroLive = (month) => ({ month, sessions: 0, giftCount: 0, giftCoins: 0, uniqueGifters: 0, confirmedRevenueYen: null, chargeYen: 0 });

export function createLedgerService({ dataDir, ledgerDir = process.env.TW_LEDGER_DIR || null, streamersFile = defaultStreamersFile(), rentalStateDir = defaultRentalStateDir(), rentalOpsDir = defaultRentalOpsDir(), now = () => Date.now() } = {}) {
  if (!dataDir) throw new LedgerServiceError('データの置き場が必要です', { status: 500 });
  const ledger = new Ledger({ dir: ledgerDir || path.join(dataDir, 'ledger') });

  function people() {
    return readStreamers(streamersFile).streamers;
  }
  function person(id) {
    const found = people().find((row) => row.id === id);
    if (!found) throw new LedgerServiceError('その利用者は streamers.json にありません', { status: 404, kind: 'streamer-not-found' });
    return found;
  }
  function ledgerTotals(id, month) {
    const entries = ledger.entries().filter((entry) => entry.streamerId === id);
    return {
      chargeYen: entries.filter((entry) => (entry.kind === 'accrual' || entry.kind === 'adjustment') && entry.period?.month === month).reduce((sum, entry) => sum + entry.signedAmountYen, 0),
      collectedYen: entries.filter((entry) => entry.kind === 'collection' && entry.period?.month === month).reduce((sum, entry) => sum - entry.signedAmountYen, 0),
    };
  }

  async function salesBook({ months = 6 } = {}) {
    const keys = monthRange({ months, now: now() });
    const sourceWarnings = [];
    let stale = false;
    let rentalSales = new Map();
    try {
      const ops = await loadRentalOps(rentalOpsDir);
      const rentalState = readRentalState(rentalStateDir);
      if (rentalState.missing?.length) {
        stale = true;
        sourceWarnings.push({ kind: 'rental-state-missing', files: rentalState.missing, dir: rentalStateDir });
      }
      rentalSales = rentalMonthlySales(rentalState, { ...ops, excludeStreamers: readExcludedStreamers() });
    } catch (err) {
      stale = true;
      sourceWarnings.push({ kind: err.kind ?? 'rental-source-error', message: err.message });
    }
    const streamerData = readStreamers(streamersFile);
    if (streamerData.missing) {
      stale = true;
      sourceWarnings.push({ kind: 'streamers-missing', file: streamersFile });
    }
    const rows = new Map();
    for (const p of streamerData.streamers) {
      const rentalByMonth = new Map(keys.map((month) => [month, zeroRental()]));
      for (const userId of p.rental) {
        for (const [month, value] of rentalSales.get(String(userId)) ?? new Map()) {
          if (!rentalByMonth.has(month)) continue;
          const target = rentalByMonth.get(month);
          for (const key of ['sessions', 'minutes', 'reportedDiamonds', 'revenueYen', 'chargeYen', 'unreportedSessions', 'giftCoinsReference']) target[key] += value[key];
          target.hasReportedRevenue ||= value.hasReportedRevenue;
        }
      }
      let liveRows;
      try {
        liveRows = readLiveMonthlySales({ dataDir, tenantIds: p[LIVE_SERVICE_KEY] ?? p.live ?? [], months, now: now() });
      } catch (err) {
        stale = true;
        sourceWarnings.push({ kind: err.kind ?? `${LIVE_SERVICE_KEY}-source-error`, message: err.message });
        liveRows = keys.map(zeroLive);
      }
      rows.set(p.id, keys.map((month) => {
        const rental = rentalByMonth.get(month) ?? zeroRental();
        const live = liveRows.find((row) => row.month === month) ?? zeroLive(month);
        return {
          month,
          rental,
          [LIVE_SERVICE_KEY]: live,
          salesYenKnown: rental.hasReportedRevenue ? rental.revenueYen + (live.confirmedRevenueYen ?? 0) : live.confirmedRevenueYen,
          giftCoinsReference: rental.giftCoinsReference + live.giftCoins,
        };
      }));
    }
    return { rows, stale, warnings: sourceWarnings };
  }

  function decorate(p, monthly) {
    const balance = ledger.balance(p.id);
    const month = monthInTokyo(now());
    const totals = ledgerTotals(p.id, month);
    const monthSales = monthly.find((row) => row.month === month) ?? monthly.at(-1) ?? null;
    const warnings = [];
    if (!(p[LIVE_SERVICE_KEY] ?? p.live ?? []).length || !p.rental.length) warnings.push({ kind: 'streamer-unlinked' });
    if (monthSales?.rental.unreportedSessions) warnings.push({ kind: 'rental-unreported', count: monthSales.rental.unreportedSessions });
    return {
      ...p,
      balance,
      ...balance,
      month: { month, chargeYen: totals.chargeYen, collectedYen: totals.collectedYen, salesYenKnown: monthSales?.salesYenKnown ?? null, giftCoinsReference: monthSales?.giftCoinsReference ?? 0, [LIVE_SERVICE_KEY]: monthSales?.[LIVE_SERVICE_KEY] ?? null, rental: monthSales?.rental ?? null },
      warnings,
    };
  }

  return {
    ledger,
    paths: { ledgerDir: ledger.dir, streamersFile, rentalStateDir, rentalOpsDir },
    sync: (options = {}) => syncLedgerSources({ ledger, streamersFile, rentalStateDir, rentalOpsDir, ...options }),
    async summary({ months = 6 } = {}) {
      const book = await salesBook({ months });
      const streamers = people().map((p) => decorate(p, book.rows.get(p.id) ?? []));
      return {
        generatedAt: new Date(now()).toISOString(),
        stale: book.stale,
        warnings: book.warnings,
        totals: {
          uncollectedYen: streamers.reduce((sum, row) => sum + row.uncollectedYen, 0),
          sinceLastCollectionYen: streamers.reduce((sum, row) => sum + row.sinceLastCollectionYen, 0),
          monthChargeYen: streamers.reduce((sum, row) => sum + row.month.chargeYen, 0),
          monthCollectedYen: streamers.reduce((sum, row) => sum + row.month.collectedYen, 0),
          unreportedCount: streamers.reduce((sum, row) => sum + (row.month.rental?.unreportedSessions ?? 0), 0),
          unlinkedCount: streamers.filter((row) => row.warnings.some((w) => w.kind === 'streamer-unlinked')).length,
        },
        streamers,
      };
    },
    async detail(id, { months = 6 } = {}) {
      const p = person(id);
      const book = await salesBook({ months });
      const monthly = book.rows.get(id) ?? [];
      return { streamer: p, ...decorate(p, monthly), sales: monthly, entries: ledger.entriesPage(id, { limit: 20 }).items, stale: book.stale, warnings: book.warnings };
    },
    async sales(id, { months = 12 } = {}) {
      person(id);
      const book = await salesBook({ months });
      return { streamerId: id, stale: book.stale, warnings: book.warnings, months: book.rows.get(id) ?? [] };
    },
    entries(id, options = {}) {
      person(id);
      return ledger.entriesPage(id, options);
    },
    recordCollection(input) {
      person(input.streamerId);
      return ledger.recordCollection(input);
    },
    recordAdjustment(input) {
      person(input.streamerId);
      return ledger.recordAdjustment(input);
    },
    reverseEntry(id, input) {
      return ledger.reverseEntry(id, input);
    },
  };
}
