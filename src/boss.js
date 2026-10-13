// ボス討伐 HP バー。ギフトのコイン（といいね）がダメージになり、みんなでボスの HP を削る。
// HP・何体目か・最後に一撃を入れた人はサーバーで持ち、data/boss.json に残す（OBS を読み込み直しても続きから）。
// HP が 0 になったら討伐: ウィジェットに知らせ、設定があればルーレットを回し、Minecraft にコマンドを送る（runtime.js でつなぐ）。
// 少し待ってから、HP を hpScale 倍にした次のボスが出てくる。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultsFor } from './schema.js';
import { giftMatches } from './gifts.js';
import { giftDisplayName } from './gift-display.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BOSS_FILE = path.resolve(process.env.TW_DATA || path.join(root, 'data'), 'boss.json');

export const BOSS_ACTIONS = ['damage', 'defeat', 'heal', 'next', 'set', 'reset'];
const SAVE_DELAY = 400; // いいねなどで細かく削られるので、保存は少しまとめる

const slimUser = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar ?? null } : null);

const named = (gift, names) => {
  if (!gift || !names?.length) return false;
  return giftMatches(gift, names);
};

/** round 体目のボスの最大 HP（1体目は hp、そこから hpScale 倍ずつ） */
export function maxHpFor(cfg = {}, round = 1) {
  const base = Math.max(1, Number(cfg.hp) || 1);
  const scale = Math.max(1, Number(cfg.hpScale) || 1);
  return Math.max(1, Math.round(base * scale ** (round - 1)));
}

/** round 体目のボスの名前（2体目からは nextNames を順に使い、足りなければ最後の名前） */
export function nameFor(cfg = {}, round = 1) {
  const next = cfg.nextNames ?? [];
  if (round <= 1 || !next.length) return cfg.name ?? '';
  return next[Math.min(round - 2, next.length - 1)];
}

/** イベントのダメージ（ダメージにしないものは 0） */
export function damageOf(cfg = {}, e) {
  const from = cfg.damageFrom ?? ['coins'];
  if (e.kind === 'gift' && from.includes('coins')) {
    if (cfg.gifts?.length && !named(e.gift, cfg.gifts)) return 0;
    return Math.round((e.totalDiamonds ?? 0) * (cfg.coinDamage ?? 1));
  }
  if (e.kind === 'like' && from.includes('likes')) return Math.round((e.count ?? 0) * (cfg.likeDamage ?? 1));
  return 0;
}

/** 演出の段階（0 ふつう / 1 大ダメージ / 2 特大）。境目は bigHit とその 10 倍 */
export function hitTier(cfg = {}, damage) {
  const big = Math.max(1, cfg.bigHit ?? 1000);
  return damage >= big * 10 ? 2 : damage >= big ? 1 : 0;
}

export class BossEngine {
  constructor(hub, file = BOSS_FILE) {
    this.hub = hub;
    this.file = file;
    this.config = {};
    this.states = {}; // id → { round, hp, maxHp, defeated, defeatedAt, lastHit, finisher, kills, total, updatedAt }
    this.timers = {}; // id → 次のボスを出すタイマー
    this.saveTimer = null;
    this.#load();
    hub.on('event', (e) => this.onEvent(e));
  }

  setConfig(bosses) {
    this.config = bosses ?? {};
    for (const id of this.ids()) {
      const cfg = this.cfgOf(id);
      const s = this.states[id];
      if (!s) {
        this.states[id] = this.#fresh(cfg, 1);
        continue;
      }
      // 設定で HP を変えたときは、今の割合のまま新しい最大 HP に合わせる
      const max = maxHpFor(cfg, s.round);
      if (s.maxHp !== max) {
        s.hp = s.defeated ? 0 : Math.max(1, Math.min(max, Math.round((s.hp / s.maxHp) * max)));
        s.maxHp = max;
        this.hub.broadcast({ type: 'boss', id, boss: this.get(id), event: { kind: 'config' } });
      }
      // 討伐から次のボスまでの間にサーバーを止めていたときも、続きから
      if (s.defeated && cfg.autoNext !== false && !this.timers[id]) this.#scheduleNext(id);
    }
    this.#save();
  }

