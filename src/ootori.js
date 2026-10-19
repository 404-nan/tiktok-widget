// ラスト10分の席と参加者、終了時の大トリをサーバーで確定する。
// 公開画面はこのスナップショットを受け取り、抽選や参加者順を決めない。

const DEFAULT_CONFIG = {
  enabled: true,
  mode: 'anyone',
  durationMs: 600000,
  seatChangedMs: 350,
  finaleSilenceMs: 600,
  finaleRevealMs: 2500,
  rollMaxMs: 9000,
  staticAfterMs: 3000,
  hideWords: [],
};

const clone = (value) => structuredClone(value);
const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeName = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[<>]/g, '').trim().slice(0, 80);

function userOf(event) {
  const user = event?.user ?? {};
  const id = String(user.id ?? user.name ?? '').trim();
  const name = safeName(user.name);
  return { id: id || name, name, avatar: String(user.avatar ?? user.avatarUrl ?? '').slice(0, 500) };
}

function giftValue(event) {
  const direct = Number(event?.totalDiamonds ?? event?.diamondCount);
  const gift = event?.gift ?? {};
  const perGift = Number(gift.diamondCount ?? gift.diamonds ?? 0);
  const count = Number(gift.count ?? 1);
  return Math.max(0, Number.isFinite(direct) ? direct : perGift * Math.max(1, count));
}

export class OotoriEngine {
  constructor({ now = () => Date.now(), broadcast = () => {}, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
    this.now = now;
    this.broadcast = broadcast;
    this.setTimeout = setTimeoutFn;
    this.clearTimeout = clearTimeoutFn;
    this.config = { ...DEFAULT_CONFIG };
    this.finishTimer = null;
    this.reset(false);
  }

  setConfig(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, hideWords: Array.isArray(config.hideWords) ? config.hideWords : DEFAULT_CONFIG.hideWords };
    return this.snapshot();
  }

  start() {
    if (this.config.enabled === false) return { ...this.snapshot(), message: '大トリはオフです' };
    if (this.state !== 'idle') return this.snapshot();
    const startedAt = this.now();
    this.startedAt = startedAt;
    this.endsAt = startedAt + Math.max(0, numberOr(this.config.durationMs, DEFAULT_CONFIG.durationMs));
    this.state = 'open';
    this.#emit('started');
    return this.snapshot();
  }

  onEvent(event) {
    if (this.config.enabled === false || !event || event.kind !== 'gift' || event.test || this.state !== 'open') return this.snapshot();
    const user = userOf(event);
    if (!user.id || !user.name || giftValue(event) <= 0) return this.snapshot();
    if (this.#hidden(user.name)) {
      this.excludedCount += 1;
      return this.snapshot();
    }
    const receivedAt = Number.isFinite(event.ts) ? event.ts : this.now();
    const participant = { id: user.id, name: user.name, avatar: user.avatar, firstAt: receivedAt };
    const existing = this.participants.find((item) => item.id === user.id);
    if (existing) {
      existing.name = participant.name;
      existing.avatar = participant.avatar;
    } else {
      this.participants.push(participant);
    }
    const value = giftValue(event);
    const canTake = this.config.mode !== 'raise' || !this.seat || value > this.seat.value;
    if (canTake) this.seat = { user: participant, value, giftName: safeName(event.gift?.name), receivedAt };
    this.#emit('seatChanged');
    return this.snapshot();
  }

  testEvent(event) {
    this.broadcast({ type: 'ootori', event: 'testEvent', test: true, gift: clone(event ?? {}), state: this.snapshot() });
    return { ...this.snapshot(), visualOnly: true };
  }

  finish() {
    if (this.state !== 'open') return this.snapshot();
    this.state = 'rolling';
    const finishedAt = this.now();
    const last = this.seat?.user ?? null;
    const ordered = this.participants.filter((item) => !last || item.id !== last.id);
    if (last) ordered.push(last);
    const visible = ordered.length <= 20 ? ordered : [...ordered.slice(0, 19), ordered[ordered.length - 1]];
    this.endRoll = {
      visible: clone(visible),
      otherCount: Math.max(0, ordered.length - visible.length) + this.excludedCount,
      maxMs: Math.min(9000, Math.max(0, numberOr(this.config.rollMaxMs, DEFAULT_CONFIG.rollMaxMs))),
      staticAfterMs: Math.min(3000, Math.max(0, numberOr(this.config.staticAfterMs, DEFAULT_CONFIG.staticAfterMs))),
    };
    this.finale = {
      silenceMs: Math.min(600, Math.max(0, numberOr(this.config.finaleSilenceMs, DEFAULT_CONFIG.finaleSilenceMs))),
      revealWithinMs: Math.min(2500, Math.max(0, numberOr(this.config.finaleRevealMs, DEFAULT_CONFIG.finaleRevealMs))),
      maxMs: 3000,
      finishedAt,
      bigTori: last,
    };
    this.message = last ? '本日の大トリ' : '参加者なし';
    this.#emit('finished');
    return this.snapshot();
  }

  reset(announce = true) {
    if (this.finishTimer) this.clearTimeout(this.finishTimer);
    this.finishTimer = null;
    this.state = 'idle';
    this.startedAt = null;
    this.endsAt = null;
    this.seat = null;
    this.participants = [];
    this.excludedCount = 0;
    this.finale = null;
    this.endRoll = { visible: [], otherCount: 0, maxMs: this.config?.rollMaxMs ?? 9000, staticAfterMs: 3000 };
    this.message = '';
    if (announce) this.#emit('reset');
    return this.snapshot();
  }

  snapshot() {
    return clone({
      state: this.state,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      remainingMs: this.state === 'open' && this.endsAt != null ? Math.max(0, this.endsAt - this.now()) : 0,
      seat: this.seat,
      seatChangedMs: Math.min(700, Math.max(0, numberOr(this.config.seatChangedMs, DEFAULT_CONFIG.seatChangedMs))),
      participants: this.participants,
      excludedCount: this.excludedCount,
      finale: this.finale,
      endRoll: this.endRoll,
      message: this.message,
    });
  }

  close() {
    if (this.finishTimer) this.clearTimeout(this.finishTimer);
    this.finishTimer = null;
  }

  #hidden(name) {
    const folded = name.toLocaleLowerCase();
    return this.config.hideWords.some((word) => String(word).trim() && folded.includes(String(word).trim().toLocaleLowerCase()));
  }

  #emit(event) {
    this.broadcast({ type: 'ootori', event, state: this.snapshot() });
  }
}

export const OOTORI_DEFAULT_CONFIG = DEFAULT_CONFIG;
