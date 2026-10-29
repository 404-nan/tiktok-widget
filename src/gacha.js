// 高額ギフトなどのガチャ（name='omikuji' ならおみくじ。同じ仕組みで設定・画面・イベント名だけ別）。待機 → 回転 → 結果 → 終了。一度に1回で、重なった分は待ち列。
// おみくじは回す前に「番号を選ぶ」段階（pick）を入れられる。送った人のコメント / 配信者のボタン / 時間切れでランダム。運勢は番号と関係なく重みで決める。
// 画面は /widgets/gacha.html・/widgets/omikuji.html。各段階の長さはイベントに載せる。

import { defaultsFor } from './schema.js';
import { giftDisplayName, giftMatches } from './gifts.js';
import { pickNumber } from './card-draw.js';

/** おみくじの棒の数（番号は 1〜STICKS） */
export const STICKS = 10;


/**
 * レアリティを1つ引く。pityEvery 回以上、天井対象以外が続いたら次は天井。
 * pityCount は天井対象を引いたら 0 に戻る。
 */
export function rollTier(tiers, pityCount = 0, pityEvery = 0, random = Math.random) {
  const list = (Array.isArray(tiers) ? tiers : []).filter((tier) => Number(tier?.weight) > 0);
  if (!list.length) return { tier: { id: 'none', label: '？', weight: 1, pity: false }, pityCount, forced: false };
  const pityTier = list.find((tier) => tier.pity === true);
  const count = Math.max(0, Number(pityCount) || 0);
  const every = Math.max(0, Number(pityEvery) || 0);
  if (every > 0 && pityTier && count >= every) return { tier: pityTier, pityCount: 0, forced: true };
  const total = list.reduce((sum, tier) => sum + Number(tier.weight), 0);
  let cursor = Number(random()) * total;
  let picked = list[list.length - 1];
  for (const tier of list) {
    cursor -= Number(tier.weight);
    if (cursor < 0) {
      picked = tier;
      break;
    }
  }
  return { tier: picked, pityCount: picked.pity === true ? 0 : count + 1, forced: false };
}

export class Gacha {
  constructor(hub, { bus = null, random = null, name = 'gacha' } = {}) {
    this.name = name;
    this.hub = hub;
    this.bus = bus;
    this.random = typeof random === 'function' ? random : Math.random;
    this.config = defaultsFor(name);
    this.phase = 'idle';
    this.seq = 0;
    this.pityCount = 0;
    this.pending = [];
    this.tier = null;
    this.forced = false;
    this.trigger = null;
    this.stick = null; // 選ばれた棒の番号
    this.pick = null; // 番号を選んでいる間だけ { by: 'viewer' | 'streamer', count, endsAt }
    this.durations = durationsOf(this.config);
    this.timers = new Set();
  }

  setBus(bus) {
    this.bus = bus ?? null;
  }

  setConfig(cfg) {
    const base = defaultsFor(this.name);
    this.config = { ...base, ...(cfg ?? {}) };
    if (!Array.isArray(this.config.tiers) || !this.config.tiers.length) this.config.tiers = base.tiers;
  }

  snapshot() {
    const show = this.phase === 'reveal' || this.phase === 'done';
    return {
      phase: this.phase,
      seq: this.seq,
      durations: this.durations,
      pityCount: this.pityCount,
      pending: this.pending.length,
      enabled: this.config.enabled !== false,
      tier: show ? this.tier : null,
      forced: show ? this.forced : false,
      trigger: this.trigger,
      pick: this.pick,
      stick: this.stick,
    };
  }

  /** 配信者が番号を選ぶ（配信者の番のときだけ） */
  choose(n) {
    if (this.phase !== 'pick' || this.pick?.by !== 'streamer') return { ok: false, error: '今は配信者が番号を選ぶときではありません' };
    const stick = pickNumber(String(n), this.pick.count);
    if (!stick) return { ok: false, error: `番号は 1〜${this.pick.count} です` };
    this.#roll(stick);
    return { ok: true, stick };
  }

  /** オフのときは null。回しているときは待ち列に入れる */
  start(trigger = {}) {
    if (this.config.enabled === false) return null;
    const next = trigger && typeof trigger === 'object' ? trigger : { kind: 'action' };
    if (this.phase !== 'idle') {
      // 待ちに上限はつけない。投げた分は全部回す
      this.pending.push(next);
      return { ok: true, queued: true, pending: this.pending.length, phase: this.phase, seq: this.seq };
    }
    return this.#begin(next);
  }

