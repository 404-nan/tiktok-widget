// カードめくり: 当たり・ハズレのカードを表で見せる → 裏返して混ぜる → 番号をつけて配る →
// ギフトを送った人がコメントで番号を言う(言わなければ時間切れで自動) → そのカードがめくれて結果。
// 結果は選んだ位置ではなく、めくる瞬間に winRate の確率で決める。最初に見せる当たりの枚数も winRate に合わせる。
import { defaultsFor } from './schema.js';
import { giftDisplayName, giftMatches } from './gifts.js';

const PHASES = ['show', 'shuffle', 'pick', 'reveal', 'done'];

/** 見せるカードの並び(当たりの枚数は count × winRate を四捨五入。確率が 0 より大きければ最低1枚) */
export function deckOf(count, winRate, random = Math.random) {
  const n = Math.max(2, Math.round(count));
  const wins = winRate > 0 ? Math.min(n - 1, Math.max(1, Math.round(n * winRate))) : 0;
  const deck = Array.from({ length: n }, (_, i) => i < wins);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** コメントから 1〜count の番号を拾う(全角の数字も読む)。なければ null */
export function pickNumber(text, count) {
  const half = String(text ?? '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  const m = half.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1 && n <= count ? n : null;
}

export class CardDraw {
  constructor(hub, { random = Math.random } = {}) {
    this.hub = hub;
    this.random = random;
    this.config = defaultsFor('cardDraw');
    this.phase = 'idle';
    this.seq = 0;
    this.pending = [];
    this.round = null;
    this.timers = new Set();
  }

  setConfig(cfg) {
    this.config = { ...defaultsFor('cardDraw'), ...(cfg ?? {}) };
  }

  snapshot() {
    return { phase: this.phase, seq: this.seq, pending: this.pending.length, enabled: this.config.enabled !== false, ...this.#view() };
  }

  /** オフのときは null。めくっている間は待ち列に入れる(待ちに上限はつけない。投げた分は全部めくる) */
  start(trigger = {}) {
    if (this.config.enabled === false) return null;
    if (this.phase !== 'idle') {
      this.pending.push(trigger);
      return { ok: true, queued: true, pending: this.pending.length };
    }
    this.#begin(trigger);
    return { ok: true, queued: false, seq: this.seq };
  }

  onEvent(e) {
    if (this.config.enabled === false || !e) return;
    if (e.kind === 'chat' && this.phase === 'pick' && this.round) {
      const who = this.round.user;
      const same = who && (e.user?.id ? e.user.id === who.id : e.user?.name === who.name);
      const n = same ? pickNumber(e.text, this.round.deck.length) : null;
      if (n) this.#reveal(n);
      return;
    }
    if (e.kind !== 'gift') return;
    const gifts = Array.isArray(this.config.gifts) ? this.config.gifts : [];
    const min = Number(this.config.minCoins) || 0;
    const byGift = gifts.length > 0 && giftMatches(e.gift, gifts);
    const byCoins = min > 0 && (Number(e.totalDiamonds) || 0) >= min;
    if (!byGift && !byCoins) return;
    this.start({ kind: 'gift', giftLabel: giftDisplayName(e.gift), coins: Number(e.totalDiamonds) || 0, user: e.user ? { id: e.user.id, name: e.user.name } : null });
  }

  close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  #begin(trigger) {
    this.seq += 1;
    const c = this.config;
    this.round = { user: trigger.user ?? null, giftLabel: trigger.giftLabel ?? null, deck: deckOf(Number(c.count) || 8, Number(c.winRate) || 0, this.random), picked: null, win: null, pickEndsAt: null };
    this.#go('show', c.showMs, () => this.#go('shuffle', c.shuffleMs, () => {
      this.round.pickEndsAt = Date.now() + (Number(c.pickSeconds) || 30) * 1000;
      // 時間までに番号が来なければ、ランダムな番号でめくる
      this.#go('pick', (Number(c.pickSeconds) || 30) * 1000, () => this.#reveal(1 + Math.floor(this.random() * this.round.deck.length)));
    }));
  }

  #reveal(n) {
    if (this.phase !== 'pick') return;
    this.close();
    this.round.picked = n;
    this.round.win = this.random() < (Number(this.config.winRate) || 0);
    this.#go('reveal', this.config.revealMs, () => this.#go('done', this.config.doneMs, () => {
      this.phase = 'idle';
      this.round = null;
      this.#emit();
      const next = this.pending.shift();
      if (next) this.#begin(next);
    }));
  }

  #go(phase, ms, then) {
    this.phase = phase;
    this.#emit();
    const t = setTimeout(() => { this.timers.delete(t); then(); }, Math.max(0, Number(ms) || 0));
    if (typeof t.unref === 'function') t.unref();
    this.timers.add(t);
  }

  #view() {
    const r = this.round;
    if (!r) return { round: null };
    const c = this.config;
    return {
      round: {
        count: r.deck.length,
        // 表で見せるのは最初だけ。混ぜたあとは並びを渡さない(どこが当たりか分からないように)
        faces: this.phase === 'show' ? r.deck : null,
        picked: r.picked,
        result: this.phase === 'reveal' || this.phase === 'done' ? { win: r.win, label: r.win ? c.winLabel : c.loseLabel } : null,
        user: r.user,
        giftLabel: r.giftLabel,
        pickEndsAt: r.pickEndsAt,
        labels: { win: c.winLabel, lose: c.loseLabel },
        durations: { showMs: c.showMs, shuffleMs: c.shuffleMs, revealMs: c.revealMs, doneMs: c.doneMs },
      },
    };
  }

  #emit() {
    this.hub.broadcast({ type: 'cardDraw', phase: this.phase, seq: this.seq, pending: this.pending.length, ...this.#view() });
  }
}

export { PHASES };
