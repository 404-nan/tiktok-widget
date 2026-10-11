// RUSH（確変）モード。突入するとしばらく「RUSH 中」になり、その間のギフトで時間が延び、合計が数え上がる。
// 状態はサーバーで持ち、'rush' メッセージで全部の画面に配る（OBS を読み込み直しても続きから出せる）。

const named = (gift, names) => {
  if (!gift || !names?.length) return false;
  const want = names.map((n) => String(n).toLowerCase());
  return want.includes(String(gift.name).toLowerCase()) || want.includes(String(gift.id));
};

const slimUser = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar } : null);

export class RushEngine {
  constructor(hub) {
    this.hub = hub;
    this.config = null;
    this.timer = null;
    this.state = { active: false };
    this.last = null; // 最後に終わった RUSH の結果
    hub.on('event', (e) => this.onEvent(e));
    hub.on('roulette', ({ item, trigger }) => {
      if (item.rush) this.start({ by: trigger?.user, reason: 'roulette' });
    });
  }

  setConfig(rush) {
    this.config = rush;
    if (!rush?.enabled && this.state.active) this.stop();
  }

  snapshot() {
    return { ...this.state, now: Date.now(), last: this.last };
  }

  #send(event) {
    this.hub.broadcast({ type: 'rush', rush: this.snapshot(), event });
    this.hub.emit('rush', this.snapshot(), event);
  }

  onEvent(e) {
    const c = this.config;
    if (!c?.enabled || e.kind !== 'gift') return;
    if (this.state.active) {
      this.state.total += e.totalDiamonds;
      this.state.gifts += e.gift.count;
      // RUSH 中のギフトで時間が延びる
      let extended = 0;
      if (c.extendSeconds > 0 && e.totalDiamonds >= c.extendMinCoins) {
        const now = Date.now();
        const room = this.state.startedAt + c.maxSeconds * 1000 - this.state.endsAt;
        extended = Math.max(0, Math.min(c.extendSeconds * 1000, room));
        this.state.endsAt += extended;
        if (extended) this.#schedule(this.state.endsAt - now);
      }
      this.#send({ kind: 'gift', user: slimUser(e.user), coins: e.totalDiamonds, gift: e.gift.name, extended: Math.round(extended / 1000) });
      return;
    }
    const byGift = named(e.gift, c.gifts);
    const byCoins = c.enterCoins > 0 && e.totalDiamonds >= c.enterCoins;
    if (byGift || byCoins) this.start({ by: e.user, reason: 'gift', coins: e.totalDiamonds, gifts: e.gift.count });
  }

  /** RUSH に入る（すでに RUSH 中なら時間を足す） */
  start({ by = null, reason = 'manual', coins = 0, gifts = 0 } = {}) {
    const c = this.config;
    if (!c?.enabled) return null;
    const now = Date.now();
    if (this.state.active) {
      this.state.endsAt = Math.min(this.state.startedAt + c.maxSeconds * 1000, this.state.endsAt + c.duration * 1000);
      this.#schedule(this.state.endsAt - now);
      this.#send({ kind: 'again', user: slimUser(by) });
      return this.snapshot();
    }
    this.state = {
      active: true,
      startedAt: now,
      endsAt: now + c.duration * 1000,
      total: coins,
      gifts,
      by: slimUser(by),
      reason,
    };
    this.#schedule(c.duration * 1000);
    this.#send({ kind: 'start' });
    return this.snapshot();
  }

  stop() {
    if (!this.state.active) return null;
    clearTimeout(this.timer);
    const s = this.state;
    this.last = { total: s.total, gifts: s.gifts, startedAt: s.startedAt, endedAt: Date.now(), by: s.by };
    this.state = { active: false };
    this.#send({ kind: 'end', result: this.last });
    return this.last;
  }

  #schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.stop(), Math.max(0, ms));
  }
}
