// ギフトで回るスロット。結果はここで先に決め、画面には開示用の結果だけ渡す。

import crypto from 'node:crypto';
import { defaultsFor } from './schema.js';
import { eventCoinTotal, giftMatches, giftDisplayName } from './gifts.js';

export const PENDING_CAP = 20;
const RANDOM_MAX = 1000000;
// 開示演出の時刻（public/widgets/lib/slot-core.js の timeline と同じ数字）
export const RESULT_HOLD_MS = 2500;
const BOUNCE_MS = 120;
const REVIVAL_MS = 900 + 80 + 160 + 600;

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function randomRate(randomInt, percent) {
  return randomInt(0, RANDOM_MAX) < rate(percent) * RANDOM_MAX / 100;
}

/** 画面が結果を出す時刻と、最低限見せ終わる時刻（start からのミリ秒）。done はこの holdUntil に送る */
export function slotTimeline(result, reelStopMs) {
  const stop = positive(reelStopMs, 700);
  const settleAt = stop * 3 + BOUNCE_MS;
  const resultAt = result?.revival ? settleAt + REVIVAL_MS : settleAt;
  return { resultAt, holdUntil: resultAt + RESULT_HOLD_MS };
}

export function weightedPick(list, randomInt = crypto.randomInt) {
  const usable = (Array.isArray(list) ? list : []).filter((item) => Number(item.weight) > 0);
  if (!usable.length) return null;
  const total = usable.reduce((sum, item) => sum + Number(item.weight), 0);
  let cursor = randomInt(0, RANDOM_MAX) / RANDOM_MAX * total;
  for (const item of usable) {
    cursor -= Number(item.weight);
    if (cursor < 0) return item;
  }
  return usable[usable.length - 1];
}

function symbolName(symbol) {
  return String(symbol?.id ?? symbol?.label ?? symbol?.name ?? symbol ?? '').trim();
}

function symbolsFor(config, payout, randomInt) {
  const symbols = Array.isArray(config.symbols) ? config.symbols : [];
  const names = symbols.map(symbolName).filter(Boolean);
  const pattern = Array.isArray(payout?.symbols) ? payout.symbols.map(symbolName) : [];
  if (pattern.length === 3 && pattern.every(Boolean)) return pattern;
  if (pattern.length === 2 && pattern.every(Boolean)) {
    const picked = weightedPick(symbols, randomInt);
    return [pattern[0], pattern[1], picked ? symbolName(picked) : pattern[0]];
  }
  if (pattern.length === 1 && pattern[0]) return [pattern[0], pattern[0], pattern[0]];
  const out = [];
  while (out.length < 3) out.push(symbolName(weightedPick(symbols, randomInt) || names[0] || '？'));
  if (payout?.tier === 'lose' && out[0] === out[1] && out[1] === out[2] && names.length > 1) out[2] = names.find((name) => name !== out[0]) || out[2];
  return out;
}

function hasReach(symbols) {
  // リーチは左から止まるので「1本目と2本目がそろった」ときだけ（確率は変えない）
  return symbols.length === 3 && symbols[0] === symbols[1];
}

export function rollSlot(config, randomInt = crypto.randomInt) {
  const cfg = { ...defaultsFor('slots'), ...(config || {}) };
  const payout = weightedPick(cfg.payouts, randomInt) || { id: 'lose', text: 'はずれ', tier: 'lose', weight: 1, symbols: [] };
  const resultSymbols = symbolsFor(cfg, payout, randomInt);
  const tier = ['lose', 'small', 'big', 'jackpot'].includes(payout.tier) ? payout.tier : 'lose';
  const isWin = tier !== 'lose';
  return {
    payout,
    symbols: resultSymbols,
    tier,
    reach: hasReach(resultSymbols),
    nearMiss: !isWin && randomRate(randomInt, cfg.nearMissRate),
    revival: isWin && randomRate(randomInt, cfg.revivalRate),
  };
}

export class SlotEngine {
  constructor(hub, { bus = null, randomInt = null } = {}) {
    this.hub = hub;
    this.bus = bus;
    this.randomInt = typeof randomInt === 'function' ? randomInt : crypto.randomInt;
    this.config = defaultsFor('slots');
    this.phase = 'idle';
    this.seq = 0;
    this.pending = [];
    this.result = null;
    this.payout = null;
    this.trigger = null;
    this.timer = null;
    this.resultTimer = null;
  }

