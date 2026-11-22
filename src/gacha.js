// 高額ギフトなどのガチャ（name='omikuji' ならおみくじ。同じ仕組みで設定・画面・イベント名だけ別）。待機 → 回転 → 結果 → 終了。一度に1回で、重なった分は待ち列。
// 大きな演出（カードめくりの開示など）が流れている間は、舞台の順番待ち（src/stage-queue.js）で抽選を待たせ、終わってから順番に始める。
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
export function rollTier(tiers, pityCount = 0, pityEvery = 0, random = Math.random, { daikichiWeightPct = 0 } = {}) {
  const all = Array.isArray(tiers) ? tiers : [];
  const luckPct = Number.isFinite(Number(daikichiWeightPct)) ? Number(daikichiWeightPct) : 0;
  const weightOf = (tier) => {
    const weight = Number(tier?.weight);
    if (tier?.id !== 'daikichi' || weight <= 0 || luckPct <= 0) return weight;
    return weight * (1 + luckPct / 100);
  };
  const list = all.filter((tier) => Number(tier?.weight) > 0);
  if (!list.length) return { tier: { id: 'none', label: '？', weight: 1, pity: false }, pityCount, forced: false };
  // 重み 0 は「出ない」という指定なので、天井でも出さない。天井の対象は重みが 1 以上ある対象だけに限る。
  // 対象の重みが 0 のときは天井は発動せず、通常の抽選になる（数えはそのまま増える）。
  const pityTier = all.find((tier) => tier?.pity === true && Number(tier?.weight) > 0);
  const count = Math.max(0, Number(pityCount) || 0);
  const every = Math.max(0, Number(pityEvery) || 0);
  if (every > 0 && pityTier && count >= every) return { tier: pityTier, pityCount: 0, forced: true };
  const total = list.reduce((sum, tier) => sum + weightOf(tier), 0);
  let cursor = Number(random()) * total;
  let picked = list[list.length - 1];
  for (const tier of list) {
    cursor -= weightOf(tier);
    if (cursor < 0) {
      picked = tier;
      break;
    }
  }
  return { tier: picked, pityCount: picked.pity === true ? 0 : count + 1, forced: false };
}

function luckCoinsFor(hub, user) {
  const key = user?.id || user?.name;
  if (!key || !(hub?.gifters instanceof Map)) return 0;
  return Math.max(0, Number(hub.gifters.get(key)?.diamonds) || 0);
}

export class Gacha {
  constructor(hub, { bus = null, random = null, name = 'gacha', storeFile = null, stage = null, stageKey = 'local' } = {}) {
    this.name = name;
    this.hub = hub;
    this.staySource = null; // 滞在の材料（確率アップ第2段）。runtime が setStaySource で渡す
    this.bus = bus;
    this.random = typeof random === 'function' ? random : Math.random;
    this.storeFile = storeFile ? String(storeFile) : null;
    // 舞台の順番待ち（src/stage-queue.js）。渡されたときだけ、設定 stageQueue が有効な節で使う
    this.stage = stage ?? null;
    this.stageKey = stageKey;
    this.stagePending = []; // 舞台が空くまで待つ抽選（先入れ先出し）
    this.stageHeld = false; // 自分が舞台の持ち主か
    this.stageWaiting = false; // 舞台が空いたら知らせる登録をしているか
    this.stageWaiter = () => {
      this.stageWaiting = false;
      this.#proceed();
    };
    this.config = defaultsFor(name);
    this.phase = 'idle';
    this.seq = 0;
    const savedPity = this.#loadPity();
    this.pityCount = savedPity.count;
    this.pityUsers = savedPity.users; // 個人の天井の数え（引いた人の鍵 → 大吉が出ていない回数）
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

  /** 配信の状態の知らせ。配信が本当に終わったときだけ数えを戻す。
   * 接続し直しの途中（connecting）と、再接続の失敗（error）は配信の終了ではないので戻さない */
  #onStreamStatus(status) {
    const mode = status?.mode;
    if (mode === 'live') { this.liveActive = true; return; }
    if (mode !== 'ended' && mode !== 'idle' && mode !== 'demo') return;
    if (!this.liveActive) return;
    this.liveActive = false;
    // 配信が終わったら、舞台を待っている抽選は全部やめる（次の配信へ持ち越さない）
    if (this.stagePending.length) this.stagePending = [];
    if (this.stageWaiting) {
      this.stageWaiting = false;
      this.stage?.cancelWait(this.stageKey, this.stageWaiter);
    }
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

  /** 天井の数えの保存。お金まわり（ポイント）と同じ格：仮ファイルへ書いてから入れ替える */
  #savePity() {
    if (!this.storeFile) return;
    try {
      fs.mkdirSync(path.dirname(this.storeFile), { recursive: true });
      const temp = `${this.storeFile}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify({ version: 2, pityCount: this.pityCount, pityUsers: Object.fromEntries(this.pityUsers) })}\n`, { mode: 0o600 });
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

  /** まとめ引き（10連）の回数。tenCount が2以上ならそれを使い、無い・おかしいときは今までの10。 */
  #tenCount() {
    const n = Math.floor(Number(this.config.tenCount));
    return Number.isFinite(n) && n >= 2 ? n : TEN_DEFAULT;
  }

