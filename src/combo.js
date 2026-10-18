// 擬似連（コンボ）。状態は短時間だけサーバーに持ち、画面へ段階の変化を知らせる。
import { giftMatches, giftDisplayName } from './gifts.js';

const MAX_USERS = 30;
const slimUser = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar } : null);

export class ComboEngine {
  constructor(hub) {
    this.hub = hub;
    this.config = null;
    this.active = new Map();
    this.tests = new Map();
    this.testTimers = new Set();
    this.last = null;
    hub.on('event', (e) => this.onEvent(e));
    hub.on('testEvent', (e) => this.#onTest(e));
    hub.on('reset', () => this.reset());
  }

  setConfig(config) {
    this.config = config;
    if (!config?.enabled) this.#clear(false);
  }

  snapshot() {
    return this.#snapshot(this.active, this.last);
  }

  onEvent(e) {
    this.#hit(this.active, e, false);
  }

  reset() {
    this.#clear(true);
  }

  close() {
    this.#clear(false);
  }

  test(user, count = 5) {
    const total = Math.min(20, Math.max(1, Number(count) || 5));
    for (let i = 0; i < total; i++) {
      const timer = setTimeout(() => {
        this.testTimers.delete(timer);
        this.#hit(this.tests, { kind: 'gift', user, gift: { name: 'テストギフト', id: 'test', count: 1 }, totalDiamonds: 1, test: true }, true);
      }, i * 400);
      this.testTimers.add(timer);
    }
  }

  #onTest(e) {
    this.#hit(this.tests, e, true);
  }

  #hit(map, e, test) {
    const c = this.config;
    if (!c?.enabled || e?.kind !== 'gift') return;
    if (c.gifts.length && !giftMatches(e.gift, c.gifts)) return;
    if (!(Number(e.totalDiamonds) >= c.minCoins)) return;
    const now = Date.now();
    const key = String(e.user?.id ?? e.user?.name ?? '?');
    let state = map.get(key);
    if (state && now > state.expiresAt) this.#end(map, key, test);
    state = map.get(key);
    if (!state) {
      if (map.size >= MAX_USERS) this.#evict(map, test);
      state = { user: slimUser(e.user), count: 0, total: 0, tier: null, tierIndex: -1, updatedAt: now, expiresAt: 0, timer: null };
      map.set(key, state);
    }
    const previousTier = state.tierIndex;
    state.user = slimUser(e.user);
    state.count += 1;
    state.total += Number(e.totalDiamonds);
    state.tier = this.#tier(state.count);
    state.tierIndex = this.#tierIndex(state.tier);
    state.updatedAt = now;
    state.expiresAt = now + c.seconds * 1000;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => this.#end(map, key, test), c.seconds * 1000);
    if (state.count < c.blueAt) return;
    const gift = giftDisplayName(e.gift);
    this.#send(test, map, state, {
      kind: 'hit', user: state.user, count: state.count, total: state.total,
      coins: Number(e.totalDiamonds), gift, tier: state.tier,
      up: state.tierIndex > previousTier, expiresAt: state.expiresAt,
    });
  }

  #end(map, key, test) {
    const state = map.get(key);
    if (!state) return;
    clearTimeout(state.timer);
    map.delete(key);
    if (state.count < this.config?.blueAt) return;
    const result = { kind: 'end', user: state.user, count: state.count, total: state.total, tier: state.tier };
    if (!test) {
      const { kind, ...last } = result;
      this.last = { ...last, endedAt: Date.now() };
    }
    this.#send(test, map, state, result);
  }

  #evict(map, test) {
    const oldest = [...map.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (oldest) this.#end(map, oldest[0], test);
  }

  #send(test, map, state, event) {
    const message = { type: 'combo', combo: this.#snapshot(map, test ? null : this.last), event };
    if (test) this.hub.broadcast({ ...message, test: true });
    else {
      this.hub.broadcast(message);
      this.hub.emit('combo', message.combo, event);
    }
  }

  #snapshot(map, last) {
    return {
      now: Date.now(), seconds: this.config?.seconds ?? 10,
      active: [...map.values()].filter((s) => s.count >= (this.config?.blueAt ?? 2)).sort((a, b) => b.updatedAt - a.updatedAt).map((s) => ({ user: s.user, count: s.count, total: s.total, tier: s.tier, expiresAt: s.expiresAt })),
      last,
    };
  }

  #tier(count) {
    const c = this.config;
    if (count >= c.rainbowAt) return 'rainbow';
    if (count >= c.goldAt) return 'gold';
    if (count >= c.redAt) return 'red';
    if (count >= c.greenAt) return 'green';
    if (count >= c.blueAt) return 'blue';
    return null;
  }

  #tierIndex(tier) {
    return ['blue', 'green', 'red', 'gold', 'rainbow'].indexOf(tier);
  }

  #clear(notify) {
    for (const map of [this.active, this.tests]) for (const state of map.values()) clearTimeout(state.timer);
    for (const timer of this.testTimers) clearTimeout(timer);
    this.testTimers.clear();
    this.active.clear();
    this.tests.clear();
    this.last = null;
    if (notify) {
      const combo = this.snapshot();
      this.hub.broadcast({ type: 'combo', combo });
      this.hub.emit('combo', combo);
    }
  }
}