  setBus(bus) { this.bus = bus || null; }

  setConfig(value) {
    const base = defaultsFor('slots');
    this.config = { ...base, ...(value || {}) };
    if (!Array.isArray(this.config.symbols) || !this.config.symbols.length) this.config.symbols = base.symbols;
    if (!Array.isArray(this.config.payouts) || !this.config.payouts.length) this.config.payouts = base.payouts;
  }

  snapshot() {
    return {
      phase: this.phase,
      seq: this.seq,
      pending: this.pending.length,
      enabled: this.config.enabled !== false,
      reelStopMs: positive(this.config.reelStopMs, 700),
      result: this.result,
      payout: this.payout ? { id: this.payout.id, text: this.payout.text } : null,
      trigger: this.trigger,
    };
  }

  start(trigger = {}) {
    if (this.config.enabled === false) return null;
    const next = trigger && typeof trigger === 'object' ? trigger : { kind: 'action' };
    if (this.phase !== 'idle') {
      if (this.pending.length >= PENDING_CAP) {
        this.pending.shift();
        this.pending.push(next);
        return { ok: true, queued: true, dropped: true, pending: this.pending.length, phase: this.phase, seq: this.seq };
      }
      this.pending.push(next);
      return { ok: true, queued: true, dropped: false, pending: this.pending.length, phase: this.phase, seq: this.seq };
    }
    return this.#begin(next);
  }

  onEvent(event) {
    if (this.config.enabled === false || event?.kind !== 'gift') return null;
    const trigger = this.config.trigger || {};
    const gifts = Array.isArray(trigger.gifts) ? trigger.gifts : [];
    const minCoins = Number(trigger.minCoins) || 0;
    if (!((gifts.length && giftMatches(event.gift, gifts)) || (minCoins > 0 && eventCoinTotal(event) >= minCoins))) return null;
    return this.start({
      kind: 'gift',
      source: 'gift',
      gift: event.gift || null,
      giftLabel: giftDisplayName(event.gift),
      coins: eventCoinTotal(event),
      count: Math.max(1, Number(event.gift?.count) || 1),
      user: event.user ? { id: event.user.id, name: event.user.name, avatar: event.user.avatar || null } : null,
    });
  }

  close() {
    clearTimeout(this.timer);
    clearTimeout(this.resultTimer);
    this.timer = null;
    this.resultTimer = null;
  }

  #begin(trigger) {
    this.seq += 1;
    this.phase = 'rolling';
    this.trigger = trigger;
    const rolled = rollSlot(this.config, this.randomInt);
    this.payout = {
      id: rolled.payout.id,
      text: rolled.payout.text || rolled.payout.label || '',
      actions: Array.isArray(rolled.payout.actions) ? rolled.payout.actions : [],
    };
    this.result = {
      id: `slot-${this.seq}`,
      user: trigger.user || null,
      gift: trigger.gift || null,
      symbols: rolled.symbols,
      tier: rolled.tier,
      reach: rolled.reach,
      nearMiss: rolled.nearMiss,
      revival: rolled.revival,
      at: new Date().toISOString(),
    };
    this.#emit('start');
    this.bus?.emit('slot.result', { result: this.result, payout: this.payout, trigger: this.trigger });
    const { resultAt, holdUntil } = slotTimeline(this.result, this.config.reelStopMs);
    this.timer = setTimeout(() => this.#finish(), holdUntil);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    // 結果が画面に出るころに知らせる（カットインの大当たり演出用）
    const shown = { type: 'slotResult', seq: this.seq, result: this.result, payout: { id: this.payout.id, text: this.payout.text } };
    this.resultTimer = setTimeout(() => this.hub.broadcast(shown), resultAt);
    if (typeof this.resultTimer.unref === 'function') this.resultTimer.unref();
    return { ok: true, queued: false, phase: this.phase, seq: this.seq, result: this.result };
  }

  #finish() {
    if (this.phase !== 'rolling') return;
    this.phase = 'idle';
    this.#emit('done');
    this.result = null;
    this.payout = null;
    this.trigger = null;
    const next = this.pending.shift();
    if (next) this.#begin(next);
  }

  #emit(event) {
    this.hub.broadcast({ type: 'slot', event, ...this.snapshot() });
    this.bus?.emit(`slot.${event}`, { ...this.snapshot() });
  }
}

export const Slot = SlotEngine;
