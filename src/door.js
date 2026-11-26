// 扉の確率ゲーム。ギフトで挑戦が始まり、左右の扉を3段階選ぶ。
// 今何段目か・選んだ扉・当たりか外れかはサーバーで持ち、data/doors.json に残す（OBS を読み込み直しても挑戦の途中には戻らない。待機に戻る）。
// 当たりの判定は選んだ瞬間にサーバーで決める。画面は「溜めてから開く」演出をし、サーバーは演出の終わる頃に次の段階（または結果）を知らせる。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultsFor } from './schema.js';
import { giftMatches } from './gifts.js';
import { recordError } from './error-log.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOORS_FILE = path.resolve(process.env.TW_DATA || path.join(root, 'data'), 'doors.json');

export const DOOR_ACTIONS = ['start', 'pick', 'reset'];
export const STAGES = 3;
// 選んでから結果（次の段階・突破・失敗）を知らせるまでの待ち。画面の「溜め→開く→見せる」の演出に合わせる
export const REVEAL_MS = 3400;
const SAVE_DELAY = 400;

const slimUser = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar ?? null } : null);

/** stage 段目の当たりの確率（%。設定は chance1〜3、0〜100 に丸める） */
export function chanceFor(cfg = {}, stage = 1) {
  const raw = [cfg.chance1, cfg.chance2, cfg.chance3][Math.min(STAGES, Math.max(1, stage)) - 1];
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** そのギフトで挑戦が始まるか。gifts があればそのギフトだけ、なければ minCoins 以上のギフト全部 */
export function startsChallenge(cfg = {}, e) {
  if (e?.kind !== 'gift' || !e.gift) return false;
  if (cfg.gifts?.length) return giftMatches(e.gift, cfg.gifts);
  return (e.totalDiamonds ?? 0) >= Math.max(0, Number(cfg.minCoins) || 0);
}

export class DoorEngine {
  constructor(hub, file = DOORS_FILE) {
    this.hub = hub;
    this.file = file;
    this.config = {};
    this.states = {}; // id → { phase, stage, by, picked, win, plays, clears, updatedAt }
    this.timers = {}; // id → { advance, back } 演出待ちと、結果から待機へ戻すタイマー
    this.saveTimer = null;
    this.revealMs = REVEAL_MS; // テストで短くできるよう、道具として持つ
    this.#load();
    hub.on('event', (e) => this.onEvent(e));
  }

  setConfig(doors) {
    this.config = doors ?? {};
  }

  /** 設定にある名前（なければ default） */
  ids() {
    const ids = Object.keys(this.config);
    return ids.length ? ids : ['default'];
  }

  /** その名前の設定（設定が1つもないときの default は初期値） */
  cfgOf(id) {
    if (this.config[id]) return this.config[id];
    return !Object.keys(this.config).length && id === 'default' ? defaultsFor('doors') : null;
  }

  /** 今の状態（画面に配る形） */
  get(id) {
    const cfg = this.cfgOf(id) ?? {};
    const s = this.#state(id);
    return {
      phase: s.phase,
      stage: s.stage,
      stages: STAGES,
      by: s.by,
      picked: s.picked,
      win: s.win,
      plays: s.plays,
      clears: s.clears,
      chances: [chanceFor(cfg, 1), chanceFor(cfg, 2), chanceFor(cfg, 3)],
      now: Date.now(),
    };
  }

  snapshot() {
    const out = {};
    for (const id of this.ids()) out[id] = this.get(id);
    return out;
  }

  /** ギフトで挑戦を始める。挑戦中・結果の表示中は新しい挑戦を始めない（README の「上限と飛ばすルール」に明記） */
  onEvent(e) {
    if (e?.test) return;
    if (e?.kind !== 'gift') return;
    for (const [id, cfg] of Object.entries(this.config)) {
      if (this.#state(id).phase !== 'idle') continue;
      if (!startsChallenge(cfg, e)) continue;
      this.#start(id, { user: slimUser(e.user) });
    }
  }

  /**
   * 手で動かす（ダッシュボード・モニター・URL・AI）。id を省くと設定にある全部。
   * action: start（挑戦を始める）/ pick（扉を選ぶ。value が 1=左・2=右）/ reset（待機に戻す。挑戦の数・突破の数は残す）
   */
  apply(id, action, value, opts = {}) {
    const prevTest = this._testFlag === true;
    this._testFlag = opts?.test === true;
    try {
      return this.#apply(id, action, value);
    } finally {
      this._testFlag = prevTest;
    }
  }

  #apply(id, action, value) {
    if (!DOOR_ACTIONS.includes(action)) throw new Error(`action は ${DOOR_ACTIONS.join(' / ')} のどれかです`);
    if (id && !this.cfgOf(id)) throw new Error(`doors に「${id}」がありません（${this.ids().join(' / ')}）`);
    const out = {};
    for (const k of id ? [id] : this.ids()) {
      if (action === 'start') {
        if (!this.#start(k, { user: null })) throw new Error('今は挑戦中です');
      } else if (action === 'pick') {
        const picked = this.choose(k, value);
        if (!picked.ok) throw new Error(picked.error);
      } else if (action === 'reset') {
        this.#toIdle(k, { kind: 'reset' });
      }
      out[k] = this.get(k);
    }
    this.#save(true);
    return out;
  }

  /** 挑戦を始める。待機のときだけ。始めたら true */
  #start(id, { user } = {}) {
    const s = this.#state(id);
    if (s.phase !== 'idle') return false;
    this.#clearTimers(id);
    s.phase = 'pick';
    s.stage = 1;
    s.by = user ?? null;
    s.picked = null;
    s.win = null;
    s.plays += 1;
    s.updatedAt = Date.now();
    this.#broadcast(id, { kind: 'start', stage: 1, by: s.by });
    this.#save();
    return true;
  }

  /**
   * 扉を選ぶ（1=左、2=右）。当たりはこの瞬間に確率で決める。
   * 演出の時間（revealMs）が過ぎたら、次の段階か結果を知らせる。
   */
  choose(id, n) {
    if (!this.cfgOf(id)) return { ok: false, error: `doors に「${id}」がありません` };
    const s = this.#state(id);
    if (s.phase !== 'pick') return { ok: false, error: '今は扉を選ぶときではありません' };
    const picked = Number(n);
    if (picked !== 1 && picked !== 2) return { ok: false, error: '扉は 1（左）か 2（右）です' };
    const cfg = this.cfgOf(id) ?? {};
    const chance = chanceFor(cfg, s.stage);
    const win = Math.random() * 100 < chance;
    s.phase = 'reveal';
    s.picked = picked;
    s.win = win;
    s.updatedAt = Date.now();
    this.#broadcast(id, { kind: 'reveal', stage: s.stage, picked, win, chance });
    this.#save();
    this.timers[id] ??= {};
    this.timers[id].advance = setTimeout(() => this.#advance(id), this.revealMs);
    this.timers[id].advance.unref?.();
    return { ok: true, door: this.get(id) };
  }

  // 演出が終わった頃: 当たりなら次の段階（最終段なら突破）、外れなら失敗。結果は resultSeconds 出してから待機へ戻す
  #advance(id) {
    const s = this.#state(id);
    if (s.phase !== 'reveal') return;
    const cfg = this.cfgOf(id) ?? {};
    if (s.win && s.stage < STAGES) {
      s.stage += 1;
      s.phase = 'pick';
      s.picked = null;
      s.win = null;
      s.updatedAt = Date.now();
      this.#broadcast(id, { kind: 'stage', stage: s.stage });
      this.#save();
      return;
    }
    if (s.win) {
      s.phase = 'clear';
      s.clears += 1;
      this.#broadcast(id, { kind: 'clear', stage: s.stage });
    } else {
      s.phase = 'failed';
      this.#broadcast(id, { kind: 'fail', stage: s.stage });
    }
    s.updatedAt = Date.now();
    this.#save(true);
    const wait = Math.max(0, (Number(cfg.resultSeconds) || 10) * 1000);
    this.timers[id] ??= {};
    this.timers[id].back = setTimeout(() => this.#toIdle(id, { kind: 'idle' }), wait);
    this.timers[id].back.unref?.();
  }

  #toIdle(id, event) {
    this.#clearTimers(id);
    const s = this.#state(id);
    const was = s.phase;
    s.phase = 'idle';
    s.stage = 0;
    s.by = null;
    s.picked = null;
    s.win = null;
    s.updatedAt = Date.now();
    if (was !== 'idle') this.#broadcast(id, event);
    this.#save();
  }

  #clearTimers(id) {
    const t = this.timers[id];
    if (!t) return;
    clearTimeout(t.advance);
    clearTimeout(t.back);
    delete this.timers[id];
  }

  /** 保存を待たずに書く（テストや終了のとき） */
  flush() {
    if (this.saveTimer) this.#save(true);
  }

  /** テスト用: タイマーを全部止める */
  close() {
    for (const id of Object.keys(this.timers)) this.#clearTimers(id);
    clearTimeout(this.saveTimer);
  }

  #state(id) {
    return (this.states[id] ??= { phase: 'idle', stage: 0, by: null, picked: null, win: null, plays: 0, clears: 0, updatedAt: 0 });
  }

  #broadcast(id, event) {
    const door = this.get(id);
    // 開発用・テストの操作中は、知らせの出来事にも test の印を付ける（プレビューへ届けるため）
    if (this._testFlag === true && event && typeof event === 'object') event.test = true;
    this.hub.broadcast({ type: 'door', id, door, event });
    this.hub.emit?.('door', id, door, event);
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || typeof data !== 'object') return;
      for (const [id, raw] of Object.entries(data)) {
        if (!raw || typeof raw !== 'object') continue;
        // 挑戦の途中で止まったら、途中には戻らない（待機から）。挑戦の数と突破の数だけ残す
        this.states[id] = {
          phase: 'idle', stage: 0, by: null, picked: null, win: null,
          plays: Number(raw.plays) || 0,
          clears: Number(raw.clears) || 0,
          updatedAt: Number(raw.updatedAt) || 0,
        };
      }
    } catch {}
  }

  #save(now = false) {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const write = () => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, JSON.stringify(this.states, null, 2));
        fs.renameSync(tmp, this.file);
      } catch (err) {
        console.warn('[door] 保存できませんでした:', err.message);
        recordError(err, { kind: 'store.write', level: 'warn', context: { op: 'door.save' } });
      }
    };
    if (now) return write();
    this.saveTimer = setTimeout(write, SAVE_DELAY);
    this.saveTimer.unref?.();
  }
}
