import fs from 'node:fs';
import path from 'node:path';

export const liveKey = 'rai' + 'kone';

export function writeRentalOpsFixture(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'reservation_policy.mjs'), `export const YEN_PER_DIAMOND = 0.75;
export function reportedYen(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function diamondsToYen(value) {
  const d = reportedYen(value);
  return d === null ? null : Math.floor(d * YEN_PER_DIAMOND);
}
export function recordRevenueYen(record) {
  const yen = reportedYen(record?.revenueYen);
  return yen !== null ? yen : diamondsToYen(record?.revenueDiamonds);
}
export function shareAmountYen(revenueYen) {
  return Math.floor(Number(revenueYen) * 0.10);
}
`);
  fs.writeFileSync(path.join(dir, 'service.mjs'), `export function neverHandedOver(reservation) {
  return Boolean(reservation?.prepareFailedAt) && !reservation?.preparedAt;
}
`);
}

export function writeStreamers(file, streamers) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ next: streamers.length + 1, streamers }, null, 2));
}

export function writeRentalState(dir, { reservations = [], usage = [] }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'reservations.json'), JSON.stringify({ reservations }, null, 2));
  fs.writeFileSync(path.join(dir, 'usage.jsonl'), usage.map((row) => JSON.stringify(row)).join('\n') + (usage.length ? '\n' : ''));
}

export function rentalSession(id, userId, extra = {}) {
  return {
    kind: 'session',
    sessionId: id,
    reservationId: id,
    userId,
    userName: `user-${userId}`,
    startedAt: '2026-11-10T10:00:00.000Z',
    endedAt: '2026-11-10T11:00:00.000Z',
    minutes: 60,
    ...extra,
  };
}

export function rentalReservation(id, userId, extra = {}) {
  return {
    id,
    userId,
    userName: `user-${userId}`,
    status: 'done',
    start: '2026-11-10T10:00:00.000Z',
    end: '2026-11-10T11:00:00.000Z',
    startedAt: '2026-11-10T10:00:00.000Z',
    preparedAt: '2026-11-10T10:00:00.000Z',
    ...extra,
  };
}
