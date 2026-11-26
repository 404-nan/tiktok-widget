// 集金台帳が読む既存データ。streamers.json、貸出 usage.jsonl / reservations.json、ライコネ sessions を読むだけで書かない。
// 壊れた元データを 0円として扱わず、同期を止められるように strict に読む。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { evidenceHash, monthInTokyo, timeMs, LIVE_SERVICE_KEY } from './ledger.js';

export { LIVE_SERVICE_KEY };

export class SourceError extends Error {
  constructor(message, { kind = 'source-error' } = {}) {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
  }
}

export const defaultStreamersFile = () => process.env.TW_STREAMERS || path.join(os.homedir(), '.local/state/lul/streamers.json');
export const defaultRentalStateDir = () => {
  if (process.env.TW_RENTAL_STATE) return process.env.TW_RENTAL_STATE;
  const stateDir = path.join(os.homedir(), '.local/state/mc-rental');
  const shareDir = path.join(os.homedir(), '.local/share/mc-rental');
  if (!fs.existsSync(path.join(stateDir, 'usage.jsonl')) && fs.existsSync(path.join(shareDir, 'usage.jsonl'))) return shareDir;
  return stateDir;
};
export const defaultRentalOpsDir = () => {
  if (process.env.TW_RENTAL_OPS_DIR) return process.env.TW_RENTAL_OPS_DIR;
  const configured = path.join(os.homedir(), 'lul-rental-ops');
  const checkout = path.join(os.homedir(), 'work/rental');
  if (!fs.existsSync(path.join(configured, 'reservation_policy.mjs')) && fs.existsSync(path.join(checkout, 'reservation_policy.mjs'))) return checkout;
  return configured;
};

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw new SourceError(`${label} が読めません: ${err.message}`, { kind: `${label}-corrupt` });
  }
}

export function readJsonlStrict(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw new SourceError(`${label} が読めません: ${err.message}`, { kind: `${label}-corrupt` });
  }
  const rows = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try { rows.push(JSON.parse(line)); }
    catch { throw new SourceError(`${label} の ${i + 1} 行目が壊れています`, { kind: `${label}-corrupt` }); }
  }
  return rows;
}

export function readStreamers(file = defaultStreamersFile()) {
  const data = readJson(file, 'streamers.json');
  if (data == null) return { streamers: [], missing: true, file };
  const rows = Array.isArray(data) ? data : data.streamers;
  if (!Array.isArray(rows)) throw new SourceError('streamers.json の形が違います', { kind: 'streamers-corrupt' });
  return {
    file,
    missing: false,
    streamers: rows.filter((row) => row && /^s\d+$/.test(row.id)).map((row) => ({
      id: row.id,
      name: String(row.name ?? row.id),
      [LIVE_SERVICE_KEY]: Array.isArray(row[LIVE_SERVICE_KEY]) ? row[LIVE_SERVICE_KEY].map(String) : [],
      rental: Array.isArray(row.rental) ? row.rental.map(String) : [],
      firstSeen: row.firstSeen ?? null,
      lastUsed: row.lastUsed ?? null,
      notes: Array.isArray(row.notes) ? row.notes : [],
    })),
  };
}


export function readExcludedStreamers(file = process.env.TW_NUMBERS_CONFIG || path.join(os.homedir(), '.config/lul/numbers.json')) {
  const fromEnv = String(process.env.TW_LEDGER_EXCLUDE ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  const data = readJson(file, 'numbers.json');
  const rows = Array.isArray(data?.excludeStreamers) ? data.excludeStreamers.map(String) : [];
  return new Set([...rows, ...fromEnv]);
}

function isExcluded(row, excluded) {
  return excluded?.has(String(row.session.userId ?? '')) || excluded?.has(String(row.session.userName ?? ''));
}

export function readRentalState(dir = defaultRentalStateDir()) {
  const usageFile = path.join(dir, 'usage.jsonl');
  const reservationsFile = path.join(dir, 'reservations.json');
  const eventsRaw = readJsonlStrict(usageFile, 'usage.jsonl');
  const events = eventsRaw ?? [];
  const reservationsData = readJson(reservationsFile, 'reservations.json');
  const missing = [
    ...(eventsRaw == null ? ['usage.jsonl'] : []),
    ...(reservationsData == null ? ['reservations.json'] : []),
  ];
  const reservations = Array.isArray(reservationsData?.reservations) ? reservationsData.reservations : [];
  const reservationById = new Map(reservations.map((row) => [String(row.id ?? ''), row]).filter(([id]) => id));
  const groups = new Map();
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const key = String(event.sessionId || event.reservationId || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, session: null, revenues: [], gifts: [] });
    const group = groups.get(key);
    if (event.kind === 'session') group.session = { ...(group.session ?? {}), ...event };
    if (event.kind === 'revenue') group.revenues.push(event);
    if (event.kind === 'gifts') group.gifts.push(event);
  }
  return { dir, missing, events, reservations, reservationById, groups };
}

function rentalRowBase(state, group, neverHandedOver) {
  const session = group.session;
  if (!session) return null;
  const reservation = state.reservationById.get(String(session.reservationId || session.sessionId || group.key)) ?? null;
  if (reservation?.status === 'cancelled' || session.status === 'cancelled') return null;
  if (reservation?.status === 'no_show' || session.status === 'no_show') return null;
  if (reservation?.billable === false || session.billable === false) return null;
  if (reservation && neverHandedOver?.(reservation)) return null;
  const endMs = timeMs(session.endedAt ?? session.end);
  if (endMs == null) return null;
  const latestRevenue = group.revenues.at(-1) ?? null;
  const latestGifts = group.gifts.at(-1) ?? null;
  return { key: group.key, session, reservation, endMs, latestRevenue, latestGifts };
}

