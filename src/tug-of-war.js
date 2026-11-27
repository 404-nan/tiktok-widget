// 綱引きギフトバトルのエンジン。視聴者が左右2チームに分かれ、ギフトのコイン（といいね）で綱を引き合う。
// チームの振り分け・引く力・残り時間・決着・MVP をサーバー側で持ち、WebSocket で配る（ファイルには保存しない）。

import { giftMatches } from './gifts.js';

export const SIDES = ['left', 'right'];
// 同じチームのギフトがこの間隔の中で続くと、コンボの数を上げる
export const COMBO_GAP_MS = 5000;
// 画面のチームごとの「応援上位」に出す人数（表示だけ。集計は全員ぶん持つ）
export const TOP_SHOWN = 3;
const MAX_SECONDS = 3600;

const other = (side) => (side === 'left' ? 'right' : 'left');
const userKey = (user) => String(user?.id || user?.name || '').trim();
const slimUser = (user) => ({ id: user?.id ?? null, name: String(user?.name ?? '').trim() || '名無し', avatar: user?.avatar ?? null });
const slimGift = (gift) => (gift ? { id: gift.id ?? null, name: gift.name ?? null, nameJa: gift.nameJa ?? null, image: gift.image ?? null, icon: gift.icon ?? null, diamonds: gift.diamonds ?? null, count: gift.count ?? 1 } : null);

/** コメントと参加の言葉を比べる形にそろえる（前後の空白・全角英数・大文字小文字） */
export function normalizeWord(text) {
  return String(text ?? '')
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]+/g, '')
    .toLowerCase();
}

function number(value, fallback) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function newTeam() {
  return { power: 0, combo: 0, lastHitAt: 0, contributors: new Map() };
}

export class TugOfWarEngine {
  constructor(hub, { onResult = null, onError = null } = {}) {
    this.hub = hub;
    this.onResult = onResult;
    this.onError = onError;
    this.config = {};
    this.enabled = true;
    // チームの顔ぶれは試合をまたいで残す（次の試合もそのまま遊べる）。reset で空にする
    this.members = new Map();
    this.battle = this.#newBattle();
    this.timer = null;
    hub.on('event', (event) => this.onEvent(event));
    // 配信中のテスト送信（集計に入らないもの）も、綱は動かす。試合はテストの印つきになる
    hub.on('testEvent', (event) => this.onEvent(event));
    hub.on('reset', () => this.reset());
  }