  /** 設定にある名前（なければ default） */
  ids() {
    const ids = Object.keys(this.config);
    return ids.length ? ids : ['default'];
  }

  /** その名前の設定（設定が1つもないときの default は初期値） */
  cfgOf(id) {
    if (this.config[id]) return this.config[id];
    return !Object.keys(this.config).length && id === 'default' ? defaultsFor('bosses') : null;
  }

  /** 今の状態。name は今のボスの名前、nextAt は次のボスが出る時刻 */
  get(id) {
    const cfg = this.cfgOf(id) ?? {};
    const s = this.states[id] ?? this.#fresh(cfg, 1);
    const delay = (cfg.nextDelay ?? 6) * 1000;
    return {
      ...s,
      name: nameFor(cfg, s.round),
      nextAt: s.defeated && cfg.autoNext !== false ? s.defeatedAt + delay : null,
      now: Date.now(),
    };
  }

  snapshot() {
    const out = {};
    for (const id of this.ids()) out[id] = this.get(id);
    return out;
  }

  /** ギフト（といいね）でダメージ。設定にあるボス全部に当たる */
  onEvent(e) {
    if (e.kind !== 'gift' && e.kind !== 'like') return;
    for (const [id, cfg] of Object.entries(this.config)) {
      const damage = damageOf(cfg, e);
      if (damage <= 0) continue;
      const by = {
        user: slimUser(e.user),
        ...(e.kind === 'gift' ? { gift: giftDisplayName(e.gift), count: e.gift?.count ?? 1, coins: e.totalDiamonds } : { likes: e.count }),
      };
      this.#hit(id, damage, by, e);
    }
  }

  /**
   * 手で動かす（ダッシュボードのテストボタン・URL・AI）。id を省くと設定にある全部。
   * action: damage（value のダメージ。省くと 100）/ defeat（今すぐ討伐）/ heal（HP を満タンに戻す）/
   *         next（次のボスへ）/ set（HP を value にする）/ reset（1体目からやり直す）
   */
  apply(id, action, value) {
    if (!BOSS_ACTIONS.includes(action)) throw new Error(`action は ${BOSS_ACTIONS.join(' / ')} のどれかです`);
    if (id && !this.cfgOf(id)) throw new Error(`bosses に「${id}」がありません（${this.ids().join(' / ')}）`);
    const n = value == null || value === '' ? null : Number(value);
    if (action === 'damage' && n != null && !(Number.isFinite(n) && n > 0)) throw new Error('value に 1 以上の数を入れてください');
    if (action === 'set' && !(Number.isInteger(n) && n >= 0)) throw new Error('value に 0 以上の整数を入れてください');
    const out = {};
    for (const k of id ? [id] : this.ids()) {
      if (action === 'damage') this.#hit(k, Math.round(n ?? 100), null);
      else if (action === 'defeat') {
        const s = this.#state(k);
        if (!s.defeated) this.#hit(k, s.hp, null);
      } else if (action === 'set') {
        const s = this.#state(k);
        if (n === 0) {
          if (!s.defeated) this.#hit(k, s.hp, null);
        } else this.#change(k, { hp: Math.min(s.maxHp, n), defeated: false, defeatedAt: 0 }, { kind: 'set' });
      } else if (action === 'heal') {
        const s = this.#state(k);
        this.#change(k, { hp: s.maxHp, defeated: false, defeatedAt: 0 }, { kind: 'heal' });
      } else if (action === 'next') this.#next(k);
      else if (action === 'reset') this.#change(k, this.#fresh(this.cfgOf(k), 1), { kind: 'reset' });
      out[k] = this.get(k);
    }
    this.#save(true);
    return out;
  }

  /** 保存を待たずに書く（テストや終了のとき） */
  flush() {
    if (this.saveTimer) this.#save(true);
  }

  #state(id) {
    return (this.states[id] ??= this.#fresh(this.cfgOf(id) ?? {}, 1));
  }

