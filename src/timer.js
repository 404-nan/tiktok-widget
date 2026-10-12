// 延長タイマー（サブアソン）。配信の残り時間をサーバーで持ち、ギフト・フォロー・いいねで延ばす。
// 終わる時刻・止めているか・延びた合計は data/timers.json に残すので、OBS やサーバーを再起動しても続きから出せる。
// 時計は実際の時刻で進む（サーバーが止まっていた間も、走っているタイマーは減っている）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleMatches } from './minecraft.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TIMERS_FILE = path.resolve(process.env.TW_DATA || path.join(root, 'data'), 'timers.json');

// start（始める・止めていたら再開）/ pause（一時停止）/ resume（再開）/ toggle（走っていれば止め、止まっていれば動かす）
// add（秒を足す。マイナスで引く）/ set（残りをその秒にする）/ reset（初めの時間に戻して、始める前にする）
export const TIMER_ACTIONS = ['start', 'pause', 'resume', 'toggle', 'add', 'set', 'reset'];
const STATUSES = ['idle', 'running', 'paused', 'ended'];

const slimUser = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar } : null);
const startMs = (c) => Math.round((c?.startMinutes ?? 60) * 60_000);
const capMs = (c) => (c?.maxHours > 0 ? Math.round(c.maxHours * 3_600_000) : Infinity);

/** ギフト・フォロー・シェア・いいねで、何秒延びるか（いいねは数をためて、決まった回数ごと） */
export function secondsFor(c, e, likeBank = 0) {
  if (e.kind === 'gift') {
    // ルール（上から順に最初に合ったもの）が金額での延長より優先
    const rule = (c.rules ?? []).find((r) => ruleMatches(r, e));
    if (rule) return { seconds: rule.seconds * (rule.perCount === false ? 1 : e.gift.count), text: rule.text ?? '' };
    if (c.coinSeconds > 0 && e.totalDiamonds >= Math.max(1, c.minCoins ?? 1)) return { seconds: e.totalDiamonds * c.coinSeconds };
    return { seconds: 0 };
  }
  if (e.kind === 'follow') return { seconds: c.followSeconds ?? 0 };
  if (e.kind === 'share') return { seconds: c.shareSeconds ?? 0 };
  if (e.kind === 'like' && c.likeEvery > 0 && c.likeSeconds > 0) {
    const bank = likeBank + (e.count ?? 0);
    const times = Math.floor(bank / c.likeEvery);
    return { seconds: times * c.likeSeconds, likeBank: bank % c.likeEvery };
  }
  return { seconds: 0 };
}

export class TimerEngine {
  constructor(hub, file = TIMERS_FILE) {
    this.hub = hub;
    this.file = file;
    this.config = {};
    this.states = {}; // id → { status, endsAt, remaining, base, extended, adjusted, startedAt, endedAt, updatedAt }
    this.timeouts = {}; // id → 0 になったら終わらせるタイマー
    this.likes = {}; // id → まだ延長にならないいいねの数
    this.#load();
    hub.on('event', (e) => this.onEvent(e));
  }

  setConfig(timers) {
    this.config = timers ?? {};
  }

  /** 設定にある名前（なければ default） */
  ids() {
    const ids = Object.keys(this.config);
    return ids.length ? ids : ['default'];
  }

