// ダレ場の静かな時間をサーバーで判定し、小さな事件の状態を配信する。
// 判定の時計と進行中の事件をここに集め、ウィジェットは受け取った状態だけを表示する。

const WINDOW_MS = 180_000;
const BASELINE_MS = 600_000;
const COOLDOWN_MS = 1_200_000;
const EVENT_MS = 3_000;
const REVEAL_DELAY_MS = 400;

const TYPES = ['野良ボス', '宝箱', '号外'];

const emptyState = () => ({
  state: 'monitoring',
  type: null,
  eventId: null,
  startedAt: null,
  completedAt: null,
  remainingMs: 0,
  user: null,
  result: null,
  lastUser: null,
  observedEvents: 0,
  stopped: false,
});

export class DarebaEngine {
  constructor({ hub, now = () => Date.now(), timer = setTimeout, clearTimer = clearTimeout, interval = setInterval, clearInterval = globalThis.clearInterval } = {}) {
    this.hub = hub;
    this.now = now;
    this.timer = timer;
    this.clearTimer = clearTimer;
    this.interval = interval;
    this.clearInterval = clearInterval;
    this.config = { enabled: true, type: '野良ボス' };
    this.events = [];
    this.liveStartedAt = null;
    this.lastEndedAt = null;
    this.lastCandidateWindow = null;
    this.state = emptyState();
    this.timers = [];
    this.poller = null;
  }

  setConfig(config = {}) {
    this.config = { ...this.config, ...config, type: TYPES.includes(config.type) ? config.type : this.config.type };
    if (this.config.enabled === false) this.stop('ダレ場の事件を使いません');
  }

  startLive(at = this.now()) {
    this.clearTimers();
    this.liveStartedAt = at;
    this.events = [];
    this.lastEndedAt = null;
    this.lastCandidateWindow = null;
    this.state = emptyState();
    this.poller = this.interval(() => this.evaluate(), 1000);
    this.poller?.unref?.();
    this.broadcast();
  }

  resetForLive(at = this.now()) {
    this.startLive(at);
  }

  record(event) {
    if (!event || event.test) return false;
    const at = Number(event.ts ?? this.now());
    if (event.kind !== 'gift' && event.kind !== 'follow' && event.kind !== 'share') return false;
    this.events.push({ at, user: event.user ?? null });
    this.events = this.events.filter((item) => item.at >= at - BASELINE_MS - WINDOW_MS);
    this.state.observedEvents = this.events.length;
    this.state.lastUser = event.user ?? null;
    this.evaluate(at);
    return true;
  }

  testEvent(event) {
    if (!event) return false;
    this.hub?.broadcast({ type: 'dareba', event: { ...this.previewEvent(event), test: true } });
    return true;
  }

  evaluate(at = this.now()) {
    if (this.config.enabled === false || this.liveStartedAt == null || at - this.liveStartedAt < BASELINE_MS) return false;
    if (this.state.state === 'active' || this.state.state === 'triggered') return false;
    if (this.lastEndedAt != null && at - this.lastEndedAt < COOLDOWN_MS) return false;
    const windowId = Math.floor(at / WINDOW_MS);
    if (this.lastCandidateWindow === windowId) return false;
    const baselineStart = at - WINDOW_MS - BASELINE_MS;
    const baselineEnd = at - WINDOW_MS;
    const recentStart = at - WINDOW_MS;
    const baseline = this.events.filter((item) => item.at >= baselineStart && item.at < baselineEnd).length;
    const recent = this.events.filter((item) => item.at >= recentStart && item.at <= at).length;
    if (baseline === 0 || recent > baseline * (WINDOW_MS / BASELINE_MS) * 0.4) return false;
    this.lastCandidateWindow = windowId;
    return this.trigger({ ts: at, user: this.state.lastUser });
  }

  trigger({ ts = this.now(), user = null } = {}) {
    if (this.config.enabled === false || this.state.state === 'active' || this.state.state === 'triggered') return false;
    if (this.lastEndedAt != null && ts - this.lastEndedAt < COOLDOWN_MS) return false;
    const eventId = `dareba-${ts}-${this.state.observedEvents}`;
    this.state = {
      ...this.state,
      state: 'triggered',
      type: this.config.type,
      eventId,
      startedAt: ts,
      completedAt: null,
      remainingMs: EVENT_MS,
      user: user ?? null,
      result: null,
      stopped: false,
    };
    this.broadcast();
    this.timers.push(this.timer(() => this.beginActive(eventId), REVEAL_DELAY_MS));
    this.timers.push(this.timer(() => this.complete(eventId), EVENT_MS));
    return true;
  }

  beginActive(eventId) {
    if (this.state.eventId !== eventId || this.state.state !== 'triggered') return false;
    this.state = { ...this.state, state: 'active' };
    this.broadcast();
    return true;
  }

  complete(eventId = this.state.eventId) {
    if (this.state.eventId !== eventId || (this.state.state !== 'active' && this.state.state !== 'triggered')) return false;
    const completedAt = this.now();
    this.state = { ...this.state, state: 'completed', completedAt, remainingMs: 0, result: '達成' };
    this.lastEndedAt = completedAt;
    this.broadcast();
    return true;
  }

  stop(message = '中断しました') {
    if (this.state.state !== 'active' && this.state.state !== 'triggered') return false;
    this.clearTimers();
    this.state = { ...this.state, state: 'stopped', remainingMs: 0, result: message, stopped: true };
    this.lastEndedAt = this.now();
    this.broadcast();
    return true;
  }

  snapshot() {
    const state = { ...this.state };
    if (state.state === 'active' && state.startedAt != null) state.remainingMs = Math.max(0, EVENT_MS - (this.now() - state.startedAt));
    return state;
  }

  restore(state) {
    this.state = { ...emptyState(), ...state };
    this.broadcast();
    return this.snapshot();
  }

  close() {
    this.clearTimers();
    if (this.poller != null) this.clearInterval(this.poller);
    this.poller = null;
  }

  clearTimers() {
    for (const timer of this.timers) this.clearTimer(timer);
    this.timers = [];
  }

  previewEvent(event) {
    return { eventId: this.state.eventId, type: this.config.type, user: event.user ?? null, state: this.snapshot().state };
  }

  broadcast() {
    this.hub?.broadcast({ type: 'dareba', dareba: this.snapshot() });
  }
}

export { TYPES as DAREBA_TYPES };