  snapshot() {
    const show = this.phase === 'reveal' || this.phase === 'done';
    return {
      phase: this.phase,
      seq: this.seq,
      durations: this.durations,
      pityCount: this.pityCount,
      pityLeft: this.#pityLeft(),
      pending: this.pending.length,
      stagePending: this.stagePending.length,
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

  /** 天井までの残り回数（全体の天井だけ。前面に出す用）。天井が無効（0）のときは null。0 未満にはしない（0 で止める）。
   * 天井の対象（pity が true）のうち重みが正のものが1つも無い設定では、天井は実際には発動しない。
   * そのときは pity の設定値にかかわらず null にして、「あと0回」に張り付いて必ず出ると誤解させない。
   * 数えは対象を引くと 0 に戻るので、残りもそのまま満タンへ戻る。個人の天井（pityPersonal）の残りはここには混ぜない。 */
  #pityLeft() {
    const every = Math.max(0, Number(this.config.pity) || 0);
    if (every <= 0) return null;
    const tiers = Array.isArray(this.config.tiers) ? this.config.tiers : [];
    const hasTarget = tiers.some((tier) => tier?.pity === true && Number(tier?.weight) > 0);
    if (!hasTarget) return null;
    return Math.max(0, every - this.pityCount);
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
    this.#releaseStage();
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
        return this.#beginOnStage(next);
      }
      // 待ちに上限はつけない。投げた分は全部回す
      this.pending.push(next);
      return { ok: true, queued: true, pending: this.pending.length, phase: this.phase, seq: this.seq };
    }
    // 大きな演出（カードめくりの開示など）が舞台を使っている間は、抽選を始めずに舞台の待ち列で待つ。
    // テストの抽選は待ち列に入れない（本物の抽選が進行中のときと同じく断る）
    if (this.#stageEnabled() && this.stage.isBusy(this.stageKey) && this.stage.ownerOf(this.stageKey) !== this.name) {
      if (next.test === true || next.kind === 'test') {
        return { ok: false, reason: 'busy', error: '大きな演出が流れている間はテストを始められません。終わってから試してください' };
      }
      return this.#enqueueStage(next);
    }
    return this.#beginOnStage(next);
  }

  /** 舞台の順番待ちを使うか。舞台が渡されていて、設定 stageQueue が有効なときだけ */
  #stageEnabled() {
    return Boolean(this.stage) && this.config.stageQueue === true;
  }

  /**
   * 舞台が空くまで抽選を待たせる。上限（stageQueueMax、既定20）を超えた分は引かず、
   * バスへ知らせて記録（演出の記録）に残す。
   */
  #enqueueStage(trigger) {
    const max = Math.max(1, Number(this.config.stageQueueMax) || 20);
    if (this.stagePending.length >= max) {
      this.bus?.emit(`${this.name}.stage-dropped`, { trigger, reason: 'stage-queue-full', max });
      return { ok: true, queued: false, dropped: true, pending: this.stagePending.length, phase: this.phase, seq: this.seq };
    }
    this.stagePending.push(trigger);
    this.#waitStage();
    return { ok: true, queued: true, stage: true, pending: this.stagePending.length, phase: this.phase, seq: this.seq };
  }

  /** 舞台が空いたら知らせる登録（重ねて登録しない） */
  #waitStage() {
    if (this.stageWaiting || !this.stage) return;
    this.stageWaiting = true;
    this.stage.whenFree(this.stageKey, this.stageWaiter);
  }

  /**
   * 舞台を取ってから抽選を始める。先に他の部品が取っていたら、舞台の待ち列の先頭へ戻して空くのを待つ
   * （待ち列から取り出した分や、10連にまとめた分を失わないため）。
   */
  #beginOnStage(trigger) {
    if (this.#stageEnabled()) {
      if (!this.stage.acquire(this.stageKey, this.name)) {
        this.stagePending.unshift(trigger);
        this.#waitStage();
        return { ok: true, queued: true, stage: true, pending: this.stagePending.length, phase: this.phase, seq: this.seq };
      }
      this.stageHeld = true;
    }
    return this.#begin(trigger);
  }

  /** 舞台を返す。返した拍子に、待っていた側が舞台を取ることがある */
  #releaseStage() {
    if (!this.stageHeld) return;
    this.stageHeld = false;
    this.stage?.release(this.stageKey, this.name);
  }

  /**
   * 抽選が終わって待機に戻ったあと、次にやることを始める。
   * 自分の待ち列（進行中に来た分）を先に、次に舞台の待ち列を見る。
   */
  #proceed() {
    if (this.phase !== 'idle') return;
    if (this.pending.length) {
      this.#drain();
      return;
    }
    const next = this.stagePending.shift();
    if (next) this.#beginOnStage(next);
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
    // おみくじのまとめ引き: 専用ギフトは通常の関門（gifts / minCoins）より先に判定する。
    // 通常ギフトを指定している設定でも、まとめ引きギフトが届いたらまとめ引きにする（通常の引き方より優先）。
    // elevenGifts は tenCount に関係なく11連で、tenGifts より優先する
    if (this.name === 'omikuji') {
      const elevenGifts = Array.isArray(this.config.elevenGifts) ? this.config.elevenGifts : [];
      if (elevenGifts.length > 0 && giftMatches(e.gift, elevenGifts)) {
        this.start({ ...trigger, kind: 'ten', pullCount: 11 });
        return;
      }
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
    // まとめ引きが有効なら、tenCount 回ぶんを1つのまとめ引きにして、余りは通常の引き方で回す
    const ten = this.#tenCount();
    if (this.name === 'omikuji' && this.config.tenBatch === true && times >= ten) {
      const batches = Math.floor(times / ten);
      const rest = times - batches * ten;
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

  /** 待ち列の次を始める。同じ視聴者の分が tenCount 回ぶんたまっていたら、まとめ引きにする */
  #drain() {
    const ten = this.#takeTenBatch();
    if (ten) {
      this.#beginOnStage(ten);
      return;
    }
    const next = this.pending.shift();
    if (next) this.#beginOnStage(next);
  }

  /**
   * まとめ引き（tenBatch）が有効で、待ち列の先頭の視聴者と同じ人の分が tenCount 回ぶん以上たまっていたら、
   * その tenCount 回ぶんを取り出して1つのまとめ引きにする。テストの分はまとめない。まとめ引きそのもの（kind: 'ten'）は対象外。
   */
  #takeTenBatch() {
    if (this.name !== 'omikuji' || this.config.tenBatch !== true) return null;
    const ten = this.#tenCount();
    if (this.pending.length < ten) return null;
    const first = this.pending[0];
    if (!first || first.kind === 'ten' || first.test === true || first.kind === 'test') return null;
    // 視聴者が分からない分は、誰の分ともまとめない（同じキーに寄せると別々の分が1人分に化けるため）
    const keyOf = (t) => (t?.user?.id ? `id:${t.user.id}` : t?.user?.name ? `name:${t.user.name}` : null);
    const key = keyOf(first);
    if (key === null) return null;
    const mine = [];
    const rest = [];
    for (const t of this.pending) {
      const same = t && t.kind !== 'ten' && t.test !== true && t.kind !== 'test' && keyOf(t) === key;
      if (same && mine.length < ten) mine.push(t);
      else rest.push(t);
    }
    if (mine.length < ten) return null;
    this.pending = rest;
    return { ...first, kind: 'ten' };
  }

  /**
   * まとめ引き: 指定の回数ぶんをその場で引き、結果をまとめて画面へ渡す。天井の数え（全体・個人）は回数ぶん進める。
   * 回数は tenCount、ただし elevenGifts の11連は引き継ぎ（pullCount）で 11 が渡る。壊れた引き継ぎは tenCount へ倒す。
   * テストのまとめ引きでは天井の数えを進めない（通常の抽選と同じ線引き）。
   */
  #beginTen() {
    this.close();
    const requested = Number(this.trigger?.pullCount);
    const ten = Number.isInteger(requested) && requested >= 2 && requested <= 30 ? requested : this.#tenCount();
    const isTest = this.trigger?.test === true || this.trigger?.kind === 'test';
    const userKey = this.#userKey(this.trigger);
    let pityCount = this.pityCount;
    let userCount = userKey ? (this.pityUsers.get(userKey) ?? 0) : null;
    const results = [];
    for (let i = 0; i < ten; i++) {
      const rolled = this.#pickTier(pityCount, userCount);
      pityCount = rolled.pityCount;
      userCount = rolled.userCount;
      results.push({ tier: rolled.tier, stick: this.#randomStick(), forced: rolled.forced });
    }
    if (!isTest) {
      this.pityCount = pityCount;
      this.#applyUserPity(userKey, userCount);
      this.#savePity();
    }
    // 見せる長さは回数に合わせる（1枚ずつ約0.45秒で出し、最後に余韻）。既定の10なら今までと同じ 6000
    const revealMs = Math.round(TEN_REVEAL_MS * ten / TEN_DEFAULT);
    this.phase = 'ten';
    this.tenResults = results;
    this.tier = null;
    this.forced = false;
    this.durations = { rollMs: 0, revealMs, doneMs: durationsOf(this.config, this.name).doneMs };
    this.#emit('ten');
    this.#arm(revealMs, () => {
      if (this.phase !== 'ten') return;
      this.phase = 'done';
      this.#emit('done');
      this.#arm(this.durations.doneMs, () => {
        if (this.phase !== 'done') return;
        this.phase = 'idle';
        this.tenResults = null;
        this.trigger = null;
        this.#emit('idle');
        this.#releaseStage();
        this.#proceed();
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

  /** 引いた人の鍵（個人の天井の数えの単位）。ID を優先し、無ければ名前。どちらも無ければ null */
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

  /** 全体と個人、両方の天井を見て1回引く。pityCount は全体の数え、userCount は引いた人の数え（null は個人の対象外）。
   * どちらかの天井に届いていれば対象が確定し、両方の数えは 0 に戻る。対象を引いたら両方 0、出なければ両方 +1。
   * 対象の weight が 0 のときは、どちらの天井も発動しない（今の全体の決めと同じ） */
  #pickTier(pityCount, userCount) {
    const tiers = this.config.tiers;
    const globalEvery = Number(this.config.pity) || 0;
    const personalEvery = Number(this.config.pityPersonal) || 0;
    const pityTier = tiers.find((tier) => tier?.pity === true && Number(tier?.weight) > 0);
    if (pityTier && ((globalEvery > 0 && pityCount >= globalEvery) || (personalEvery > 0 && userCount != null && userCount >= personalEvery))) {
      return { tier: pityTier, forced: true, pityCount: 0, userCount: userCount == null ? null : 0 };
    }
    const rolled = rollTier(tiers, pityCount, 0, this.random, this.#luckOptions(this.trigger));
    return {
      tier: rolled.tier,
      forced: false,
      pityCount: rolled.pityCount,
      userCount: userCount == null ? null : (rolled.tier?.pity === true ? 0 : userCount + 1),
    };
  }

  /** 棒が決まったら振って引く。運勢は番号と関係なく、ここで重みで決める */
  #roll(stick, first = false) {
    this.close();
    this.stick = stick;
    this.pick = null;
    this.phase = 'rolling';
    const userKey = this.#userKey(this.trigger);
    const rolled = this.#pickTier(this.pityCount, userKey ? (this.pityUsers.get(userKey) ?? 0) : null);
    // テストの抽選では天井回数を進めない（本物の当たりやすさを変えないため）
    if (this.trigger?.test !== true && this.trigger?.kind !== 'test') {
      this.pityCount = rolled.pityCount;
      this.#applyUserPity(userKey, rolled.userCount);
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
      // 大吉だけ、結果の余韻を見せ場の長さで取る（ふつうの結果は短く、テンポを速く保つ）
      const revealMs = this.tier?.id === 'daikichi' ? (this.durations.daikichiRevealMs ?? Math.round(this.durations.revealMs * 1.5)) : this.durations.revealMs;
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
          this.#releaseStage();
          this.#proceed();
        });
      });
    });
  }

  /** 滞在の材料を渡す（runtime が組み立ての後に呼ぶ。gachaViewers.setPoints と同じ形）。 */
  setStaySource(source) {
    this.staySource = source ?? null;
  }

  #luckOptions(trigger) {
    if (this.name !== 'omikuji' || this.config.luckBoost !== true) return { daikichiWeightPct: 0 };
    const stepPct = Number(this.config.luckStepPct);
    const maxSteps = Math.max(0, Math.floor(Number(this.config.luckMaxSteps)) || 0);
    if (!Number.isFinite(stepPct) || stepPct <= 0 || maxSteps <= 0) return { daikichiWeightPct: 0 };
    let steps = 0;
    const unit = Number(this.config.luckUnitCoins);
    if (Number.isFinite(unit) && unit > 0) {
      steps += Math.floor(luckCoinsFor(this.hub, trigger?.user) / unit);
    }
    const stayUnits = Math.max(0, Math.floor(Number(this.config.luckStayUnits)) || 0);
    if (stayUnits > 0 && this.staySource) {
      const stayed = Number(this.staySource.stayUnitsFor?.(trigger?.user)) || 0;
      if (stayed > 0) steps += Math.floor(stayed / stayUnits);
    }
    return { daikichiWeightPct: Math.min(maxSteps, steps) * stepPct };
  }

  #emit(name) {
    const show = name === 'reveal' || name === 'done';
    const payload = {
      phase: name === 'idle' ? 'idle' : this.phase,
      seq: this.seq,
      durations: this.durations,
      trigger: this.trigger,
      pityCount: this.pityCount,
      pityLeft: this.#pityLeft(),
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

/** まとめ引き（10連）の回数の既定。設定 tenCount が無い・おかしいときはこれを使う */
const TEN_DEFAULT = 10;
/** まとめ引きを見せる長さ（10枚のとき）。画面側は1枚ずつずらして出す（1枚 × 約0.45秒 + 余韻）。回数ぶんに比例させる */
const TEN_REVEAL_MS = 6000;

const SHORT_TEMPOS = {
  quick: { rollMs: 300, revealMs: 800, doneMs: 300, daikichiRevealMs: 2550 },
  normal: { rollMs: 400, revealMs: 1100, doneMs: 400, daikichiRevealMs: 3225 },
  slow: { rollMs: 550, revealMs: 1500, doneMs: 500, daikichiRevealMs: 4050 },
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
