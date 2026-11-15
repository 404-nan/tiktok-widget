// 高額ギフトなどのガチャ（name='omikuji' ならおみくじ。同じ仕組みで設定・画面・イベント名だけ別）。待機 → 回転 → 結果 → 終了。一度に1回で、重なった分は待ち列。
// おみくじは回す前に「番号を選ぶ」段階（pick）を入れられる。送った人のコメント / 配信者のボタン / 時間切れでランダム。運勢は番号と関係なく重みで決める。
// 画面は /widgets/gacha.html・/widgets/omikuji.html。各段階の長さはイベントに載せる。

import fs from 'node:fs';
import path from 'node:path';
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
  const all = Array.isArray(tiers) ? tiers : [];
  const list = all.filter((tier) => Number(tier?.weight) > 0);
  if (!list.length) return { tier: { id: 'none', label: '？', weight: 1, pity: false }, pityCount, forced: false };
  // 重み 0 は「出ない」という指定なので、天井でも出さない。天井の対象は重みが 1 以上ある対象だけに限る。
  // 対象の重みが 0 のときは天井は発動せず、通常の抽選になる（数えはそのまま増える）。
  const pityTier = all.find((tier) => tier?.pity === true && Number(tier?.weight) > 0);
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
  constructor(hub, { bus = null, random = null, name = 'gacha', storeFile = null } = {}) {
    this.name = name;
    this.hub = hub;
    this.bus = bus;
    this.random = typeof random === 'function' ? random : Math.random;
    this.storeFile = storeFile ? String(storeFile) : null;
    this.config = defaultsFor(name);
    this.phase = 'idle';
    this.seq = 0;
    this.pityCount = this.#loadPity();
    this.pending = [];
    this.tier = null;
    this.forced = false;
    this.trigger = null;
    this.tenResults = null; // 10連の間だけ [{ tier, stick, forced }]（おみくじのみ）
    this.stick = null; // 選ばれた棒の番号
    this.pick = null; // 番号を選んでいる間だけ { by: 'viewer' | 'streamer', count, endsAt }（endsAt はサーバーの時計）
    this.durations = durationsOf(this.config, this.name);
    this.timers = new Set();
    // 天井の数えは1回の配信の中だけ。配信が完全に終わったら0に戻す
    this.liveActive = false;
    if (this.hub && typeof this.hub.on === 'function') this.hub.on('status', (status) => this.#onStreamStatus(status));
  }

  /** 配信の状態の知らせ。live が終わったときだけ数えを戻す（接続し直しの間は戻さない） */
  #onStreamStatus(status) {
    const mode = status?.mode;
    if (mode === 'live') { this.liveActive = true; return; }
    if (mode === 'connecting') return;
    if (!this.liveActive) return;
    this.liveActive = false;
    if (this.pityCount !== 0) {
      this.pityCount = 0;
      this.#savePity();
    }
  }

  /** 天井の数えの読み込み。保存先が無い・壊れているときは 0 から */
  #loadPity() {
    if (!this.storeFile) return 0;
    try {
      const saved = JSON.parse(fs.readFileSync(this.storeFile, 'utf8'));
      const n = Number(saved?.pityCount);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  /** 天井の数えの保存。お金まわり（ポイント）と同じ格：仮ファイルへ書いてから入れ替える */
  #savePity() {
    if (!this.storeFile) return;
    try {
      fs.mkdirSync(path.dirname(this.storeFile), { recursive: true });
      const temp = `${this.storeFile}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify({ version: 1, pityCount: this.pityCount })}\n`, { mode: 0o600 });
      fs.renameSync(temp, this.storeFile);
    } catch {
      // 保存に失敗しても抽選自体は止めない
    }
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
      results: this.phase === 'ten' || (this.phase === 'done' && this.tenResults) ? this.tenResults : null,
      trigger: this.trigger,
      pick: this.#pickView(),
      stick: this.stick,
      ...this.#displayOptions(),
    };
  }

  #displayOptions() {
    return this.name === 'omikuji'
      ? { displayMode: this.config.displayMode, resultFont: this.config.resultFont }
      : {};
  }

  /** 画面へ渡す番号待ち。配信 PC の時計とずれても合うよう、締め切りの時刻ではなく残りのミリ秒を渡す */
  #pickView() {
    if (!this.pick) return null;
    const { by, count, endsAt } = this.pick;
    return { by, count, leftMs: Math.max(0, endsAt - Date.now()) };
  }

  /** 配信者が番号を選ぶ（配信者の番のときだけ） */
  choose(n) {
    if (this.phase !== 'pick' || this.pick?.by !== 'streamer') return { ok: false, error: '今は配信者が番号を選ぶときではありません' };
    const stick = pickNumber(String(n), this.pick.count);
    if (!stick) return { ok: false, error: `番号は 1〜${this.pick.count} です` };
    this.#roll(stick);
    return { ok: true, stick };
  }

  /** テストの抽選を打ち切る。タイマーを全部止め、画面を空に戻す */
  #abortTest() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.phase = 'idle';
    this.trigger = null;
    this.tier = null;
    this.forced = false;
    this.tenResults = null;
    this.stick = null;
    this.pick = null;
    this.#emit('idle');
  }

  /** オフのときは null。回しているときは待ち列に入れる */
  start(trigger = {}) {
    if (this.config.enabled === false) return null;
    const next = trigger && typeof trigger === 'object' ? trigger : { kind: 'action' };
    if (this.phase !== 'idle') {
      // テストの開始は、本物の抽選が進行中なら待ち列に入れず断る（順番を変えないため）
      if (next.test === true || next.kind === 'test') {
        return { ok: false, reason: 'busy', error: '本物の抽選が進行中です。終わってから試してください' };
      }
      // 進行中がテストの抽選なら、本物を後ろに並ばせず、テストを打ち切って本物を先に通す
      if (this.trigger?.test === true || this.trigger?.kind === 'test') {
        this.#abortTest();
        return this.#begin(next);
      }
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
    // おみくじは、ギフトを指定したらそのギフトだけ引く（コインの条件と同時に使わない）
    const giftPicked = this.name === 'omikuji' && gifts.length > 0;
    const byCoins = !giftPicked && min > 0 && (Number(e.totalDiamonds) || 0) >= min;
    const trigger = {
      kind: 'gift',
      source: 'gift',
      ts: e.ts ?? null,
      test: Boolean(e.test),
      giftLabel: giftDisplayName(e.gift),
      giftId: e.gift?.id ?? null,
      coins: Number(e.totalDiamonds) || 0,
      user: e.user ? { id: e.user.id, name: e.user.name } : null,
    };
    // おみくじの10連: 専用ギフトは通常の関門（gifts / minCoins）より先に判定する。
    // 通常ギフトを指定している設定でも、10連ギフトが届いたら10連にする（通常の引き方より優先）
    if (this.name === 'omikuji') {
      const tenGifts = Array.isArray(this.config.tenGifts) ? this.config.tenGifts : [];
      if (tenGifts.length > 0 && giftMatches(e.gift, tenGifts)) {
        this.start({ ...trigger, kind: 'ten' });
        return;
      }
    }
    if (!byGift && !byCoins) return;
    // おみくじは連打（コンボ）の回数ぶん引く。待ち列に上限はないので、投げた分は全部回す
    const times = this.name === 'omikuji' ? Math.max(1, Number(e.gift?.count) || 1) : 1;
    if (times > 1) trigger.coins = Math.floor((Number(e.totalDiamonds) || 0) / times);
    // 10連まとめが有効なら、10回ぶんを1つのまとめ引きにして、余りは通常の引き方で回す
    if (this.name === 'omikuji' && this.config.tenBatch === true && times >= 10) {
      const batches = Math.floor(times / 10);
      const rest = times - batches * 10;
      for (let i = 0; i < batches; i++) this.start({ ...trigger, kind: 'ten' });
      for (let i = 0; i < rest; i++) this.start({ ...trigger });
      return;
    }
    for (let i = 0; i < times; i++) this.start({ ...trigger });
  }

  close() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  #begin(trigger) {
    this.seq += 1;
    this.trigger = trigger;
    this.durations = durationsOf(this.config, this.name);
    if (this.name === 'omikuji' && trigger?.kind === 'ten') {
      this.#beginTen();
      return { ok: true, queued: false, phase: this.phase, seq: this.seq, durations: { ...this.durations } };
    }
    if (this.name === 'omikuji' && this.config.displayMode === 'short') {
      this.#roll(this.#randomStick(), true);
      return { ok: true, queued: false, phase: this.phase, seq: this.seq, durations: { ...this.durations } };
    }
    const mode = this.config.pickMode;
    // 送った人が分からない（テスト・動作から）ときは、時間切れと同じ扱いにする
    if (mode === 'viewer' && trigger.user) this.#waitPick('viewer');
    else if (mode === 'streamer' || (mode === 'viewer' && this.config.timeoutMode === 'streamer')) this.#waitPick('streamer');
    else this.#roll(this.#randomStick(), true);
    return { ok: true, queued: false, phase: this.phase, seq: this.seq, durations: { ...this.durations } };
  }

  /**
   * 10連: 10回ぶんをその場で引き、結果をまとめて画面へ渡す。天井の数えは10回ぶん進める。
   * テストの10連では天井の数えを進めない（通常の抽選と同じ線引き）。
   */
  #beginTen() {
    this.close();
    const tiers = this.config.tiers;
    const pityEvery = Number(this.config.pity) || 0;
    const isTest = this.trigger?.test === true || this.trigger?.kind === 'test';
    let pityCount = this.pityCount;
    const results = [];
    for (let i = 0; i < 10; i++) {
      const rolled = rollTier(tiers, pityCount, pityEvery, this.random);
      pityCount = rolled.pityCount;
      results.push({ tier: rolled.tier, stick: this.#randomStick(), forced: rolled.forced });
    }
    if (!isTest) {
      this.pityCount = pityCount;
      this.#savePity();
    }
    this.phase = 'ten';
    this.tenResults = results;
    this.tier = null;
    this.forced = false;
    this.durations = { rollMs: 0, revealMs: TEN_REVEAL_MS, doneMs: durationsOf(this.config, this.name).doneMs };
    this.#emit('ten');
    this.#arm(TEN_REVEAL_MS, () => {
      if (this.phase !== 'ten') return;
      this.phase = 'done';
      this.#emit('done');
      this.#arm(this.durations.doneMs, () => {
        if (this.phase !== 'done') return;
        this.phase = 'idle';
        this.tenResults = null;
        this.trigger = null;
        this.#emit('idle');
        const next = this.pending.shift();
        if (next) this.#begin(next);
      });
    });
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
    // テストの抽選では天井回数を進めない（本物の当たりやすさを変えないため）
    if (this.trigger?.test !== true && this.trigger?.kind !== 'test') {
      this.pityCount = rolled.pityCount;
      this.#savePity();
    }
    this.tier = rolled.tier;
    this.forced = rolled.forced;
    if (first) this.#emit('start');
    this.#emit('rolling');
    this.#arm(this.durations.rollMs, () => {
      if (this.phase !== 'rolling') return;
      this.phase = 'reveal';
      this.#emit('reveal');
      // 大吉だけ、結果の余韻を長く取る（見せ場）
      const revealMs = this.tier?.id === 'daikichi' ? Math.round(this.durations.revealMs * 1.5) : this.durations.revealMs;
      this.#arm(revealMs, () => {
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
      results: name === 'ten' || (name === 'done' && this.tenResults) ? this.tenResults : null,
      pick: this.#pickView(),
      stick: this.stick,
      ...this.#displayOptions(),
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

/** 10連を見せる長さ。画面側は1枚ずつずらして出す（10枚 × 約0.45秒 + 余韻） */
const TEN_REVEAL_MS = 6000;

const SHORT_TEMPOS = {
  quick: { rollMs: 400, revealMs: 1700, doneMs: 500 },
  normal: { rollMs: 520, revealMs: 2150, doneMs: 620 },
  slow: { rollMs: 700, revealMs: 2700, doneMs: 800 },
};
function durationsOf(cfg, name) {
  if (name === 'omikuji' && cfg?.displayMode === 'short') return { ...(SHORT_TEMPOS[cfg?.tempo] || SHORT_TEMPOS.quick) };
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
