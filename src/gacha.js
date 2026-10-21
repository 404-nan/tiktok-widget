// 高額ギフトなどのガチャ（name='omikuji' ならおみくじ。同じ仕組みで設定・画面・イベント名だけ別）。待機 → 回転 → 結果 → 終了。一度に1回で、重なった分は待ち列。
// 画面は /widgets/gacha.html。各段階の長さはイベントに載せる。

import { defaultsFor } from './schema.js';
import { giftDisplayName, giftMatches } from './gifts.js';


/**
 * レアリティを1つ引く。pityEvery 回以上、天井対象以外が続いたら次は天井。
 * pityCount は天井対象を引いたら 0 に戻る。
 */
export function rollTier(tiers, pityCount = 0, pityEvery = 0, random = Math.random) {
  const list = (Array.isArray(tiers) ? tiers : []).filter((tier) => Number(tier?.weight) > 0);
  if (!list.length) return { tier: { id: 'none', label: '？', weight: 1, pity: false }, pityCount, forced: false };
  const pityTier = list.find((tier) => tier.pity === true);
  const count = Math.max(0, Number(pityCount) || 0);
  const every = Math.max(0, Number(pityEvery) || 0);
  if (every > 0 && pityTier && count >= every) return { tier: pityTier, pityCount: 0, forced: true };
  const total = list.reduce((sum, tier) => sum + Number(tier.weight), 0);
  let cursor = Number(random()) * total;
  let picked = list[list.length - 1];
  for (const tier of list) {
    cursor -= Number(tier.weight);
    if (cursor < 0) {
      picked = tier;
      break;
    }
  }
  return { tier: picked, pityCount: picked.pity === true ? 0 : count + 1, forced: false };
}

export class Gacha {
  constructor(hub, { bus = null, random = null, name = 'gacha' } = {}) {
    this.name = name;
    this.hub = hub;
    this.bus = bus;
    this.random = typeof random === 'function' ? random : Math.random;
    this.config = defaultsFor(name);
    this.phase = 'idle';
    this.seq = 0;
    this.pityCount = 0;
    this.pending = [];
    this.tier = null;
    this.forced = false;
    this.trigger = null;
    this.durations = durationsOf(this.config);
    this.timers = new Set();
  }

  setBus(bus) {
    this.bus = bus ?? null;
  }

  setConfig(cfg) {
    const base = defaultsFor(this.name);
    this.config = { ...base, ...(cfg ?? {}) };
    if (!Array.isArray(this.config.tiers) || !this.config.tiers.length) this.config.tiers = base.tiers;
  }

  snapshot() {
    const show = this.phase === 'reveal' || this.phase === 'done';
    return {
      phase: this.phase,
      seq: this.seq,
      durations: this.durations,
      pityCount: this.pityCount,
      pending: this.pending.length,
      enabled: this.config.enabled !== false,
      tier: show ? this.tier : null,
      forced: show ? this.forced : false,
      trigger: this.trigger,
    };
  }

  /** オフのときは null。回しているときは待ち列に入れる */
  start(trigger = {}) {
    if (this.config.enabled === false) return null;
    const next = trigger && typeof trigger === 'object' ? trigger : { kind: 'action' };
    if (this.phase !== 'idle') {
      // 待ちに上限はつけない。投げた分は全部回す
      this.pending.push(next);
      return { ok: true, queued: true, pending: this.pending.length, phase: this.phase, seq: this.seq };
    }
    return this.#begin(next);
  }

  onEvent(e) {
    if (this.config.enabled === false || e?.kind !== 'gift') return;
    const gifts = Array.isArray(this.config.gifts) ? this.config.gifts : [];
    const min = Number(this.config.minCoins) || 0;
    const byGift = gifts.length > 0 && giftMatches(e.gift, gifts);
    const byCoins = min > 0 && (Number(e.totalDiamonds) || 0) >= min;
    if (!byGift && !byCoins) return;
    this.start({
      kind: 'gift',
      source: 'gift',
      giftLabel: giftDisplayName(e.gift),
      giftId: e.gift?.id ?? null,
      coins: Number(e.totalDiamonds) || 0,
      user: e.user ? { id: e.user.id, name: e.user.name } : null,
    });
  }

  close() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  #begin(trigger) {
    this.seq += 1;
    this.phase = 'rolling';
    this.trigger = trigger;
    this.durations = durationsOf(this.config);
    const rolled = rollTier(this.config.tiers, this.pityCount, Number(this.config.pity) || 0, this.random);
    this.pityCount = rolled.pityCount;
    this.tier = rolled.tier;
    this.forced = rolled.forced;
    this.#emit('start');
    this.#emit('rolling');
    this.#arm(this.durations.rollMs, () => {
      if (this.phase !== 'rolling') return;
      this.phase = 'reveal';
      this.#emit('reveal');
      this.#arm(this.durations.revealMs, () => {
        if (this.phase !== 'reveal') return;
        this.phase = 'done';
        this.#emit('done');
        this.#arm(this.durations.doneMs, () => {
          if (this.phase !== 'done') return;
          this.phase = 'idle';
          this.tier = null;
          this.forced = false;
          this.trigger = null;
          this.#emit('idle');
          const next = this.pending.shift();
          if (next) this.#begin(next);
        });
      });
    });
    return { ok: true, queued: false, phase: 'rolling', seq: this.seq, durations: { ...this.durations } };
  }

  #emit(name) {
    const show = name === 'reveal' || name === 'done';
    const payload = {
      phase: name === 'idle' ? 'idle' : name === 'start' ? 'rolling' : this.phase,
      seq: this.seq,
      durations: this.durations,
      trigger: this.trigger,
      pityCount: this.pityCount,
      pending: this.pending.length,
      tier: show ? this.tier : null,
      forced: show ? this.forced : false,
      event: name,
    };
    this.hub.broadcast({ type: this.name, ...payload });
    const type = `${this.name}.${name}`;
    this.bus?.emit(type, payload);
  }

  #arm(ms, fn) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, Math.max(0, Number(ms) || 0));
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.add(timer);
  }
}

function durationsOf(cfg) {
  const n = (v, fallback) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : fallback;
  };
  return {
    rollMs: n(cfg?.rollMs, 3000),
    revealMs: n(cfg?.revealMs, 2500),
    doneMs: n(cfg?.doneMs, 1200),
  };
}
