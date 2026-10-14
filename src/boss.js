// ボス討伐 HP バー。ギフトのコイン（といいね）がダメージになり、みんなでボスの HP を削る。
// HP・何体目か・最後に一撃を入れた人はサーバーで持ち、data/boss.json に残す（OBS を読み込み直しても続きから）。
// HP が 0 になったら討伐: ウィジェットに知らせ、設定があればルーレットを回し、Minecraft にコマンドを送る（runtime.js でつなぐ）。
// 少し待ってから、HP を hpScale 倍にした次のボスが出てくる。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultsFor } from './schema.js';
import { giftMatches, giftDisplayName } from './gifts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BOSS_FILE = path.resolve(process.env.TW_DATA || path.join(root, 'data'), 'boss.json');

export const BOSS_ACTIONS = ['damage', 'defeat', 'heal', 'next', 'set', 'reset', 'rival', 'rivalAdd'];
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
    this.bus = null;
    this.rankProvider = null; // rank-gap の live。{ rivalCoins, name } か null
    this.configuredRival = {}; // id → 直前に設定から入れた相手コイン（API で変えた値は上書きしない）
    this.#load();
    hub.on('event', (e) => this.onEvent(e));
  }

  /** 名前付きイベント（boss.damage / boss.heal）を流す先。無くても動く */
  setBus(bus) {
    this.bus = bus ?? null;
  }

  /** rank-gap かつ rankSource が live のとき、相手コインを返す関数。null なら手入力に戻る */
  setRankProvider(fn) {
    this.rankProvider = typeof fn === 'function' ? fn : null;
  }

  setConfig(bosses) {
    this.config = bosses ?? {};
    for (const id of this.ids()) {
      const cfg = this.cfgOf(id);
      let s = this.states[id];
      if (!s) s = this.states[id] = this.#fresh(cfg, 1);
      if (cfg?.mode === 'rank-gap') {
        clearTimeout(this.timers[id]);
        delete this.timers[id];
        const cfgRival = Math.max(0, Number(cfg.rivalCoins) || 0);
        const prevCfg = this.configuredRival[id];
        if (s.rivalCoins == null || (prevCfg != null && s.rivalCoins === prevCfg)) s.rivalCoins = cfgRival;
        this.configuredRival[id] = cfgRival;
        this.#layoutGap(id, { kind: 'config' }, { emitDefeat: false });
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
    const gap = cfg.mode === 'rank-gap';
    const rival = gap ? this.#effectiveRival(id) : Math.max(0, Number(s.rivalCoins) || 0);
    const ours = Math.max(0, Number(s.ourCoins) || 0);
    const hp = gap ? Math.max(0, rival - ours) : s.hp;
    const maxHp = gap ? Math.max(1, rival || 1) : s.maxHp;
    if (gap) {
      s.hp = hp;
      s.maxHp = maxHp;
      if (rival > 0 && hp === 0) s.defeated = true;
      else if (hp > 0 || rival === 0) s.defeated = false;
    }
    return {
      ...s,
      hp,
      maxHp,
      name: nameFor(cfg, s.round),
      nextAt: gap ? null : s.defeated && cfg.autoNext !== false ? s.defeatedAt + delay : null,
      now: Date.now(),
      mode: gap ? 'rank-gap' : 'hp',
      ourCoins: ours,
      rivalCoins: gap ? rival : (s.rivalCoins ?? 0),
      manualRival: s.rivalCoins ?? 0,
      rankSource: cfg.rankSource === 'live' ? 'live' : 'manual',
      rankLive: gap ? Boolean(s.rankLive) : false,
      gap: gap ? hp : s.hp,
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
      if (cfg?.mode === 'rank-gap') {
        if (e.kind !== 'gift') continue;
        const coins = this.#gapCoins(cfg, e);
        if (coins <= 0) continue;
        const by = {
          user: slimUser(e.user),
          gift: giftDisplayName(e.gift),
          giftId: e.gift?.id ?? null,
          count: e.gift?.count ?? 1,
          coins: e.totalDiamonds ?? 0,
        };
        this.#addOur(id, coins, by, e);
        continue;
      }
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
    if (action === 'rival' && !(Number.isFinite(n) && n >= 0)) throw new Error('value に 0 以上の数を入れてください');
    if (action === 'rivalAdd' && !(Number.isFinite(n) && n !== 0)) throw new Error('value に 0 以外の数を入れてください');
    const out = {};
    for (const k of id ? [id] : this.ids()) {
      if (action === 'damage') {
        if (this.#isGap(k)) this.#addOur(k, Math.round(n ?? 100), null, null);
        else this.#hit(k, Math.round(n ?? 100), null);
      } else if (action === 'rival') {
        this.#state(k).rivalCoins = n;
        if (this.#isGap(k)) this.#layoutGap(k, { kind: 'set', amount: n }, { emitDefeat: true });
      } else if (action === 'rivalAdd') this.#addRival(k, n);
      else if (action === 'defeat') {
        const s = this.#state(k);
        if (this.#isGap(k)) {
          const before = Math.max(0, Number(s.ourCoins) || 0);
          const rival = this.#effectiveRival(k);
          // 相手が 0 のときはまだ始まっていないので討伐にしない
          if (rival > 0 && !s.defeated) {
            s.ourCoins = rival;
            this.#layoutGap(k, { kind: 'hit', damage: Math.max(0, rival - before) }, { emitDefeat: true });
          }
        } else if (!s.defeated) this.#hit(k, s.hp, null);
      } else if (action === 'set') {
        const s = this.#state(k);
        if (this.#isGap(k)) {
          const rival = this.#effectiveRival(k);
          s.ourCoins = Math.max(0, rival - n);
          this.#layoutGap(k, { kind: 'set', amount: n }, { emitDefeat: n === 0 });
        } else if (n === 0) {
          if (!s.defeated) this.#hit(k, s.hp, null);
        } else this.#change(k, { hp: Math.min(s.maxHp, n), defeated: false, defeatedAt: 0 }, { kind: 'set' });
      } else if (action === 'heal') {
        if (this.#isGap(k)) {
          const s = this.#state(k);
          const healed = Math.max(0, Number(s.ourCoins) || 0);
          s.ourCoins = 0;
          this.#layoutGap(k, { kind: 'heal', amount: healed }, { emitDefeat: false });
        } else {
          const s = this.#state(k);
          this.#change(k, { hp: s.maxHp, defeated: false, defeatedAt: 0 }, { kind: 'heal' });
        }
      } else if (action === 'next') {
        if (this.#isGap(k)) {
          const s = this.#state(k);
          s.round += 1;
          s.lastHit = null;
          this.#layoutGap(k, { kind: 'next' }, { emitDefeat: false });
        } else this.#next(k);
      } else if (action === 'reset') {
        const cfg = this.cfgOf(k);
        const fresh = this.#fresh(cfg, 1);
        this.configuredRival[k] = cfg?.mode === 'rank-gap' ? Math.max(0, Number(cfg.rivalCoins) || 0) : undefined;
        this.#change(k, fresh, { kind: 'reset' });
        if (cfg?.mode === 'rank-gap') this.#layoutGap(k, { kind: 'reset' }, { emitDefeat: false });
      }
      out[k] = this.get(k);
    }
    this.#save(true);
    return out;
  }

  /**
   * 一部だけ回復する（動作の boss.heal と開発用のテスト）。
   * 固定HPは amount だけ戻す。順位差は相手のコインを amount 足す（差が広がる）。
   */
  healBy(id, amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error('amount に 1 以上の数を入れてください');
    if (id && !this.cfgOf(id)) throw new Error(`bosses に「${id}」がありません（${this.ids().join(' / ')}）`);
    const out = {};
    for (const k of id ? [id] : this.ids()) {
      if (this.#isGap(k)) this.#addRival(k, Math.round(n));
      else {
        const s = this.#state(k);
        const hp = Math.min(s.maxHp, (s.defeated ? 0 : s.hp) + Math.round(n));
        this.#change(k, { hp, defeated: hp <= 0, defeatedAt: hp <= 0 ? s.defeatedAt : 0 }, { kind: 'heal', amount: Math.round(n) });
      }
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

  #isGap(id) {
    return this.cfgOf(id)?.mode === 'rank-gap';
  }

  /** 順位差の自分側。コインは 1:1。いいねと coinDamage は使わない */
  #gapCoins(cfg, e) {
    if (e?.kind !== 'gift') return 0;
    if (cfg?.gifts?.length && !named(e.gift, cfg.gifts)) return 0;
    return Math.max(0, Math.round(Number(e.totalDiamonds) || 0));
  }

  #addOur(id, amount, by, trigger) {
    const add = Math.round(Number(amount) || 0);
    if (add <= 0) return;
    const cfg = this.cfgOf(id);
    if (!cfg) return;
    const s = this.#state(id);
    s.ourCoins = Math.max(0, Number(s.ourCoins) || 0) + add;
    s.total += add;
    if (by?.user) s.lastHit = { user: by.user, damage: add, at: Date.now() };
    this.#layoutGap(id, { kind: 'hit', damage: add, amount: add, by, tier: hitTier(cfg, add), trigger }, { emitDefeat: true });
    this.#save();
  }

  /** 手入力の相手コインを足す（マイナスなら減らす）。順位差のときは差が変わる */
  #addRival(id, delta) {
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) return;
    const s = this.#state(id);
    const cfg = this.cfgOf(id) ?? {};
    const base = s.rivalCoins == null ? Math.max(0, Number(cfg.rivalCoins) || 0) : Math.max(0, Number(s.rivalCoins) || 0);
    s.rivalCoins = Math.max(0, base + d);
    if (!this.#isGap(id)) return;
    if (d > 0) this.#layoutGap(id, { kind: 'heal', amount: d }, { emitDefeat: false });
    else this.#layoutGap(id, { kind: 'hit', damage: Math.abs(d), amount: Math.abs(d) }, { emitDefeat: true });
    this.#save();
  }

  #readLive(id) {
    if (typeof this.rankProvider !== 'function') return null;
    try {
      const v = this.rankProvider(id);
      if (!v || typeof v !== 'object') return null;
      const n = Number(v.rivalCoins);
      if (!Number.isFinite(n)) return null;
      return { rivalCoins: Math.max(0, n), name: v.name ?? null };
    } catch {
      return null;
    }
  }

  /** いま効いている相手コイン。live が取れなければ手入力 */
  #effectiveRival(id) {
    const s = this.#state(id);
    const cfg = this.cfgOf(id) ?? {};
    if (cfg.rankSource === 'live') {
      const live = this.#readLive(id);
      if (live) {
        s.rankLive = true;
        s.rivalName = live.name ?? null;
        return live.rivalCoins;
      }
    }
    s.rankLive = false;
    return Math.max(0, Number(s.rivalCoins) || 0);
  }

  /**
   * 順位差の HP を相手コインと自分のコインから置き直す。
   * 設定の読み込みでは討伐イベントを出さない（emitDefeat: false）。
   * 次のボスの自動出現と hpScale は使わない。
   */
  #layoutGap(id, event = {}, { emitDefeat = false } = {}) {
    const cfg = this.cfgOf(id);
    if (!cfg) return;
    const s = this.#state(id);
    const prev = { hp: s.hp, maxHp: s.maxHp, round: s.round, defeated: s.defeated };
    const wasDefeated = Boolean(s.defeated);
    const rival = this.#effectiveRival(id);
    const ours = Math.max(0, Number(s.ourCoins) || 0);
    const hp = Math.max(0, rival - ours);
    const maxHp = Math.max(1, rival || 1);
    const defeated = rival > 0 && hp === 0;
    s.hp = hp;
    s.maxHp = maxHp;
    s.defeated = defeated;
    if (defeated && !wasDefeated) {
      s.defeatedAt = Date.now();
      if (emitDefeat) {
        s.kills += 1;
        s.finisher = { user: event.by?.user ?? null, round: s.round, name: nameFor(cfg, s.round), at: s.defeatedAt };
      }
    } else if (!defeated) {
      s.defeatedAt = 0;
    }
    s.updatedAt = Date.now();
    const unchanged = prev.hp === hp && prev.maxHp === maxHp && wasDefeated === defeated;
    const kind = emitDefeat && defeated && !wasDefeated ? 'defeat' : (event.kind || 'config');
    if (unchanged && (event.kind === 'config' || event.kind === 'reset')) return;
    const out = { ...event, kind };
    if (kind === 'defeat') out.tier = Math.max(1, out.tier ?? hitTier(cfg, out.damage ?? 0));
    this.#broadcast(id, prev, out);
    if (emitDefeat && defeated && !wasDefeated) {
      this.hub.emit('bossDefeated', { id, config: cfg, boss: this.get(id), by: event.by ?? null, trigger: event.trigger ?? null });
    }
  }

  #fresh(cfg, round) {
    const gap = cfg?.mode === 'rank-gap';
    const rival = gap ? Math.max(0, Number(cfg.rivalCoins) || 0) : null;
    const maxHp = gap ? Math.max(1, rival || 1) : maxHpFor(cfg, round);
    const hp = gap ? Math.max(0, rival || 0) : maxHp;
    return {
      round, hp, maxHp, defeated: false, defeatedAt: 0, lastHit: null, finisher: null, kills: 0, total: 0, updatedAt: Date.now(),
      ourCoins: 0, rivalCoins: rival, rankLive: false, rivalName: null,
    };
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
    if (!this.bus || !event) return;
    const kind = event.kind;
    if (kind === 'hit' || kind === 'defeat' || kind === 'overkill') {
      const amount = Number.isFinite(event.amount) ? event.amount : Number.isFinite(event.damage) ? event.damage : Math.max(0, (prev?.hp ?? 0) - boss.hp);
      this.bus.emit('boss.damage', { id, amount, boss, event });
    } else if (kind === 'heal') {
      const amount = Number.isFinite(event.amount) ? event.amount : Math.max(0, boss.hp - (prev?.hp ?? 0));
      this.bus.emit('boss.heal', { id, amount, boss, event });
    }
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
          ourCoins: Math.max(0, Number(s.ourCoins) || 0),
          rivalCoins: s.rivalCoins == null ? null : Math.max(0, Number(s.rivalCoins) || 0),
          rankLive: false,
          rivalName: null,
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
