// 遅れて光る告知ランプの抽選と待ち行列を、サーバー側で持つ。
// 公開画面はこの状態を受け取り、光る時刻や当たりを決めない。

import { defaultsFor } from './schema.js';
import { eventCoinTotal, giftDisplayName } from './gifts.js';

export const PENDING_CAP = 20;

const numberInRange = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function rollPekaDelay(random = Math.random) {
  const n = numberInRange(random(), 0, 0.999999999, 0);
  if (n < 0.2) return { kind: '先ペカ', delayMs: 0, color: 'blue' };
  if (n < 0.9) return { kind: '後ペカ', delayMs: 1500 + Math.floor(numberInRange(random(), 0, 0.999999999, 0) * 4501), color: 'green' };
  return { kind: '遅ペカ', delayMs: 9000 + Math.floor(numberInRange(random(), 0, 0.999999999, 0) * 2001), color: 'red' };
}

export class Peka {
  constructor(hub, { random = null, now = null } = {}) {
    this.hub = hub;
    this.random = typeof random === 'function' ? random : Math.random;
    this.now = typeof now === 'function' ? now : Date.now;
    this.config = defaultsFor('peka');
    this.phase = 'idle';
    this.seq = 0;
    this.current = null;
    this.pending = [];
    this.lastRejected = null;
    this.timer = null;
  }

  setConfig(value) {
    this.config = { ...defaultsFor('peka'), ...(value || {}) };
  }

  snapshot() {
    this.#lightIfDue();
    return {
      phase: this.phase,
      seq: this.seq,
      enabled: this.config.enabled !== false,
      pending: this.pending.length,
      queue: this.pending.map((item) => ({ ...item })),
      current: this.current ? { ...this.current, trigger: { ...this.current.trigger } } : null,
      lastRejected: this.lastRejected,
      bonusSeconds: Number(this.config.bonusSeconds) || 0,
      sound: this.config.sound !== false,
      volume: numberInRange(this.config.volume, 0, 1, 0.3),
    };
  }

  onEvent(event) {
    if (this.config.enabled === false || event?.kind !== 'gift') return null;
    if (eventCoinTotal(event) < Math.max(0, Number(this.config.minCoins) || 0)) return null;
    if (this.random() >= numberInRange(this.config.chance, 0, 1, 0)) return null;
    const trigger = {
      user: event.user ? { ...event.user } : null,
      gift: event.gift ? { ...event.gift, name: giftDisplayName(event.gift) } : null,
      coins: eventCoinTotal(event),
      test: event.test === true,
    };
    const delay = rollPekaDelay(this.random);
    const item = {
      seq: this.seq + this.pending.length + 1,
      receivedAt: this.now(),
      at: this.now() + delay.delayMs,
      delayMs: delay.delayMs,
      kind: delay.kind,
      color: delay.color,
      trigger,
    };
    if (this.phase !== 'idle') {
      if (this.pending.length >= PENDING_CAP) {
        this.lastRejected = { reason: 'full', cap: PENDING_CAP, receivedAt: item.receivedAt };
        return { ok: false, queued: false, ...this.lastRejected };
      }
      this.pending.push(item);
      this.#emit('queued');
      return { ok: true, queued: true, pending: this.pending.length };
    }
    this.#begin(item);
    return { ok: true, queued: false, phase: this.phase, seq: this.seq };
  }

  resolve(reason = 'bonusResolved') {
    if (reason !== 'bonusResolved' || this.phase !== 'lit') return this.snapshot();
    this.current = null;
    const next = this.pending.shift();
    if (next) this.#begin(next);
    else {
      this.phase = 'idle';
      this.#emit('resolved');
    }
    return this.snapshot();
  }

  reset() {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'idle';
    this.current = null;
    this.pending = [];
    this.lastRejected = null;
    this.#emit('reset');
  }

  close() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  #begin(item) {
    this.seq += 1;
    this.phase = 'pending';
    this.current = { ...item, seq: this.seq };
    this.#arm();
    this.#emit('pending');
    this.#lightIfDue();
  }

  #arm() {
    clearTimeout(this.timer);
    if (!this.current || this.phase !== 'pending') return;
    const wait = Math.max(0, this.current.at - this.now());
    this.timer = setTimeout(() => this.#lightIfDue(), wait);
    this.timer.unref?.();
  }

  #lightIfDue() {
    if (this.phase !== 'pending' || !this.current) return;
    if (this.current.at > this.now()) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'lit';
    this.#emit('lit');
  }

  #emit(event) {
    this.hub.broadcast({ type: 'peka', event, test: this.current?.trigger?.test === true, ...this.snapshotWithoutAdvance() });
  }

  snapshotWithoutAdvance() {
    return {
      phase: this.phase,
      seq: this.seq,
      enabled: this.config.enabled !== false,
      pending: this.pending.length,
      queue: this.pending.map((item) => ({ ...item })),
      current: this.current ? { ...this.current, trigger: { ...this.current.trigger } } : null,
      lastRejected: this.lastRejected,
      bonusSeconds: Number(this.config.bonusSeconds) || 0,
      sound: this.config.sound !== false,
      volume: numberInRange(this.config.volume, 0, 1, 0.3),
    };
  }
}