  #fresh(cfg, round) {
    const maxHp = maxHpFor(cfg, round);
    return { round, hp: maxHp, maxHp, defeated: false, defeatedAt: 0, lastHit: null, finisher: null, kills: 0, total: 0, updatedAt: Date.now() };
  }

  #hit(id, damage, by, trigger = null) {
    const cfg = this.cfgOf(id);
    if (!cfg) return;
    const s = this.#state(id);
    const prev = { hp: s.hp, maxHp: s.maxHp, round: s.round };
    s.total += damage;
    if (by?.user) s.lastHit = { user: by.user, damage, at: Date.now() };
    // 討伐の後、次のボスが出るまでのダメージは「オーバーキル」として数字だけ飛ばす
    if (s.defeated) {
      s.updatedAt = Date.now();
      this.#broadcast(id, prev, { kind: 'overkill', damage, by, tier: hitTier(cfg, damage) });
      this.#save();
      return;
    }
    s.hp = Math.max(0, s.hp - damage);
    s.updatedAt = Date.now();
    if (s.hp > 0) {
      this.#broadcast(id, prev, { kind: 'hit', damage, by, tier: hitTier(cfg, damage), low: s.hp / s.maxHp <= (cfg.lowHp ?? 20) / 100 });
      this.#save();
      return;
    }
    // 討伐
    s.defeated = true;
    s.defeatedAt = Date.now();
    s.kills += 1;
    s.finisher = { user: by?.user ?? null, round: s.round, name: nameFor(cfg, s.round), at: s.defeatedAt };
    const event = { kind: 'defeat', damage, by, tier: Math.max(1, hitTier(cfg, damage)), overflow: damage - prev.hp };
    this.#broadcast(id, prev, event);
    this.hub.emit('bossDefeated', { id, config: cfg, boss: this.get(id), by, trigger });
    if (cfg.autoNext !== false) this.#scheduleNext(id);
    this.#save(true);
  }

  #scheduleNext(id) {
    clearTimeout(this.timers[id]);
    const s = this.#state(id);
    const cfg = this.cfgOf(id) ?? {};
    const wait = Math.max(0, s.defeatedAt + (cfg.nextDelay ?? 6) * 1000 - Date.now());
    const timer = setTimeout(() => {
      delete this.timers[id];
      if (this.states[id]?.defeated) this.#next(id);
      this.#save(true);
    }, wait);
    timer.unref?.();
    this.timers[id] = timer;
  }

  // 次のボス: 何体目かを1つ進め、HP を hpScale 倍にして満タンで出す
  #next(id) {
    const cfg = this.cfgOf(id) ?? {};
    const s = this.#state(id);
    const round = s.round + 1;
    const maxHp = maxHpFor(cfg, round);
    this.#change(id, { round, hp: maxHp, maxHp, defeated: false, defeatedAt: 0, lastHit: null }, { kind: 'next' });
  }

  #change(id, patch, event) {
    const s = this.#state(id);
    const prev = { hp: s.hp, maxHp: s.maxHp, round: s.round };
    if (patch.defeated === false) {
      clearTimeout(this.timers[id]);
      delete this.timers[id];
    }
    Object.assign(s, patch, { updatedAt: Date.now() });
    this.#broadcast(id, prev, event);
  }

  #broadcast(id, prev, event) {
    const boss = this.get(id);
    this.hub.broadcast({ type: 'boss', id, boss, prev, event });
    this.hub.emit('boss', id, boss, event);
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || typeof data !== 'object') return;
      for (const [id, s] of Object.entries(data)) {
        if (!s || typeof s !== 'object') continue;
        const maxHp = Math.max(1, Number(s.maxHp) || 1);
        this.states[id] = {
          round: Math.max(1, Math.floor(Number(s.round) || 1)),
          hp: Math.max(0, Math.min(maxHp, Number(s.hp) || 0)),
          maxHp,
          defeated: Boolean(s.defeated),
          defeatedAt: Number(s.defeatedAt) || 0,
          lastHit: s.lastHit ?? null,
          finisher: s.finisher ?? null,
          kills: Number(s.kills) || 0,
          total: Number(s.total) || 0,
          updatedAt: Number(s.updatedAt) || 0,
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
        fs.writeFileSync(this.file, JSON.stringify(this.states, null, 2));
      } catch (err) {
        console.warn('[boss] 保存できませんでした:', err.message);
      }
    };
    if (now) return write();
    this.saveTimer = setTimeout(write, SAVE_DELAY);
    this.saveTimer.unref?.();
  }
}