  /** プランで使えるか。使えなくなったら試合と顔ぶれを片づける */
  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled && this.#busy()) this.reset();
  }

  setConfig(config) {
    this.config = config && typeof config === 'object' ? config : {};
    if (this.config.enabled === false) {
      if (this.#busy()) this.reset();
    } else if (this.battle.phase !== 'idle') {
      this.#broadcast('config'); // 試合中にチーム名や色を変えたら、その場で画面に出す
    }
  }

  get active() {
    return this.enabled && this.config.enabled !== false;
  }

  /** 試合を始める。seconds があれば今回だけその秒数。test なら決着の動作を動かさない */
  start({ seconds, test = false } = {}) {
    this.#assertActive();
    if (this.battle.phase === 'battle') throw new Error('もう試合中です');
    const requested = seconds == null || seconds === '' ? number(this.config.seconds, 180) : Number(seconds);
    if (!Number.isFinite(requested) || requested < 0) throw new Error('試合の秒数は 0 以上にしてください');
    const length = Math.min(MAX_SECONDS, Math.floor(requested));
    const isTest = test === true || test === 'true' || test === '1';
    if (!isTest) {
      // テスト試合で入った架空の参加者は本番の自動振り分けに残さない
      for (const [key, m] of this.members) if (m.test) this.members.delete(key);
    }
    this.#clearTimer();
    this.battle = this.#newBattle();
    this.battle.phase = 'battle';
    this.battle.test = isTest;
    this.battle.seconds = length;
    this.battle.startedAt = Date.now();
    this.battle.endsAt = length > 0 ? this.battle.startedAt + length * 1000 : null;
    if (this.battle.endsAt) {
      this.timer = setTimeout(() => this.#finish('timeout'), length * 1000);
      this.timer.unref?.();
    }
    this.#broadcast('start');
    return this.snapshot();
  }

  /** 手で締めて、その時点の力で決着させる */
  finish() {
    this.#assertActive();
    if (this.battle.phase !== 'battle') throw new Error('いまは試合中ではありません');
    this.#finish('finish');
    return this.snapshot();
  }

  /** 試合もチームの顔ぶれも空にして待機に戻す */
  reset() {
    this.#clearTimer();
    this.members.clear();
    this.battle = this.#newBattle();
    this.#broadcast('reset');
    return this.snapshot();
  }

  /**
   * ダッシュボードの「試す」。本物のイベントを作らず（集計・記録・ほかの演出に入れず）、ここだけで綱を引く。
   * 試合中でなければテストの試合を始めてから引く。
   */
  test({ side = 'left', coins = 100, name } = {}) {
    this.#assertActive();
    if (!SIDES.includes(side)) throw new Error('チームは left（左）か right（右）を選んでください');
    const amount = Math.floor(number(coins, 100));
    if (!(amount > 0)) throw new Error('コインは 1 以上にしてください');
    if (this.battle.phase !== 'battle') this.start({ test: true });
    const label = String(name ?? '').trim() || (side === 'left' ? 'テスト参加者A' : 'テスト参加者B');
    const user = { id: `test_${label}`, name: label, avatar: null };
    this.#join(user, side, false, true);
    this.#pull(side, user, amount, { kind: 'gift', gift: { id: '5655', name: 'Rose', icon: 'flower-2', diamonds: 1, count: amount }, test: true });
    return this.snapshot();
  }

  onEvent(event) {
    if (!this.active || !event) return;
    try {
      if (event.kind === 'chat') this.#onChat(event);
      else if (event.kind === 'gift') this.#onGift(event);
      else if (event.kind === 'like') this.#onLike(event);
    } catch (error) {
      // 1件の処理の失敗で、試合の進行は止めない。原因は呼び出し側で記録する
      this.onError?.(error, { op: `tugOfWar.${event.kind}` });
    }
  }

  snapshot() {
    const b = this.battle;
    const c = this.config;
    const team = (side) => {
      const t = b.teams[side];
      return {
        name: String(c[`${side}Name`] ?? (side === 'left' ? '赤チーム' : '青チーム')),
        color: c[`${side}Color`] ?? (side === 'left' ? '#FF3B5C' : '#2F8CFF'),
        words: Array.isArray(c[`${side}Words`]) ? c[`${side}Words`].map(String) : [],
        power: Math.floor(t.power),
        members: this.#memberCount(side),
        combo: t.combo,
        top: this.#ranking(side).slice(0, TOP_SHOWN),
      };
    };
    return {
      enabled: this.active,
      phase: b.phase,
      title: String(c.title ?? '綱引きギフトバトル'),
      test: b.test,
      seconds: b.seconds,
      startedAt: b.startedAt,
      endsAt: b.endsAt,
      now: Date.now(),
      koLead: Math.max(0, Math.floor(number(c.koLead, 0))),
      idleMode: c.idleMode ?? 'entry',
      left: team('left'),
      right: team('right'),
      leader: b.leader,
      reversals: b.reversals,
      winner: b.winner,
      reason: b.reason,
      mvp: b.mvp ? { ...b.mvp, user: { ...b.mvp.user } } : null,
    };
  }

  close() {
    this.#clearTimer();
  }

  #newBattle() {
    return {
      phase: 'idle', test: false, seconds: 0, startedAt: null, endsAt: null,
      teams: { left: newTeam(), right: newTeam() },
      leader: null, reversals: 0, winner: null, reason: null, mvp: null,
    };
  }

  #busy() {
    return this.battle.phase !== 'idle' || this.members.size > 0;
  }

  #assertActive() {
    if (!this.enabled) throw new Error('綱引きギフトバトルは使えるプランではありません');
    if (this.config.enabled === false) throw new Error('綱引きギフトバトルは「使う」がオフです');
  }

  #onChat(event) {
    const said = normalizeWord(event.text);
    if (!said) return;
    const side = SIDES.find((s) => (this.config[`${s}Words`] ?? []).some((w) => normalizeWord(w) === said));
    if (!side) return;
    this.#join(event.user, side, this.config.allowSwitch === true, event.test === true);
  }

  #onGift(event) {
    if (this.battle.phase !== 'battle') return; // 試合の前・決着のあとのギフトは数えない（README の「上限と飛ばすルール」）
    const coins = Math.max(0, number(event.totalDiamonds, 0));
    if (!(coins > 0)) return;
    // 指定ギフトは、送った人のチームに関係なくそのチームの力になる（加勢ギフト）
    const pinned = SIDES.find((s) => giftMatches(event.gift, this.config[`${s}Gifts`] ?? []));
    const side = pinned ?? this.#sideOf(event.user, true, event.test === true);
    if (!side) return;
    this.#pull(side, event.user, coins, { kind: 'gift', gift: slimGift(event.gift), test: event.test === true });
  }

  #onLike(event) {
    if (this.battle.phase !== 'battle') return;
    const per = number(this.config.likesPerPower, 0);
    if (!(per > 0)) return;
    const count = Math.max(0, number(event.count, 0));
    if (!(count > 0)) return;
    const side = this.#sideOf(event.user, this.config.autoJoin !== 'none', event.test === true);
    if (!side) return;
    // いいねは整数で端数を持ち越し、浮動小数の丸め誤差（0.1×10 < 1）で同点判定が狂うのを防ぐ
    const team = this.battle.teams[side];
    const carry = (team.likeCarry ?? 0) + count;
    const gained = Math.floor(carry / per);
    team.likeCarry = carry - gained * per;
    if (gained > 0) this.#pull(side, event.user, gained, { kind: 'like', likes: count, test: event.test === true });
  }

  /** その人のチーム。まだ決まっていなければ、自動の振り分けが有効なとき人数の少ない方へ入れる */
  #sideOf(user, allowAuto, test) {
    const key = userKey(user);
    if (key && this.members.has(key)) return this.members.get(key).side;
    if (!allowAuto || this.config.autoJoin === 'none') return null;
    const left = this.#memberCount('left');
    const right = this.#memberCount('right');
    // 人数が同じなら、力の弱い方へ入れて試合を拮抗させる
    const side = left !== right ? (left < right ? 'left' : 'right') : this.battle.teams.left.power <= this.battle.teams.right.power ? 'left' : 'right';
    if (key) this.#join(user, side, false, test, true);
    return side;
  }

  #join(user, side, allowSwitch, test = false, auto = false) {
    const key = userKey(user);
    if (!key) return;
    const current = this.members.get(key);
    if (current && (current.side === side || !allowSwitch)) return;
    this.members.set(key, { side, user: slimUser(user), test: Boolean(test) });
    this.hub.broadcast({ type: 'tugOfWar', event: 'join', join: { side, user: slimUser(user), auto, switched: Boolean(current) }, state: this.snapshot(), test: test || this.battle.test });
  }

  #memberCount(side) {
    let n = 0;
    for (const m of this.members.values()) if (m.side === side) n += 1;
    return n;
  }

  #pull(side, user, power, detail) {
    const b = this.battle;
    const team = b.teams[side];
    const now = Date.now();
    if (detail.test) b.test = true;
    team.power += power;
    // コンボ: 同じチームのギフトが続けて届いたら数を上げる。相手のギフトが来たら相手の数は切れる
    if (detail.kind === 'gift') {
      team.combo = now - team.lastHitAt <= COMBO_GAP_MS ? team.combo + 1 : 1;
      team.lastHitAt = now;
      b.teams[other(side)].combo = 0;
    }
    const key = userKey(user) || '?';
    const row = team.contributors.get(key) ?? { user: slimUser(user), power: 0, gifts: 0 };
    row.user = slimUser(user);
    row.power += power;
    if (detail.kind === 'gift') row.gifts += 1;
    team.contributors.set(key, row);
    const before = b.leader;
    b.leader = this.#currentLeader();
    const reversal = Boolean(before && b.leader && before !== b.leader);
    if (reversal) b.reversals += 1;
    const hit = {
      side, user: slimUser(user), power: Math.round(power * 10) / 10, kind: detail.kind,
      gift: detail.gift ?? null, likes: detail.likes ?? null,
      combo: detail.kind === 'gift' ? team.combo : 0, reversal, test: detail.test === true,
    };
    this.#broadcast('hit', { hit });
    const lead = Math.abs(b.teams.left.power - b.teams.right.power);
    const ko = Math.max(0, number(this.config.koLead, 0));
    if (ko > 0 && lead >= ko) this.#finish('ko');
  }

  #currentLeader() {
    const { left, right } = this.battle.teams;
    if (left.power === right.power) return this.battle.leader; // 並んだときは前の先頭のまま（逆転は「抜いた」ときだけ）
    return left.power > right.power ? 'left' : 'right';
  }

  #ranking(side) {
    return [...this.battle.teams[side].contributors.values()]
      .sort((a, b) => b.power - a.power)
      .map((row) => ({ user: { ...row.user }, power: Math.floor(row.power), gifts: row.gifts }));
  }

  #finish(reason) {
    const b = this.battle;
    if (b.phase !== 'battle') return;
    this.#clearTimer();
    const { left, right } = b.teams;
    b.phase = 'result';
    b.reason = reason;
    b.winner = left.power === right.power ? 'draw' : left.power > right.power ? 'left' : 'right';
    // MVP: 勝ったチームでいちばん引いた人。引き分けなら両チームでいちばん引いた人
    const pool = b.winner === 'draw'
      ? [...this.#ranking('left').map((r) => ({ ...r, side: 'left' })), ...this.#ranking('right').map((r) => ({ ...r, side: 'right' }))].sort((x, y) => y.power - x.power)
      : this.#ranking(b.winner).map((r) => ({ ...r, side: b.winner }));
    b.mvp = pool[0] ? { side: pool[0].side, user: pool[0].user, power: pool[0].power, gifts: pool[0].gifts } : null;
    this.#broadcast('result');
    if (b.winner === 'draw' || b.test) return; // テストの試合と引き分けでは、決着の動作を動かさない
    try {
      this.onResult?.({ actions: Array.isArray(this.config.resultActions) ? this.config.resultActions : [], result: this.snapshot() });
    } catch (error) {
      this.onError?.(error, { op: 'tugOfWar.result' });
    }
  }

  #broadcast(event, extra = {}) {
    this.hub.broadcast({ type: 'tugOfWar', event, state: this.snapshot(), test: this.battle.test, ...extra });
  }

  #clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
