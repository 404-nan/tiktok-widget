// 短い時間のギフト合計で、STEP 1 から STEP 5 までを一段ずつ進める。
// 状態はサーバー側に置き、画面は WebSocket で受け取った状態だけを表示する。

import { eventCoinTotal } from './gifts.js';
import { giftDisplayName } from './gift-display.js';

const PRESETS = {
  small: [10, 30, 60, 100, 200],
  medium: [100, 300, 600, 1000, 2000],
  large: [500, 1500, 3000, 5000, 10000],
};

const emptyStep = (step) => ({ step, coins: 0, by: null });
const slimUser = (user) => (user ? { id: user.id, name: user.name, avatar: user.avatar } : null);

export function thresholdsFor(config = {}) {
  if (config.scale === 'custom') {
    return [1, 2, 3, 4, 5].map((step) => Number(config[`step${step}Coins`]) || 1);
  }
  return [...(PRESETS[config.scale] ?? PRESETS.medium)];
}

export class StepupEngine {
  constructor(hub) {
    this.hub = hub;
    this.config = null;
    this.thresholds = [...PRESETS.medium];
    this.timer = null;
    this.cooldownTimer = null;
    this.demoTimers = new Set();
    this.last = null;
    this.state = this.#emptyState();

    hub.on('event', (event) => this.onEvent(event));
    hub.on('testEvent', (event) => this.#onTestEvent(event));
    hub.on('reset', () => this.reset());
  }

  setConfig(config) {
    this.config = config ?? null;
    this.thresholds = thresholdsFor(config ?? {});
    if (!config?.enabled) this.#stopWithoutMessage();
    else this.#clearExpiredCooldown();
  }

  snapshot() {
    this.#clearExpiredCooldown();
    return {
      ...this.state,
      steps: this.state.steps.map((step) => ({ ...step, by: step.by ? { ...step.by } : null })),
      thresholds: [...this.thresholds],
      now: Date.now(),
      last: this.last ? { ...this.last, by: this.last.by ? { ...this.last.by } : null } : null,
      cooldownUntil: this.state.cooldownUntil,
    };
  }

  onEvent(event) {
    if (!this.#canCount(event)) return;
    const coins = eventCoinTotal(event);
    if (coins < Number(this.config.minCoins ?? 1)) return;
    if (this.#cooldownActive()) return;
    if (this.state.active && Date.now() >= this.state.endsAt) {
      this.#endRound();
      if (this.#cooldownActive()) return;
    }
    if (!this.state.active) this.#beginRound();

    this.state.total += coins;
    const step = Math.min(this.state.step + 1, 5);
    if (this.state.step < 5 && this.state.total >= this.thresholds[this.state.step]) {
      this.state.step = step;
      this.state.steps[step - 1] = { step, coins: this.state.total, by: slimUser(event.user) };
      const payload = {
        kind: 'up',
        step,
        total: this.state.total,
        user: slimUser(event.user),
        gift: giftDisplayName(event.gift),
        coins,
      };
      if (step === 5) {
        this.#finishRound('final', payload);
      } else {
        this.#send(payload);
      }
    }
  }

  start() {
    if (!this.config?.enabled) return this.snapshot();
    this.#clearExpiredCooldown();
    if (this.state.cooldownUntil != null) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
      this.state.cooldownUntil = null;
    }
    return this.snapshot();
  }

  stop() {
    if (!this.state.active) return this.snapshot();
    return this.#finishRound('end', {
      kind: 'end',
      step: this.state.step,
      total: this.state.total,
    });
  }

  reset() {
    this.#clearTimers();
    this.#clearDemoTimers();
    this.last = null;
    this.state = this.#emptyState();
    return this.snapshot();
  }

  close() {
    this.#clearTimers();
    this.#clearDemoTimers();
  }

  demo() {
    if (!this.config?.enabled) return this.snapshot();
    this.#clearDemoTimers();
    for (let step = 1; step <= 5; step++) {
      const timer = setTimeout(() => {
        this.demoTimers.delete(timer);
        this.#send({ kind: 'preview', step, total: 0, user: null, gift: null, coins: 0 });
      }, step * 1500);
      this.demoTimers.add(timer);
    }
    return this.snapshot();
  }

  #emptyState() {
    return {
      active: false,
      step: 0,
      total: 0,
      startedAt: null,
      endsAt: null,
      steps: [1, 2, 3, 4, 5].map(emptyStep),
      cooldownUntil: null,
    };
  }

  #canCount(event) {
    return Boolean(this.config?.enabled) && event?.kind === 'gift';
  }

  #beginRound() {
    const now = Date.now();
    const seconds = Number(this.config.windowSeconds);
    this.state = {
      ...this.#emptyState(),
      active: true,
      startedAt: now,
      endsAt: now + seconds * 1000,
    };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.#endRound(), seconds * 1000);
  }

  #endRound() {
    if (!this.state.active) return this.snapshot();
    return this.#finishRound('end', {
      kind: 'end',
      step: this.state.step,
      total: this.state.total,
    });
  }

  #finishRound(kind, event) {
    const endedAt = Date.now();
    const completed = {
      startedAt: this.state.startedAt,
      endsAt: this.state.endsAt,
      steps: this.state.steps.map((step) => ({ ...step, by: step.by ? { ...step.by } : null })),
    };
    const result = {
      step: this.state.step,
      total: this.state.total,
      endedAt,
      by: this.state.steps[this.state.step - 1]?.by ?? null,
    };
    this.last = result;
    this.#clearTimers();
    const cooldown = Number(this.config?.cooldownSeconds ?? 0);
    this.state = { ...this.#emptyState(), cooldownUntil: cooldown > 0 ? endedAt + cooldown * 1000 : null };
    if (this.state.cooldownUntil) {
      this.cooldownTimer = setTimeout(() => {
        this.state.cooldownUntil = null;
        this.cooldownTimer = null;
      }, cooldown * 1000);
    }
    // 内部状態は待機に戻すが、終了の1通だけは終了時点の段・合計を画面へ渡す。
    const endedSnapshot = {
      ...this.snapshot(),
      step: result.step,
      total: result.total,
      startedAt: completed.startedAt,
      endsAt: completed.endsAt,
      steps: completed.steps,
    };
    this.#send({ ...event, kind }, endedSnapshot);
    return this.snapshot();
  }

  #onTestEvent(event) {
    if (!this.#canCount(event)) return;
    const coins = eventCoinTotal(event);
    if (coins < Number(this.config.minCoins ?? 1) || this.#cooldownActive()) return;
    this.#send({
      kind: 'preview',
      step: Math.min(this.state.step + 1, 5),
      total: this.state.total,
      user: slimUser(event.user),
      gift: giftDisplayName(event.gift),
      coins,
    });
  }

  #cooldownActive() {
    this.#clearExpiredCooldown();
    return this.state.cooldownUntil != null;
  }

  #clearExpiredCooldown() {
    if (this.state.cooldownUntil != null && Date.now() >= this.state.cooldownUntil) {
      this.state.cooldownUntil = null;
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  #stopWithoutMessage() {
    this.#clearTimers();
    this.#clearDemoTimers();
    this.state = this.#emptyState();
  }

  #clearTimers() {
    clearTimeout(this.timer);
    clearTimeout(this.cooldownTimer);
    this.timer = null;
    this.cooldownTimer = null;
  }

  #clearDemoTimers() {
    for (const timer of this.demoTimers) clearTimeout(timer);
    this.demoTimers.clear();
  }

  #send(event, state = this.snapshot()) {
    this.hub.broadcast({ type: 'stepup', stepup: state, event });
    this.hub.emit('stepup', state, event);
  }
}