  onEvent(e) {
    if (this.config.enabled === false) return;
    if (e?.kind === 'chat' && this.pick?.by === 'viewer') {
      // 番号を拾うのは、ギフトを送った本人のコメントだけ
      const who = this.trigger?.user;
      const same = who && (e.user?.id ? e.user.id === who.id : e.user?.name === who.name);
      const stick = same ? pickNumber(e.text, this.pick.count) : null;
      if (stick) this.#roll(stick);
      return;
    }
    if (e?.kind !== 'gift') return;
    const gifts = Array.isArray(this.config.gifts) ? this.config.gifts : [];
    const min = Number(this.config.minCoins) || 0;
    const byGift = gifts.length > 0 && giftMatches(e.gift, gifts);
    const byCoins = min > 0 && (Number(e.totalDiamonds) || 0) >= min;
    if (!byGift && !byCoins) return;
    this.start({
      kind: 'gift',
      source: 'gift',
      giftLabel: giftDisplayName(e.gift),
      giftId: e.gift?.id ?? null,
      coins: Number(e.totalDiamonds) || 0,
      user: e.user ? { id: e.user.id, name: e.user.name } : null,
    });
  }

  close() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  #begin(trigger) {
    this.seq += 1;
    this.trigger = trigger;
    this.durations = durationsOf(this.config);
    const mode = this.config.pickMode;
    // 送った人が分からない（テスト・動作から）ときは、時間切れと同じ扱いにする
    if (mode === 'viewer' && trigger.user) this.#waitPick('viewer');
    else if (mode === 'streamer' || (mode === 'viewer' && this.config.timeoutMode === 'streamer')) this.#waitPick('streamer');
    else this.#roll(this.#randomStick(), true);
    return { ok: true, queued: false, phase: this.phase, seq: this.seq, durations: { ...this.durations } };
  }

  /**
   * 番号を待つ。送った人の時間切れは timeoutMode に従い、配信者の番も時間切れならランダムで引く（止まったままにしない）
   */
  #waitPick(by) {
    const first = this.phase !== 'pick';
    const seconds = Math.max(1, Number(this.config.pickSeconds) || 10);
    this.phase = 'pick';
    this.pick = { by, count: STICKS, endsAt: Date.now() + seconds * 1000 };
    if (first) this.#emit('start');
    this.#emit('pick');
    this.#arm(seconds * 1000, () => {
      if (this.phase !== 'pick') return;
      if (by === 'viewer' && this.config.timeoutMode === 'streamer') this.#waitPick('streamer');
      else this.#roll(this.#randomStick());
    });
  }

  #randomStick() {
    return 1 + Math.floor(this.random() * STICKS);
  }

  /** 棒が決まったら振って引く。運勢は番号と関係なく、ここで重みで決める */
  #roll(stick, first = false) {
    this.close();
    this.stick = stick;
    this.pick = null;
    this.phase = 'rolling';
    const rolled = rollTier(this.config.tiers, this.pityCount, Number(this.config.pity) || 0, this.random);
    this.pityCount = rolled.pityCount;
    this.tier = rolled.tier;
    this.forced = rolled.forced;
    if (first) this.#emit('start');
    this.#emit('rolling');
    this.#arm(this.durations.rollMs, () => {
      if (this.phase !== 'rolling') return;
      this.phase = 'reveal';
      this.#emit('reveal');
      this.#arm(this.durations.revealMs, () => {
        if (this.phase !== 'reveal') return;
        this.phase = 'done';
        this.#emit('done');
        this.#arm(this.durations.doneMs, () => {
          if (this.phase !== 'done') return;
          this.phase = 'idle';
          this.tier = null;
          this.forced = false;
          this.trigger = null;
          this.stick = null;
          this.#emit('idle');
          const next = this.pending.shift();
          if (next) this.#begin(next);
        });
      });
    });
  }

  #emit(name) {
    const show = name === 'reveal' || name === 'done';
    const payload = {
      phase: name === 'idle' ? 'idle' : this.phase,
      seq: this.seq,
      durations: this.durations,
      trigger: this.trigger,
      pityCount: this.pityCount,
      pending: this.pending.length,
      tier: show ? this.tier : null,
      forced: show ? this.forced : false,
      pick: this.pick,
      stick: this.stick,
      event: name,
    };
    this.hub.broadcast({ type: this.name, ...payload });
    const type = `${this.name}.${name}`;
    this.bus?.emit(type, payload);
  }

  #arm(ms, fn) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, Math.max(0, Number(ms) || 0));
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.add(timer);
  }
}

function durationsOf(cfg) {
  const n = (v, fallback) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : fallback;
  };
  return {
    rollMs: n(cfg?.rollMs, 3000),
    revealMs: n(cfg?.revealMs, 2500),
    doneMs: n(cfg?.doneMs, 1200),
  };
}