export function rentalRows(state, { neverHandedOver = () => false } = {}) {
  return [...state.groups.values()].map((group) => rentalRowBase(state, group, neverHandedOver)).filter(Boolean);
}

export function rentalAccrualCandidates(state, { recordRevenueYen, shareAmountYen, neverHandedOver = () => false, startAt = null, excludeStreamers = new Set() } = {}) {
  if (typeof recordRevenueYen !== 'function' || typeof shareAmountYen !== 'function') throw new SourceError('貸出の計算元を読めません', { kind: 'rental-ops-missing' });
  const startMs = startAt == null ? null : timeMs(startAt);
  const candidates = [];
  const warnings = [];
  for (const row of rentalRows(state, { neverHandedOver })) {
    if (isExcluded(row, excludeStreamers)) continue;
    if (startMs != null && row.endMs < startMs) continue;
    const key = `rental:${row.key}`;
    if (!row.session.userId) {
      warnings.push({ kind: 'rental-user-missing', key });
      continue;
    }
    if (!row.latestRevenue) {
      warnings.push({ kind: 'rental-unreported', key, userId: row.session.userId, endedAt: new Date(row.endMs).toISOString() });
      continue;
    }
    const revenueYen = recordRevenueYen(row.latestRevenue);
    if (revenueYen == null) {
      warnings.push({ kind: 'rental-unreported', key, userId: row.session.userId, endedAt: new Date(row.endMs).toISOString() });
      continue;
    }
    const shareYen = shareAmountYen(revenueYen);
    candidates.push({
      key,
      userId: String(row.session.userId),
      shareYen,
      revenueYen,
      revenueDiamonds: row.latestRevenue.revenueDiamonds ?? null,
      at: new Date(row.endMs).toISOString(),
      period: { month: monthInTokyo(row.endMs) },
      evidenceHash: evidenceHash({ session: row.session, revenue: row.latestRevenue }),
      minutes: Number(row.session.minutes) || 0,
    });
  }
  return { candidates, warnings };
}

function emptyRentalMonth() {
  return { sessions: 0, minutes: 0, reportedDiamonds: 0, revenueYen: 0, chargeYen: 0, unreportedSessions: 0, giftCoinsReference: 0, hasReportedRevenue: false };
}

export function rentalMonthlySales(state, { recordRevenueYen, shareAmountYen, neverHandedOver = () => false, excludeStreamers = new Set() } = {}) {
  const out = new Map();
  for (const row of rentalRows(state, { neverHandedOver })) {
    if (isExcluded(row, excludeStreamers)) continue;
    const userId = String(row.session.userId ?? '');
    if (!userId) continue;
    const month = monthInTokyo(row.endMs);
    if (!out.has(userId)) out.set(userId, new Map());
    const months = out.get(userId);
    if (!months.has(month)) months.set(month, emptyRentalMonth());
    const bucket = months.get(month);
    bucket.sessions += 1;
    bucket.minutes += Number(row.session.minutes) || 0;
    bucket.giftCoinsReference += Number(row.latestGifts?.giftCoins) || 0;
    const revenueYen = row.latestRevenue ? recordRevenueYen(row.latestRevenue) : null;
    if (revenueYen == null) {
      bucket.unreportedSessions += 1;
    } else {
      bucket.hasReportedRevenue = true;
      bucket.revenueYen += revenueYen;
      bucket.reportedDiamonds += Number(row.latestRevenue.revenueDiamonds) || 0;
      bucket.chargeYen += shareAmountYen(revenueYen);
    }
  }
  return out;
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange({ months = 6, now = Date.now() } = {}) {
  const current = monthInTokyo(now);
  const count = Math.max(1, Math.min(24, Math.floor(Number(months)) || 6));
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)));
}

export function readLiveMonthlySales({ dataDir, tenantIds = [], months = 6, now = Date.now() } = {}) {
  const keys = monthRange({ months, now });
  const buckets = new Map(keys.map((month) => [month, { month, sessions: 0, giftCount: 0, giftCoins: 0, uniqueGifters: 0, confirmedRevenueYen: null, chargeYen: 0 }]));
  for (const tenantId of tenantIds.map(String)) {
    const dir = path.join(dataDir, 'tenants', tenantId, 'sessions');
    let files = [];
    try { files = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && !name.endsWith('.report.json')); }
    catch (err) { if (err?.code !== 'ENOENT') throw new SourceError(`ライコネ sessions が読めません: ${err.message}`, { kind: `${LIVE_SERVICE_KEY}-sessions-corrupt` }); }
    for (const file of files) {
      let row;
      try { row = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
      catch (err) { throw new SourceError(`ライコネ sessions/${file} が壊れています`, { kind: `${LIVE_SERVICE_KEY}-sessions-corrupt` }); }
      if (row.demo === true || row.endedAt == null) continue;
      const start = timeMs(row.startedAt);
      if (start == null) continue;
      const month = monthInTokyo(start);
      if (!buckets.has(month)) continue;
      const bucket = buckets.get(month);
      bucket.sessions += 1;
      bucket.giftCount += Number(row.totals?.gifts) || 0;
      bucket.giftCoins += Number(row.totals?.coins) || 0;
      bucket.uniqueGifters += Number(row.totals?.uniqueGifters) || 0;
    }
  }
  return keys.map((month) => buckets.get(month));
}
