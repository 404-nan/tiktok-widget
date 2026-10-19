// 直近10分のギフト合計から王座を決め、接近と王冠移動の状態をサーバーで管理する。
// 表示はこの状態を受け取るだけにして、画面を読み直しても在位時間を失わない。

import { eventCoinTotal } from './gifts.js';

const WINDOW_MS = 600000;
const APPROACH_COOLDOWN_MS = 180000;
const DEFAULT_CONFIG = {
  enabled: true,
  approachPercent: 15,
  showDifference: true,
  maxMoves: 12,
};

const clone = (value) => structuredClone(value);

export class ThroneEngine {
  constructor({ now = () => Date.now(), broadcast = () => {} } = {}) {
    this.now = now;
    this.broadcast = broadcast;
    this.config = { ...DEFAULT_CONFIG };
    this.reset();
  }

  setConfig(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!this.config.enabled && this.versus) this.versus = null;
  }

  onEvent(event) {
    if (!event || event.kind !== 'gift' || event.test || this.config.enabled === false) return this.snapshot();
    const receivedAt = Number.isFinite(event.ts) ? event.ts : this.now();
    const user = event.user ?? { id: '?', name: '' };
    const key = String(user.id ?? user.name ?? '?');
    const coins = Math.max(0, Number(eventCoinTotal(event)) || 0);
    if (coins <= 0) return this.snapshot();
    this.gifts.push({ key, user: clone(user), coins, ts: receivedAt, seq: ++this.sequence });
    this.#trim(receivedAt);
    this.#recalculate(receivedAt);
    return this.snapshot();
  }

  testEvent(event) {
    this.broadcast({ type: 'throne', event: 'testEvent', test: true, gift: clone(event ?? {}) });
    return this.snapshot();
  }

  finish() {
    const at = this.now();
    this.#trim(at);
    if (this.leader) this.#recordReign(at);
    const all = [...this.reigns.values()].sort((a, b) => b.durationMs - a.durationMs || a.startedAt - b.startedAt);
    this.titles = {
      greatestKing: all[0] ? this.#person(all[0].key) : null,
      lastKing: this.leader ? this.#person(this.leader.key) : null,
    };
    this.state = 'finished';
    this.broadcast({ type: 'throne', event: 'finished', titles: clone(this.titles), state: this.snapshot() });
    return this.snapshot();
  }

  stopEffects() {
    this.effectsStopped = true;
    this.versus = null;
    this.broadcast({ type: 'throne', event: 'effectsStopped', state: this.snapshot() });
    return this.snapshot();
  }

  reset() {
    this.gifts = [];
    this.sequence = 0;
    this.state = 'idle';
    this.leader = null;
    this.versus = null;
    this.reigns = new Map();
    this.approaches = [];
    this.titles = { greatestKing: null, lastKing: null };
    this.moveCount = 0;
    this.effectsStopped = false;
    this.broadcast({ type: 'throne', event: 'reset', state: this.snapshot() });
    return this.snapshot();
  }

  snapshot() {
    const at = this.now();
    if (this.state !== 'finished') {
      this.#trim(at);
      this.#recalculate(at);
    }
    return {
      state: this.state,
      leader: this.leader ? this.#person(this.leader.key, at) : null,
      ranking: this.#ranking(at),
      versus: this.versus ? clone(this.versus) : null,
      approaches: clone(this.approaches),
      moveCount: this.moveCount,
      effectsStopped: this.effectsStopped,
      titles: clone(this.titles),
      windowMs: WINDOW_MS,
    };
  }

  #trim(at) {
    this.gifts = this.gifts.filter((gift) => at - gift.ts <= WINDOW_MS);
  }

  #ranking(at) {
    const totals = new Map();
    for (const gift of this.gifts) {
      const row = totals.get(gift.key) ?? { key: gift.key, user: gift.user, total: 0, firstSeq: gift.seq };
      row.total += gift.coins;
      row.user = gift.user;
      totals.set(gift.key, row);
    }
    return [...totals.values()].sort((a, b) => b.total - a.total || a.firstSeq - b.firstSeq).map((row) => ({ ...row, user: clone(row.user) }));
  }

  #person(key, at = this.now()) {
    const row = this.#ranking(at).find((item) => item.key === key);
    if (!row) return { key, user: null, total: 0 };
    const reign = this.reigns.get(key);
    return { ...row, reigningSince: reign?.startedAt ?? this.leader?.reigningSince ?? at, reignMs: reign ? Math.max(0, at - reign.startedAt) : 0 };
  }

  #recordReign(at) {
    const reign = this.reigns.get(this.leader.key);
    if (reign) reign.durationMs = Math.max(reign.durationMs, at - reign.startedAt);
  }

  #recalculate(at) {
    const ranking = this.#ranking(at);
    const candidate = ranking[0] ?? null;
    const second = ranking[1] ?? null;
    if (!candidate) return;
    const previous = this.leader;
    const changed = !previous || candidate.key !== previous.key;
    const previousRow = previous && ranking.find((row) => row.key === previous.key);
    if (changed && candidate.total > (previousRow ? previousRow.total : 0)) {
      if (previous) this.#recordReign(at);
      this.leader = { key: candidate.key, reigningSince: at };
      if (!this.reigns.has(candidate.key)) this.reigns.set(candidate.key, { key: candidate.key, startedAt: at, durationMs: 0 });
      else this.reigns.get(candidate.key).startedAt = at;
      this.state = 'reigning';
      if (previous && this.moveCount < this.config.maxMoves && !this.effectsStopped) this.moveCount += 1;
    }
    if (second && this.#isApproaching(candidate, second) && !this.effectsStopped && !(changed && previous && this.moveCount >= this.config.maxMoves)) this.#showVersus(candidate, second, at, changed && previous);
    if (this.versus) this.state = 'versus';
  }

  #isApproaching(leader, challenger) {
    const difference = leader.total - challenger.total;
    const threshold = leader.total === 0 ? 1 : leader.total * (Number(this.config.approachPercent) / 100);
    return difference >= 0 && difference <= threshold;
  }

  #showVersus(leader, challenger, at, changed) {
    const pair = `${leader.key}:${challenger.key}`;
    const last = this.approaches.find((item) => item.pair === pair);
    if (last && at - last.at < APPROACH_COOLDOWN_MS) return;
    this.approaches = [...this.approaches.filter((item) => item.pair !== pair), { pair, at }];
    const result = changed ? 'newKing' : 'defense';
    const versus = {
      left: this.#person(leader.key, at),
      right: this.#person(challenger.key, at),
      result,
      difference: this.config.showDifference ? leader.total - challenger.total : null,
      color: result === 'newKing' ? 'red' : 'green',
      approachColor: 'blue',
      timeline: { enterMs: 600, peakMs: 2000, exitMs: 2800, vsAtMs: 900, holdMs: 80 },
    };
    this.versus = versus;
    this.broadcast({ type: 'throne', event: 'versus', ...clone(versus), state: this.snapshot() });
  }
}

export const THRONE_WINDOW_MS = WINDOW_MS;
export const THRONE_APPROACH_COOLDOWN_MS = APPROACH_COOLDOWN_MS;