  #state(id) {
    return (this.states[id] ??= { status: 'idle', endsAt: null, remaining: null, base: 0, extended: 0, adjusted: 0, startedAt: null, endedAt: null, updatedAt: 0 });
  }

  /** 残りのミリ秒（始める前で手を加えていなければ、設定の初めの時間） */
  remaining(id, now = Date.now()) {
    const s = this.#state(id);
    if (s.status === 'running') return Math.max(0, s.endsAt - now);
    if (s.status === 'ended') return 0;
    return s.remaining ?? startMs(this.config[id]);
  }

  /** 今の状態（画面に配る形）。now はサーバーの時計（画面の時計とのずれを直すため） */
  get(id) {
    const now = Date.now();
    const s = this.#state(id);
    const c = this.config[id];
    return {
      status: s.status,
      endsAt: s.status === 'running' ? s.endsAt : null,
      remaining: this.remaining(id, now),
      extended: Math.round(s.extended / 1000), // ギフトなどで延びた合計（秒）
      adjusted: Math.round(s.adjusted / 1000), // ボタン・URL で足し引きした合計（秒）
      base: Math.round((s.status === 'idle' ? startMs(c) : s.base) / 1000),
      max: Number.isFinite(capMs(c)) ? Math.round(capMs(c) / 1000) : 0,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      now,
    };
  }

  snapshot() {
    const out = {};
    for (const id of new Set([...this.ids(), ...Object.keys(this.states)])) out[id] = this.get(id);
    return out;
  }

  #send(id, event) {
    const timer = this.get(id);
    this.hub.broadcast({ type: 'timer', id, timer, event });
    this.hub.emit?.('timer', id, timer, event);
  }

  /** ギフト・フォロー・シェア・いいねで延ばす（走っている間と、設定によっては一時停止中も） */
  onEvent(e) {
    let changed = false;
    for (const [id, c] of Object.entries(this.config)) {
      const s = this.#state(id);
      const open = s.status === 'running' || (s.status === 'paused' && c.pausedExtend !== false);
      if (!open) continue;
      const r = secondsFor(c, e, this.likes[id] ?? 0);
      if (r.likeBank != null) this.likes[id] = r.likeBank;
      if (!r.seconds) continue;
      this.#extend(id, r.seconds * 1000, {
        from: e.kind, // gift / follow / share / like
        user: slimUser(e.user),
        gift: e.kind === 'gift' ? { name: e.gift.name, count: e.gift.count, image: e.gift.image ?? null } : null,
        coins: e.totalDiamonds ?? 0,
        text: r.text ?? '',
      });
      changed = true;
    }
    if (changed) this.#save();
  }

  // 自動で延ばす（上限 maxHours: 初めの時間 + 延びた合計 がこれを超えない）
  #extend(id, ms, by) {
    const s = this.#state(id);
    const c = this.config[id];
    let add = ms;
    let capped = false;
    if (add > 0) {
      const room = Math.max(0, capMs(c) - (s.base + s.extended));
      if (add > room) {
        add = room;
        capped = true;
      }
    }
    if (add === 0 && !capped) return;
    s.extended += add;
    this.#shift(id, add);
    const event = { kind: 'extend', seconds: Math.round(add / 1000), asked: Math.round(ms / 1000), capped, ...by };
    if (this.#state(id).status === 'running' && this.remaining(id) <= 0) return this.#end(id);
    this.#send(id, event);
  }

  // 残りをずらす（走っていれば終わる時刻、止まっていれば残り）
  #shift(id, ms) {
    const s = this.#state(id);
    const now = Date.now();
    if (s.status === 'running') {
      s.endsAt = Math.max(now, s.endsAt + ms);
      this.#schedule(id);
    } else {
      s.remaining = Math.max(0, this.remaining(id, now) + ms);
    }
    s.updatedAt = now;
  }

  /**
   * ボタン・URL・AI からの操作。id を省くと設定にある全部。
   * seconds は add（足す秒。マイナスで引く）と set（残りの秒）で使う
   */
  apply(id, action, seconds) {
    if (!TIMER_ACTIONS.includes(action)) throw new Error(`action は ${TIMER_ACTIONS.join(' / ')} のどれかです`);
    if (id && Object.keys(this.config).length && !this.config[id]) throw new Error(`timers に「${id}」がありません（${this.ids().join(' / ')}）`);
    const n = Number(seconds);
    if ((action === 'add' || action === 'set') && (seconds == null || seconds === '' || !Number.isFinite(n))) throw new Error('seconds に秒数を入れてください（例 60。add ではマイナスで引く）');
    if (action === 'set' && n < 0) throw new Error('set の秒数は 0 以上にしてください');
    const out = {};
    for (const k of id ? [id] : this.ids()) {
      this.#apply(k, action, Math.round(n * 1000));
      out[k] = this.get(k);
    }
    this.#save();
    return out;
  }

  #apply(id, action, ms) {
    const s = this.#state(id);
    const now = Date.now();
    if (action === 'toggle') action = s.status === 'running' ? 'pause' : 'start';
    if (action === 'resume') action = s.status === 'paused' ? 'start' : null;
    switch (action) {
      case 'start': {
        if (s.status === 'running') return;
        if (s.status === 'paused') {
          s.status = 'running';
          s.endsAt = now + (s.remaining ?? 0);
          s.remaining = null;
          s.updatedAt = now;
          if (s.endsAt <= now) return this.#end(id);
          this.#schedule(id);
          return this.#send(id, { kind: 'resume' });
        }
        // 始める前: 初めの時間から（始める前に足し引きしていればその残りから）。終わった後: 数え直して最初から
        const fresh = s.status === 'ended';
        if (fresh) Object.assign(s, { extended: 0, adjusted: 0 });
        const left = fresh ? startMs(this.config[id]) : this.remaining(id, now);
        Object.assign(s, { status: 'running', endsAt: now + left, remaining: null, base: startMs(this.config[id]), startedAt: now, endedAt: null, updatedAt: now });
        this.likes[id] = 0;
        this.#schedule(id);
        return this.#send(id, { kind: 'start' });
      }
      case 'pause': {
        if (s.status !== 'running') return;
        Object.assign(s, { status: 'paused', remaining: Math.max(0, s.endsAt - now), endsAt: null, updatedAt: now });
        clearTimeout(this.timeouts[id]);
        return this.#send(id, { kind: 'pause' });
      }
      case 'add': {
        if (!ms) return;
        if (s.status === 'ended') {
          // 終わった後に足したら、止まったまま続きを用意する（もう一度スタートで動く）
          Object.assign(s, { status: 'paused', remaining: 0, endedAt: null });
        }
        s.adjusted += ms;
        this.#shift(id, ms);
        if (s.status === 'running' && this.remaining(id) <= 0) return this.#end(id);
        return this.#send(id, { kind: 'adjust', seconds: Math.round(ms / 1000) });
      }
      case 'set': {
        const before = this.remaining(id, now);
        if (s.status === 'ended') Object.assign(s, { status: 'paused', endedAt: null });
        s.adjusted += ms - before;
        if (s.status === 'running') {
          s.endsAt = now + ms;
          if (ms <= 0) return this.#end(id);
          this.#schedule(id);
        } else {
          s.remaining = ms;
        }
        s.updatedAt = now;
        return this.#send(id, { kind: 'adjust', seconds: Math.round((ms - before) / 1000), set: true });
      }
      case 'reset': {
        clearTimeout(this.timeouts[id]);
        delete this.states[id];
        this.likes[id] = 0;
        this.#state(id).updatedAt = now;
        return this.#send(id, { kind: 'reset' });
      }
    }
  }

  #end(id) {
    const s = this.#state(id);
    if (s.status === 'ended') return;
    clearTimeout(this.timeouts[id]);
    const at = s.status === 'running' ? Math.min(Date.now(), s.endsAt) : Date.now();
    Object.assign(s, { status: 'ended', endsAt: null, remaining: 0, endedAt: at, updatedAt: Date.now() });
    this.#send(id, { kind: 'end' });
    this.#save();
  }

  // 0 になる時刻に終わらせる（長い時間は setTimeout の上限を超えないよう、途中で見直す）
  #schedule(id) {
    clearTimeout(this.timeouts[id]);
    const s = this.#state(id);
    if (s.status !== 'running') return;
    const left = s.endsAt - Date.now();
    const t = setTimeout(() => (this.remaining(id) <= 0 ? this.#end(id) : this.#schedule(id)), Math.max(0, Math.min(left, 2 ** 31 - 1)));
    t.unref?.();
    this.timeouts[id] = t;
  }

  /** テスト用: タイマーを全部止める */
  close() {
    for (const t of Object.values(this.timeouts)) clearTimeout(t);
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || typeof data !== 'object') return;
      const now = Date.now();
      for (const [id, raw] of Object.entries(data)) {
        if (!raw || !STATUSES.includes(raw.status)) continue;
        const num = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
        const s = {
          status: raw.status,
          endsAt: num(raw.endsAt),
          remaining: num(raw.remaining),
          base: num(raw.base) ?? 0,
          extended: num(raw.extended) ?? 0,
          adjusted: num(raw.adjusted) ?? 0,
          startedAt: num(raw.startedAt),
          endedAt: num(raw.endedAt),
          updatedAt: num(raw.updatedAt) ?? 0,
        };
        if (s.status === 'running' && s.endsAt == null) s.status = 'idle';
        // 止まっている間に 0 を過ぎていたら、終わったことにする（演出は出さない）
        if (s.status === 'running' && s.endsAt <= now) Object.assign(s, { status: 'ended', remaining: 0, endedAt: s.endsAt, endsAt: null });
        this.states[id] = s;
        if (s.status === 'running') this.#schedule(id);
      }
    } catch {}
  }

  #save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(this.states, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.warn('[timer] 保存できませんでした:', err.message);
    }
  }
}
