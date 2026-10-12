// マイクラ貸し出しの状態を読むだけの橋渡し。
// 貸し出し側のファイルは書き換えず、書きかけ・壊れた状態は前回の結果を使う。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ACTIVE_RENTAL_STATUSES = new Set(['tentative', 'confirmed', 'live']);
const DEFAULT_DIR = path.join(os.homedir(), '.local', 'state', 'mc-rental');
const cleanHandle = (value) => {
  const handle = String(value ?? '').trim().replace(/^@/, '');
  return handle || null;
};
const timeOf = (value) => {
  const time = Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? time : null;
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function makeSnapshot(dir, now = Date.now()) {
  if (!fs.existsSync(dir)) return { slots: [], now: null, next: null };
  const reservations = readJson(path.join(dir, 'reservations.json')).reservations;
  const rawAccounts = readJson(path.join(dir, 'accounts.json'));
  // 実物は userId をキーにしたオブジェクト。配列の形も読めるようにしておく。
  const accounts = Array.isArray(rawAccounts) ? rawAccounts : Object.values(rawAccounts ?? {});
  // サーバーのファイルも一緒に読む。今回は住所を画面へ出さないが、貸し出し状態の組として確認する。
  readJson(path.join(dir, 'servers.json'));
  const byUser = new Map(accounts.map((a) => [String(a?.userId ?? ''), cleanHandle(a?.handle)]));
  const slots = (Array.isArray(reservations) ? reservations : [])
    .map((r) => {
      const start = timeOf(r?.start);
      const end = timeOf(r?.end);
      if (!start || !end || end <= start || !ACTIVE_RENTAL_STATUSES.has(r?.status)) return null;
      return { id: String(r.id ?? ''), start, end, handle: byUser.get(String(r.userId ?? '')) ?? null };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  const nowSlot = slots.find((s) => s.start - 5 * 60_000 <= now && now < s.end) ?? null;
  const next = slots.find((s) => s.start > now) ?? null;
  return { slots, now: nowSlot, next };
}

export class RentalState {
  constructor({ dir = process.env.TW_RENTAL_STATE || DEFAULT_DIR, interval = 30_000 } = {}) {
    this.dir = dir;
    this.snapshot = { slots: [], now: null, next: null };
    this.refresh();
    this.timer = setInterval(() => this.refresh(), interval);
    this.timer.unref();
  }

  refresh(now = Date.now()) {
    try {
      this.snapshot = makeSnapshot(this.dir, now);
    } catch {
      // 初回も含め、読めないときは貸し出しなしとして安全に動かす。
      // すでに正常な結果があれば、それを残して瞬間的な書きかけを無視する。
      if (this.snapshot.slots.length === 0) this.snapshot = { slots: [], now: null, next: null };
    }
    return this.snapshot;
  }

  forHandle(handle, now = Date.now()) {
    const wanted = cleanHandle(handle)?.toLowerCase();
    if (!wanted) return { now: null, next: null };
    const slots = this.snapshot.slots.filter((s) => s.handle?.toLowerCase() === wanted);
    return {
      now: slots.find((s) => s.start - 5 * 60_000 <= now && now < s.end) ?? null,
      next: slots.find((s) => s.start > now) ?? null,
    };
  }

  close() { clearInterval(this.timer); }
}

export function rentalForHandle(snapshot, handle, now = Date.now()) {
  const wanted = cleanHandle(handle)?.toLowerCase();
  if (!wanted) return { now: null, next: null };
  const slots = (snapshot?.slots ?? []).filter((s) => s.handle?.toLowerCase() === wanted);
  return {
    now: slots.find((s) => s.start - 5 * 60_000 <= now && now < s.end) ?? null,
    next: slots.find((s) => s.start > now) ?? null,
  };
}

export function shouldAutoConnect({ now, slot, status, attempts = 0, lastAttempt = 0, manuallyStopped = false }) {
  if (!slot || manuallyStopped || attempts >= 40) return false;
  if (now < slot.start - 5 * 60_000 || now >= slot.end) return false;
  if (['live', 'connecting', 'demo'].includes(status?.mode)) return false;
  return now - lastAttempt >= 2 * 60_000;
}

