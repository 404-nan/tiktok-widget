// 短い時間に届いたギフトの個数をまとめ、群予告を起こす。
// 個数と冷却時間はサーバー側で持ち、画面には結果だけを配る。

import { DEMO_GIFTS } from './demo.js';
import { eventCoinTotal } from './gifts.js';
import { giftDisplayName } from './gift-display.js';

const PRESETS = {
  small: 10,
  medium: 30,
  large: 100,
};

const ACTIVE_SECONDS = 4;
const clone = (value) => (value == null ? value : structuredClone(value));

export function thresholdFor(config = {}) {
  if (config.scale === 'custom') return Math.max(1, Number(config.threshold) || 1);
  return PRESETS[config.scale] ?? PRESETS.medium;
}

export class SwarmEngine {
  constructor(hub) {
    this.hub = hub;
    this.config = null;
    this.threshold = PRESETS.medium;
    this.history = [];
    this.last = null;
    this.activeUntil = null;
    this.cooldownUntil = null;
    this.activeTimer = null;
    this.cooldownTimer = null;

    hub.on('event', (event) => this.onEvent(event));
    hub.on('testEvent', (event) => this.#onTestEvent(event));
    hub.on('reset', () => this.reset());
  }

  setConfig(config) {
    this.config = config ?? null;
    this.threshold = thresholdFor(config ?? {});
    if (!config?.enabled) this.reset();
    else this.#clearExpired();
  }

  snapshot() {
    this.#clearExpired();
    this.#prune(Date.now());
    return {
      active: this.activeUntil != null,
      last: clone(this.last),
      cooldownUntil: this.cooldownUntil,
      window: this.#windowCount(),
      threshold: this.threshold,
      text: this.config?.text ?? '群',
      sound: this.config?.sound !== false,
      volume: Number(this.config?.volume ?? 0.5),
      now: Date.now(),
    };
  }

  onEvent(event) {
    if (!this.#canCount(event) || this.#cooldownActive()) return;
    const entry = this.#entry(event);
    if (!entry) return;
    this.#prune(Date.now());
    this.history.push(entry);
    if (this.#windowCount() >= this.threshold) this.#triggerFromHistory();
  }

  /** 状態を変えず、見本の群だけを画面へ送る。 */
  trigger() {
    if (!this.config?.enabled) return this.snapshot();
    const event = this.#makePayload(DEMO_GIFTS.map((gift) => this.#demoEntry(gift)));
    this.#send({ ...event, kind: 'swarm' });
    return this.snapshot();
  }

  reset() {
    this.#clearTimers();
    this.history = [];
    this.last = null;
    this.activeUntil = null;
    this.cooldownUntil = null;
    return this.snapshot();
  }

  close() {
    this.#clearTimers();
  }

  #canCount(event) {
    return Boolean(this.config?.enabled) && event?.kind === 'gift';
  }

  #entry(event) {
    const rawCount = Number(event.gift?.count ?? 1);
    const count = Number.isFinite(rawCount) ? Math.max(1, Math.floor(rawCount)) : 1;
    return {
      ts: Number.isFinite(Number(event.ts)) ? Number(event.ts) : Date.now(),
      count,
      coins: eventCoinTotal(event),
      gift: {
        id: event.gift?.id ?? event.gift?.giftId ?? null,
        name: giftDisplayName(event.gift),
        image: event.gift?.image ?? null,
        icon: event.gift?.icon ?? null,
      },
      user: event.user ? { id: event.user.id ?? null, name: event.user.name ?? '', avatar: event.user.avatar ?? null } : null,
    };
  }

  #demoEntry(gift) {
    return {
      ts: Date.now(),
      count: 1,
      coins: Number(gift.diamonds) || 0,
      gift: { id: gift.id, name: giftDisplayName(gift), image: gift.image ?? null, icon: gift.icon ?? null },
      user: null,
    };
  }

  #onTestEvent(event) {
    if (!this.#canCount(event) || this.#cooldownActive()) return;
    const entry = this.#entry(event);
    if (!entry) return;
    this.#send({ ...this.#makePayload([entry]), kind: 'preview' });
  }

  #triggerFromHistory() {
    const payload = this.#makePayload(this.history);
    const now = Date.now();
    this.history = [];
    this.last = payload;
    this.activeUntil = now + ACTIVE_SECONDS * 1000;
    this.cooldownUntil = Number(this.config.cooldownSeconds) > 0 ? now + Number(this.config.cooldownSeconds) * 1000 : null;
    this.#armTimers();
    this.#send({ ...payload, kind: 'swarm' });
  }

  #makePayload(entries) {
    const groups = new Map();
    for (const [index, entry] of entries.entries()) {
      const key = String(entry.gift.id ?? entry.gift.name);
      const current = groups.get(key);
      if (current) {
        current.count += entry.count;
        continue;
      }
      groups.set(key, { ...entry.gift, count: entry.count, index });
    }
    const gifts = [...groups.values()]
      .sort((a, b) => b.count - a.count || a.index - b.index)
      .slice(0, 12)
      .map(({ index, ...gift }) => gift);
    const count = entries.reduce((sum, entry) => sum + entry.count, 0);
    const coins = entries.reduce((sum, entry) => sum + entry.coins, 0);
    const users = [];
    for (let i = entries.length - 1; i >= 0 && users.length < 3; i--) {
      const name = entries[i].user?.name;
      if (name && !users.includes(name)) users.push(name);
    }
    return {
      count,
      coins,
      gifts,
      users,
      iconCount: Math.min(count, Number(this.config?.maxIcons) || 60),
      level: count >= this.threshold * 10 ? 4 : count >= this.threshold * 3 ? 3 : count >= this.threshold * 2 ? 2 : 1,
    };
  }

  #windowCount() {
    return this.history.reduce((sum, entry) => sum + entry.count, 0);
  }

  #prune(now) {
    const windowMs = Math.max(0, Number(this.config?.windowSeconds) || 0) * 1000;
    const since = now - windowMs;
    this.history = this.history.filter((entry) => entry.ts > since);
  }

  #cooldownActive() {
    this.#clearExpired();
    return this.cooldownUntil != null;
  }

  #clearExpired() {
    const now = Date.now();
    if (this.activeUntil != null && now >= this.activeUntil) {
      this.activeUntil = null;
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.cooldownUntil != null && now >= this.cooldownUntil) {
      this.cooldownUntil = null;
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  #armTimers() {
    clearTimeout(this.activeTimer);
    clearTimeout(this.cooldownTimer);
    this.activeTimer = this.activeUntil == null ? null : setTimeout(() => {
      this.activeUntil = null;
      this.activeTimer = null;
    }, Math.max(0, this.activeUntil - Date.now()));
    this.cooldownTimer = this.cooldownUntil == null ? null : setTimeout(() => {
      this.cooldownUntil = null;
      this.cooldownTimer = null;
    }, Math.max(0, this.cooldownUntil - Date.now()));
  }

  #clearTimers() {
    clearTimeout(this.activeTimer);
    clearTimeout(this.cooldownTimer);
    this.activeTimer = null;
    this.cooldownTimer = null;
  }

  #send(event) {
    const state = this.snapshot();
    const enriched = { ...event, text: state.text, sound: state.sound, volume: state.volume };
    this.hub.broadcast({ type: 'swarm', swarm: state, event: enriched });
    this.hub.emit('swarm', state, enriched);
  }
}
