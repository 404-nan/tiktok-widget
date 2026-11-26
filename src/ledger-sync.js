// 既存の貸出データを読み、entries.jsonl に無い発生と訂正差分だけを台帳へ足す。
// source.key と import-state、entries の再構成を両方見て、同期の retry で二重計上しない。

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Ledger, sourceAmountsByKey } from './ledger.js';
import { readStreamers, readRentalState, rentalAccrualCandidates, readExcludedStreamers, defaultStreamersFile, defaultRentalStateDir, defaultRentalOpsDir, SourceError } from './ledger-sources.js';

export async function loadRentalOps(dir) {
  try {
    const policy = await import(pathToFileURL(path.join(dir, 'reservation_policy.mjs')).href);
    const service = await import(pathToFileURL(path.join(dir, 'service.mjs')).href);
    if (typeof policy.recordRevenueYen !== 'function' || typeof policy.shareAmountYen !== 'function' || typeof service.neverHandedOver !== 'function') {
      throw new Error('必要な関数がありません');
    }
    return { recordRevenueYen: policy.recordRevenueYen, shareAmountYen: policy.shareAmountYen, neverHandedOver: service.neverHandedOver };
  } catch (err) {
    throw new SourceError(`貸出の計算元を読めません: ${err.message}`, { kind: 'rental-ops-missing' });
  }
}

export async function syncLedgerSources({
  ledger,
  streamersFile = defaultStreamersFile(),
  numbersFile = undefined,
  rentalStateDir = defaultRentalStateDir(),
  rentalOpsDir = defaultRentalOpsDir(),
  startAt = process.env.TW_LEDGER_START_AT ?? null,
  now = () => Date.now(),
} = {}) {
  if (!(ledger instanceof Ledger)) throw new SourceError('台帳が必要です', { kind: 'ledger-missing' });
  const warnings = [];
  const streamersData = readStreamers(streamersFile);
  if (streamersData.missing) warnings.push({ kind: 'streamers-missing', count: 0 });
  const byRental = new Map();
  for (const person of streamersData.streamers) for (const userId of person.rental) byRental.set(String(userId), person);
  const rentalState = readRentalState(rentalStateDir);
  if (rentalState.missing?.length) {
    warnings.push({ kind: 'rental-state-missing', files: rentalState.missing, dir: rentalStateDir });
    return { ok: false, added: { accrual: 0, adjustment: 0 }, warnings, stale: true };
  }
  const ops = await loadRentalOps(rentalOpsDir);
  const excludeStreamers = readExcludedStreamers(numbersFile);
  const { candidates, warnings: rentalWarnings } = rentalAccrualCandidates(rentalState, { ...ops, startAt, excludeStreamers });
  warnings.push(...rentalWarnings);

  const entries = ledger.entries();
  const derived = sourceAmountsByKey(entries);
  const state = ledger.readImportState();
  const added = { accrual: 0, adjustment: 0 };
  const nowIso = new Date(now()).toISOString();

  for (const candidate of candidates) {
    const owner = byRental.get(candidate.userId);
    if (!owner) {
      warnings.push({ kind: 'rental-streamer-missing', key: candidate.key, userId: candidate.userId });
      continue;
    }
    const known = derived.has(candidate.key) ? derived.get(candidate.key) : state.sources?.[candidate.key]?.lastShareYen;
    const current = candidate.shareYen;
    if (known == null) {
      if (current !== 0) {
        ledger.append({
          kind: 'accrual',
          streamerId: owner.id,
          signedAmountYen: current,
          at: candidate.at,
          period: candidate.period,
          source: { system: 'rental', key: candidate.key, evidenceHash: candidate.evidenceHash },
          gross: { revenueYen: candidate.revenueYen, revenueDiamonds: candidate.revenueDiamonds },
          fee: { kind: 'percent', rate: 0.10 },
          note: '妨害マイクラ貸出の申告売上から',
          createdBy: 'ledger-sync',
        });
        added.accrual += 1;
      }
    } else if (known !== current) {
      const diff = current - known;
      if (diff !== 0) {
        ledger.append({
          kind: 'adjustment',
          streamerId: owner.id,
          signedAmountYen: diff,
          at: nowIso,
          period: candidate.period,
          source: { system: 'rental', key: candidate.key, evidenceHash: candidate.evidenceHash },
          gross: { revenueYen: candidate.revenueYen, revenueDiamonds: candidate.revenueDiamonds },
          fee: { kind: 'percent', rate: 0.10 },
          reason: '貸出の売上申告が変わりました',
          createdBy: 'ledger-sync',
        });
        added.adjustment += 1;
      }
    }
    state.sources[candidate.key] = {
      lastShareYen: current,
      lastRevenueYen: candidate.revenueYen,
      lastEvidenceHash: candidate.evidenceHash,
      lastSeenAt: nowIso,
    };
  }
  ledger.writeImportState(state);
  return { ok: !warnings.some((w) => w.kind === 'rental-state-missing'), added, warnings, stale: warnings.some((w) => w.kind === 'rental-state-missing') };
}
