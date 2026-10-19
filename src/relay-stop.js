// 既存スロットの固定結果を、ギフトを送った人ごとに順番に開示するサーバー側の進行管理。
// 抽選は SlotEngine に任せ、このファイルでは停止順・待機列・再接続用状態だけを持つ。
import { PENDING_CAP } from './slot.js';
import { eventCoinTotal, giftMatches } from './gifts.js';

const REEL_COUNT = 3;
const DEFAULT_WAIT_MS = 10000;

function userOf(event) {
  const user = event?.user;
  if (!user?.id && !user?.name) return null;
  return { id: user.id ?? null, name: String(user.name ?? '') };
}

function validReel(reel) {
  return Number.isInteger(reel) && reel >= 0 && reel < REEL_COUNT;
}

export class RelayStopEngine {
  constructor(hub, { slot, waitMs = DEFAULT_WAIT_MS, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout } = {}) {
    if (!slot || typeof slot.start !== 'function') throw new Error('リレー停止には既存スロットが必要です');
    this.hub = hub;
    this.slot = slot;
    this.waitMs = Number.isFinite(Number(waitMs)) && Number(waitMs) >= 0 ? Number(waitMs) : DEFAULT_WAIT_MS;
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
    this.state = 'idle';
    this.fixedResult = null;
    this.payout = null;
    this.trigger = null;
    this.stoppers = [null, null, null];
    this.startedAt = null;
    this.stoppedAt = [];
    this.pending = [];
    this.timer = null;
    this.config = { enabled: true, trigger: null };
  }

  setConfig(config = {}) {
    this.config = { enabled: config.enabled !== false, trigger: config.trigger ?? null };
    if (Number.isFinite(Number(config.waitMs)) && Number(config.waitMs) >= 0) this.waitMs = Number(config.waitMs);
  }

  snapshot() {
    const stoppedCount = this.stoppedAt.filter(Boolean).length;
    return {
      state: this.state,
      phase: this.state,
      stoppedCount,
      pending: this.pending.length,
      waitMs: this.waitMs,
      remainingMs: this.timer && this.timer.dueAt ? Math.max(0, this.timer.dueAt - Date.now()) : 0,
      message: this.state === 'waiting' && stoppedCount < 3 ? 'あと1人' : '',
      stoppers: this.stoppers.map((user) => (user ? { ...user } : null)),
      linked: stoppedCount === 3 && this.stoppers.every(Boolean) && new Set(this.stoppers.map((user) => user.id ?? user.name)).size === 3,
      fixedResult: this.fixedResult,
      result: this.fixedResult,
      payout: this.payout,
      trigger: this.trigger,
      stoppedAt: [...this.stoppedAt],
    };
  }

  start(trigger = {}) {
    if (this.state !== 'idle') {
      if (this.pending.length >= PENDING_CAP) return { ok: false, error: '待機列が満杯です（最大20件）', pending: this.pending.length };
      this.pending.push(trigger);
      return { ok: true, queued: true, pending: this.pending.length, state: this.state };
    }
    const started = this.slot.start(trigger);
    if (!started?.ok || !started.result) return { ok: false, error: 'スロットを開始できません' };
    this.state = 'waiting';
    this.fixedResult = started.result;
    this.payout = started.payout ?? null;
    this.trigger = started.trigger ?? trigger;
    this.stoppers = [null, null, null];
    this.startedAt = Date.now();
    this.stoppedAt = [];
    this.#scheduleStop(0);
    this.#emit('start');
    return { ok: true, queued: false, ...this.snapshot() };
  }

  onEvent(event) {
    if (event?.kind !== 'gift') return null;
    if (!this.config.enabled) return null;
    if (event.test) return { ok: true, visualOnly: true, state: this.snapshot() };
    if (this.state === 'idle' && !this.#matchesTrigger(event)) return null;
    if (this.state === 'idle') {
      const started = this.start(event);
      if (!started.ok) return started;
    }
    return this.stop({ reel: this.stoppers.findIndex((user) => !user), user: userOf(event), event });
  }

  #matchesTrigger(event) {
    const trigger = this.config.trigger;
    if (!trigger) return true;
    const gifts = Array.isArray(trigger.gifts) ? trigger.gifts : [];
    const minCoins = Number(trigger.minCoins) || 0;
    return (gifts.length > 0 && giftMatches(event.gift, gifts)) || (minCoins > 0 && eventCoinTotal(event) >= minCoins);
  }

  stop({ reel, user, event = null } = {}) {
    if (!validReel(reel)) return { ok: false, error: 'リール番号は0から2で指定してください' };
    if (this.state === 'idle' || !this.fixedResult) return { ok: false, error: '停止するリレーがありません' };
    if (this.stoppers[reel]) return { ok: false, error: 'そのリールは停止済みです' };
    const stopper = user?.id || user?.name ? { id: user.id ?? null, name: String(user.name ?? '') } : null;
    if (!stopper) return { ok: false, error: '送った人が必要です' };
    this.#clearTimer();
    this.stoppers[reel] = stopper;
    this.stoppedAt[reel] = { user: stopper, automatic: false, at: Date.now(), eventId: event?.id ?? null };
    this.#emit('stop');
    if (reel === REEL_COUNT - 1) return this.#finish();
    this.#scheduleStop(reel + 1);
    return { ok: true, ...this.snapshot() };
  }

  close() {
    this.#clearTimer();
    this.pending = [];
  }

  #scheduleStop(reel) {
    this.#clearTimer();
    this.timer = this.setTimeout(() => this.#automaticStop(reel), this.waitMs);
    if (this.timer && typeof this.timer === 'object') this.timer.dueAt = Date.now() + this.waitMs;
    this.timer?.unref?.();
  }

  #automaticStop(reel) {
    if (this.state === 'idle' || this.stoppers[reel]) return;
    this.#clearTimer();
    this.stoppedAt[reel] = { user: null, automatic: true, at: Date.now(), eventId: null };
    this.#emit('auto-stop');
    if (reel === REEL_COUNT - 1) this.#finish();
    else this.#scheduleStop(reel + 1);
  }

  #finish() {
    this.state = 'done';
    this.#clearTimer();
    this.#emit('done');
    const next = this.pending.shift();
    if (next) {
      this.state = 'idle';
      return this.start(next);
    }
    return { ok: true, ...this.snapshot() };
  }

  #clearTimer() {
    if (this.timer) this.clearTimeout(this.timer);
    this.timer = null;
  }

  #emit(event) {
    this.hub.broadcast?.({ type: 'relay-stop', event, ...this.snapshot() });
  }
}

export const RelayStop = RelayStopEngine;
