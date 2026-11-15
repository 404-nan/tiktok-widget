// カードめくり: 当たり・ハズレのカードを表で見せる → 裏返して混ぜる → 番号をつけて配る →
// ギフトを送った人がコメントで番号を言う(言わなければ時間切れで自動) → そのカードがめくれて結果。
// 結果は裏の設定だけで決める。裏は2通り：めくる瞬間に winRate の確率で決めるか、
// 実際に当たるカードの枚数（winCount）を決めて、選んだカードが当たりかどうかで決めるか。
// 表に見せる当たりの枚数は裏とは別に設定できる(showJackpot と showWinCount)。
// 確率が 0 のときは、並びに大当たりが出ていても当たらない。
import { defaultsFor } from './schema.js';
import { giftDisplayName, giftMatches } from './gifts.js';

const PHASES = ['show', 'shuffle', 'pick', 'reveal', 'done'];

/** 見せるカードの並び。ふだんの当たりの枚数は count × winRate を四捨五入（確率が 0 より大きければ最低1枚）。
 * showJackpot のときは確率とは切り離し、showWinCount 枚を並びに出す（当たるかどうかは裏の設定だけで決まる） */
export function deckOf(count, winRate, random = Math.random, showJackpot = false, showWinCount = 1) {
  const n = Math.max(2, Math.round(count));
  let wins = winRate > 0 ? Math.min(n - 1, Math.max(1, Math.round(n * winRate))) : 0;
  if (showJackpot) wins = Math.min(n, Math.max(0, Math.round(Number(showWinCount) || 0)));
  const deck = Array.from({ length: n }, (_, i) => i < wins);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** 実際に当たるカードの並び（winCount 枚だけ true）。選んだ位置が true なら当たり */
export function realsOf(count, winCount, random = Math.random) {
  const n = Math.max(2, Math.round(count));
  const w = Math.min(n, Math.max(0, Math.round(Number(winCount) || 0)));
  const arr = Array.from({ length: n }, (_, i) => i < w);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  constructor(hub, { random = Math.random, onResult = null } = {}) {
    this.hub = hub;
    this.random = random;
    // 結果の記録口（管理画面の「最近の結果」用）。{ user, win, label, giftLabel, test } を渡す
    this.onResult = typeof onResult === 'function' ? onResult : null;
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
    this.start({ kind: 'gift', test: Boolean(e.test), giftLabel: giftDisplayName(e.gift), coins: Number(e.totalDiamonds) || 0, user: e.user ? { id: e.user.id, name: e.user.name } : null });
  }

  close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  #begin(trigger) {
    this.trigger = trigger;
    this.seq += 1;
    const c = this.config;
    const count = Number(c.count) || 8;
    const wc = Number(c.winCount);
    // 裏の決め方：winCount が 0 以上なら「実際に当たるカードの枚数」で決め、-1（未設定）なら確率で決める
    const byCount = Number.isFinite(wc) && wc >= 0;
    const reals = byCount ? realsOf(count, wc, this.random) : null;
    // 表の並び：枚数で決める回で「並びに出す」が切れているときは、実際に当たるカードそのままを見せる
    const deck = byCount && c.showJackpot !== true
      ? [...reals]
      : deckOf(count, Number(c.winRate) || 0, this.random, c.showJackpot === true, c.showWinCount);
    this.round = { user: trigger.user ?? null, giftLabel: trigger.giftLabel ?? null, deck, reals, picked: null, win: null, pickEndsAt: null, startedAt: Date.now() };
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
    this.round.win = this.round.reals ? this.round.reals[n - 1] === true : this.random() < (Number(this.config.winRate) || 0);
    // 結果が決まったら、カードの並びを結果に合わせる（外れたとき、どこに当たりがあったかを見せるため）。
    // 並びは最初から両方（当たり・ハズレ）を含むので、選んだ位置と入れ替えるだけで合わせられる。
    // 確率 0（当たり無し）と確率 1（全部当たり）は、並びと結果が最初から一致している。
    const deck = this.round.deck;
    if (!this.round.reals && deck[n - 1] !== this.round.win) {
      const other = deck.findIndex((face, i) => i !== n - 1 && face === this.round.win);
      if (other >= 0) [deck[n - 1], deck[other]] = [deck[other], deck[n - 1]];
    }
    if (this.onResult) {
      const c = this.config;
      try {
        this.onResult({
          user: this.round.user?.name ?? null,
          win: this.round.win,
          label: this.round.win ? c.winLabel : c.loseLabel,
          giftLabel: this.round.giftLabel,
          test: Boolean(this.trigger?.test) || this.trigger?.kind === 'test' || this.trigger?.kind === 'dev',
          at: this.round.startedAt,
        });
      } catch {
        // 記録に失敗しても抽選自体は止めない
      }
    }
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
        // 表で見せるのは最初と、結果が出たあと（外れたとき、どこに当たりがあったかを見せる）だけ。
        // 混ぜて配ったあとは並びを渡さない(どこが当たりか分からないように)
        faces: this.phase === 'show' || this.phase === 'reveal' || this.phase === 'done' ? r.deck : null,
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
    this.hub.broadcast({ type: 'cardDraw', phase: this.phase, seq: this.seq, pending: this.pending.length, ...this.#view(), ...(this.trigger?.test ? { test: true } : {}) });
  }
}

export { PHASES };
