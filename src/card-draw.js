// カードめくり: 当たり・ハズレのカードを表で見せる → 裏返して混ぜる → 番号をつけて配る →
// ギフトを送った人がコメントで番号を言う(言わなければ時間切れで自動) → そのカードがめくれて結果。
// 結果は裏の設定だけで決める。裏は2通り：めくる瞬間に winRate の確率で決めるか、
// 実際に当たるカードの枚数（winCount）を決めて、選んだカードが当たりかどうかで決めるか。
// 表に見せる当たりの枚数は裏とは別に設定できる(showJackpot と showWinCount)。
// 確率が 0 のときは、並びに大当たりが出ていても当たらない。
import fs from 'node:fs';
import path from 'node:path';
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
  constructor(hub, { random = Math.random, onResult = null, stage = null, stageKey = 'local', storeFile = null } = {}) {
    this.hub = hub;
    this.random = random;
    // 舞台の順番待ち（src/stage-queue.js）。渡されたときだけ、開示の間は舞台の持ち主になる
    this.stage = stage ?? null;
    this.stageKey = stageKey;
    this.stageHeld = false; // 自分が舞台の持ち主か（取れなかったときは返さない）
    // 結果の記録口（管理画面の「最近の結果」用）。{ user, win, label, giftLabel, test } を渡す
    this.onResult = typeof onResult === 'function' ? onResult : null;
    this.config = defaultsFor('cardDraw');
    this.phase = 'idle';
    this.seq = 0;
    this.pending = [];
    this.round = null;
    this.timers = new Set();
    // 天井の数え（おみくじと同じ考え方）。保存先があれば再起動でも消えない
    this.storeFile = storeFile ? String(storeFile) : null;
    const savedPity = this.#loadPity();
    this.pityCount = savedPity.count; // 全体の天井の数え（当たりが出ていない回数）
    this.pityUsers = savedPity.users; // 個人の天井の数え（めくった人の鍵 → 当たりが出ていない回数）
    // 天井の数えは1回の配信の中だけ。配信が完全に終わったら0に戻す
    this.liveActive = false;
    if (this.hub && typeof this.hub.on === 'function') this.hub.on('status', (status) => this.#onStreamStatus(status));
  }

  /** 配信の状態の知らせ。配信が本当に終わったときだけ数えを戻す。
   * 接続し直しの途中（connecting）と、再接続の失敗（error）は配信の終了ではないので戻さない */
  #onStreamStatus(status) {
    const mode = status?.mode;
    if (mode === 'live') { this.liveActive = true; return; }
    if (mode !== 'ended' && mode !== 'idle' && mode !== 'demo') return;
    if (!this.liveActive) return;
    this.liveActive = false;
    if (this.pityCount !== 0 || this.pityUsers.size > 0) {
      this.pityCount = 0;
      this.pityUsers.clear();
      this.#savePity();
    }
  }

  /** 天井の数えの読み込み。保存先が無い・壊れているときは 0 から */
  #loadPity() {
    const empty = { count: 0, users: new Map() };
    if (!this.storeFile) return empty;
    try {
      const saved = JSON.parse(fs.readFileSync(this.storeFile, 'utf8'));
      const n = Number(saved?.pityCount);
      const users = new Map();
      if (saved?.pityUsers && typeof saved.pityUsers === 'object' && !Array.isArray(saved.pityUsers)) {
        for (const [key, value] of Object.entries(saved.pityUsers)) {
          const c = Number(value);
          if (key && Number.isFinite(c) && c > 0) users.set(key, Math.floor(c));
        }
      }
      return { count: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, users };
    } catch {
      return empty;
    }
  }

  /** 天井の数えの保存（版1）。おみくじと同じ格：仮ファイルへ書いてから入れ替える */
  #savePity() {
    if (!this.storeFile) return;
    try {
      fs.mkdirSync(path.dirname(this.storeFile), { recursive: true });
      const temp = `${this.storeFile}.tmp`;
      const data = { version: 1, pityCount: this.pityCount, pityUsers: Object.fromEntries(this.pityUsers) };
      fs.writeFileSync(temp, `${JSON.stringify(data)}\n`, { mode: 0o600 });
      fs.renameSync(temp, this.storeFile);
    } catch {
      // 保存に失敗しても抽選自体は止めない
    }
  }

  /** めくった人の鍵（個人の天井の数えの単位）。ID を優先し、無ければ名前。どちらも無ければ null */
  #userKey(trigger) {
    const user = trigger?.user;
    return user?.id ? `id:${user.id}` : user?.name ? `name:${user.name}` : null;
  }

  /** 個人の天井の数えの反映。個人の設定が無い・鍵が無いときは何もしない。0 は消す */
  #applyUserPity(userKey, userCount) {
    if (!userKey || userCount == null) return;
    if ((Number(this.config.pityPersonal) || 0) <= 0) return;
    if (userCount > 0) this.pityUsers.set(userKey, userCount);
    else this.pityUsers.delete(userKey);
  }

  /** 全体の天井の残り。当たりが出たら満タンへ戻る。個人の天井の残りはここには混ぜない */
  #pityLeft() {
    const every = Math.max(0, Number(this.config.pity) || 0);
    if (every <= 0) return null;
    return Math.max(0, every - this.pityCount);
  }

  setConfig(cfg) {
    this.config = { ...defaultsFor('cardDraw'), ...(cfg ?? {}) };
  }

  snapshot() {
    return { phase: this.phase, seq: this.seq, pending: this.pending.length, enabled: this.config.enabled !== false, pityCount: this.pityCount, pityLeft: this.#pityLeft(), ...this.#view() };
  }

  /** テストのラウンドを打ち切る。タイマーを全部止め、画面を空に戻す */
  #abortTest() {
    this.close();
    this.#releaseStage();
    this.phase = 'idle';
    this.round = null;
    // 待機に戻る知らせにもテストの印を付ける（見本の画面がテストの表示で止まらないように）
    this.#emit();
    this.trigger = null;
  }

  /** オフのときは null。めくっている間は待ち列に入れる(待ちに上限はつけない。投げた分は全部めくる)。
   * テストの開始は、本物のラウンドが進行中なら待ち列に入れず断る。進行中がテストなら、本物が割り込む */
  start(trigger = {}) {
    if (this.config.enabled === false) return null;
    if (this.phase !== 'idle') {
      if (trigger?.test === true) {
        return { ok: false, reason: 'busy', error: 'いま別のカードめくりが進行中です。終わってから試してください' };
      }
      if (this.trigger?.test === true) {
        this.#abortTest();
        this.#begin(trigger);
        return { ok: true, queued: false, seq: this.seq };
      }
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

  /** 舞台を返す。持ち主のときだけ（開示のときに取れていなければ何もしない） */
  #releaseStage() {
    if (!this.stageHeld) return;
    this.stageHeld = false;
    this.stage?.release(this.stageKey, 'cardDraw');
  }

  #reveal(n) {
    if (this.phase !== 'pick') return;
    this.close();
    // 開示から結果の表示が終わるまでは舞台の持ち主になる（おみくじの抽選はその間、順番待ちになる）。
    // 先に他の演出が使っていたら、ラウンドの途中なので待たずに進め、持ち主にはならない
    if (this.stage) this.stageHeld = this.stage.acquire(this.stageKey, 'cardDraw');
    this.round.picked = n;
    // 天井（おみくじと同じ意味）：全体か個人の数えが設定値に届いていたら、この回は当たり確定。
    // 当たりの決め方（確率・実際に当たるカードの枚数）にかかわらず当たりにし、枚数方式では
    // 選んだ位置へ当たりを寄せる（当たりが1枚も用意されていない設定では、その1枚だけ足す）
    const userKey = this.#userKey(this.trigger);
    const userCount = userKey ? (this.pityUsers.get(userKey) ?? 0) : null;
    const pityEvery = Math.max(0, Number(this.config.pity) || 0);
    const personalEvery = Math.max(0, Number(this.config.pityPersonal) || 0);
    const forced = (pityEvery > 0 && this.pityCount >= pityEvery)
      || (personalEvery > 0 && userCount != null && userCount >= personalEvery);
    this.round.forced = forced;
    if (forced) {
      this.round.win = true;
      if (this.round.reals && this.round.reals[n - 1] !== true) {
        const other = this.round.reals.findIndex((face, i) => i !== n - 1 && face === true);
        if (other >= 0) [this.round.reals[n - 1], this.round.reals[other]] = [this.round.reals[other], this.round.reals[n - 1]];
        else this.round.reals[n - 1] = true;
      }
    } else {
      this.round.win = this.round.reals ? this.round.reals[n - 1] === true : this.random() < (Number(this.config.winRate) || 0);
    }
    // 結果が決まったら、カードの並びを結果に合わせる（外れたとき、どこに当たりがあったかを見せるため）。
    // 並びは最初から両方（当たり・ハズレ）を含むので、選んだ位置と入れ替えるだけで合わせられる。
    // 確率 0（当たり無し）と確率 1（全部当たり）は、並びと結果が最初から一致している。
    // 例外は天井で当たりになった確率 0 の回：並びに当たりが1枚も無いので、選んだ位置だけ当たりにする
    const deck = this.round.deck;
    if (!this.round.reals && deck[n - 1] !== this.round.win) {
      const other = deck.findIndex((face, i) => i !== n - 1 && face === this.round.win);
      if (other >= 0) [deck[n - 1], deck[other]] = [deck[other], deck[n - 1]];
      else if (this.round.win) deck[n - 1] = true;
    }
    // 天井の数えを進める（テストのめくりでは進めない。おみくじと同じ線引き）。
    // 当たりが出たら全体は 0 に戻り、めくった本人の数えも 0 に戻る
    if (this.trigger?.test !== true && this.trigger?.kind !== 'test') {
      if (this.round.win) {
        this.pityCount = 0;
        this.#applyUserPity(userKey, userCount == null ? null : 0);
      } else {
        this.pityCount += 1;
        this.#applyUserPity(userKey, userCount == null ? null : userCount + 1);
      }
      this.#savePity();
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
      this.#releaseStage();
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
        // 混ぜて配ったあとは並びを渡さない(どこが当たりか分からないように)。
        // 結果の段階で渡すのは「実際に当たるカード」の並び（reals）。表の並び（並びに出す大当たり）を
        // そのまま渡すと、選んだカードが結果と違う文字でめくれてしまう（当たりが無い設定でも大吉が出たように見える）
        faces: this.phase === 'show' ? r.deck : this.phase === 'reveal' || this.phase === 'done' ? (r.reals ?? r.deck) : null,
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
