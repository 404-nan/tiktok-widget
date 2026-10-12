// WIN 数（妨害マイクラなどのゲームクリア回数）。数はサーバーで持ち、data/wins.json に残す（配信をまたいで続けられる）。
// クリアしたらボタン・URL で +1、ギフトのルール（rules）で増やしたり減らしたり 0 に戻したりする。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleMatches } from './minecraft.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WINS_FILE = path.resolve(process.env.TW_DATA || path.join(root, 'data'), 'wins.json');

const UNDO = 50; // 1つ戻すために覚えておく数
export const WIN_ACTIONS = ['win', 'add', 'set', 'undo', 'reset'];

const slimUser = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar } : null);

// 演出の段階の境目（大妨害 / 超妨害 / 壊滅）。配信の規模に合わせて選ぶ
export const LOSS_PRESETS = { large: [10, 100, 1000], medium: [3, 10, 30], small: [1, 3, 5] };
const COMBO_WINDOW = 15000; // 前の妨害からこの時間内なら「連続妨害」
const COMBO_TIERS = [3, 5, 8]; // 連続妨害 ×3 で1段、×5 で2段、×8 で3段上がる

// 境目の数と、連続した回数から段階を出す
function tierOf(steps, delta, combo, comboUp) {
  const [big, huge, top] = steps;
  const a = Math.abs(delta);
  const byAmount = a >= top ? 3 : a >= huge ? 2 : a >= big ? 1 : 0;
  const byCombo = comboUp === false ? 0 : COMBO_TIERS.filter((n) => combo >= n).length;
  return Math.max(byAmount, byCombo);
}

/** 減ったときの演出の段階（0 通常 / 1 大妨害 / 2 超妨害 / 3 壊滅） */
export function lossTier(cfg = {}, delta, combo = 1) {
  const steps = cfg.lossPreset === 'custom' ? [cfg.bigLoss ?? 10, cfg.hugeLoss ?? 100, cfg.ruinLoss ?? 1000] : LOSS_PRESETS[cfg.lossPreset] ?? LOSS_PRESETS.large;
  return tierOf(steps, delta, combo, cfg.comboUp);
}

/** 増えたときの演出の段階（0 通常 / 1 大 / 2 超 / 3 最大）。クリア（+1 ボタン）は少なくとも 1 */
export function gainTier(cfg = {}, delta, combo = 1, action = 'add') {
  const steps = cfg.gainPreset === 'custom' ? [cfg.bigGain ?? 10, cfg.hugeGain ?? 100, cfg.topGain ?? 1000] : LOSS_PRESETS[cfg.gainPreset] ?? LOSS_PRESETS.large;
  const tier = tierOf(steps, delta, combo, cfg.comboUp);
  return action === 'win' && cfg.clearFx !== false ? Math.max(1, tier) : tier;
}

export class WinsEngine {
  constructor(hub, file = WINS_FILE) {
    this.hub = hub;
    this.file = file;
    this.config = {};
    this.counts = {}; // id → { wins, low（いちばん下まで行った数）, updatedAt }
    this.undo = {}; // id → 前の数の一覧
    this.combos = {}; // id → { n, total, t, timer }（連続妨害: 何回続いて、合わせていくつ減ったか）
    this.gains = {}; // id → { n, t }（続けて増えた回数）
    this.#load();
    hub.on('event', (e) => this.onGift(e));
  }

  setConfig(wins) {
    this.config = wins ?? {};
  }

  /** 設定にある名前（なければ default） */
  ids() {
    const ids = Object.keys(this.config);
    return ids.length ? ids : ['default'];
  }

  /** 今の数。depth はマイナスの深さの段階（0〜3、境目は lossPreset）、combo は続いている連続妨害 */
  get(id) {
    const c = { wins: 0, low: 0, updatedAt: 0, ...this.counts[id] };
    const k = this.combos[id];
    return {
      ...c,
      depth: c.wins < 0 ? lossTier({ ...this.config[id], comboUp: false }, c.wins) : 0,
      combo: k ? { n: k.n, total: k.total, endsAt: k.t + COMBO_WINDOW, now: Date.now() } : null,
    };
  }

  snapshot() {
    const out = {};
    for (const id of new Set([...this.ids(), ...Object.keys(this.counts)])) out[id] = this.get(id);
    return out;
  }

  /** ギフトのルール: 上から順に最初に合ったもので増減する */
  onGift(e) {
    if (e.kind !== 'gift') return;
    let changed = false;
    for (const [id, c] of Object.entries(this.config)) {
      const rule = (c.rules ?? []).find((r) => ruleMatches(r, e));
      if (!rule) continue;
      const by = { user: slimUser(e.user), gift: e.gift.nameJa || e.gift.name, count: e.gift.count, text: rule.text ?? '' };
      if (rule.set != null) this.#change(id, 'set', rule.set, by);
      else this.#change(id, 'add', rule.add * (rule.perCount === false ? 1 : e.gift.count), by);
      changed = true;
    }
    if (changed) this.#save();
  }

  /**
   * 数を変える。id を省くと設定にある全部。
   * action: win（+1）/ add（value を足す。-1 で減らす）/ set（value にする）/ undo（1つ戻す）/ reset（0 に戻す）
   */
  apply(id, action, value) {
    if (!WIN_ACTIONS.includes(action)) throw new Error(`action は ${WIN_ACTIONS.join(' / ')} のどれかです`);
    if (id && Object.keys(this.config).length && !this.config[id]) throw new Error(`wins に「${id}」がありません（${this.ids().join(' / ')}）`);
    if ((action === 'add' || action === 'set') && !Number.isInteger(Number(value))) throw new Error('value に整数を入れてください');
    const out = {};
    for (const k of id ? [id] : this.ids()) out[k] = this.#change(k, action, Number(value));
    this.#save();
    return out;
  }

  #change(id, action, value, by = null) {
    const prev = this.get(id);
    let wins = prev.wins;
    let low = prev.low;
    if (action === 'undo') {
      const stack = this.undo[id] ?? [];
      if (!stack.length) return prev;
      ({ wins, low } = stack.pop());
    } else {
      if (action === 'win') wins += 1;
      else if (action === 'add') wins += value;
      else if (action === 'set') wins = value;
      else if (action === 'reset') wins = 0;
      if (this.config[id]?.negative === false) wins = Math.max(0, wins); // 0 で止める設定のとき
      low = action === 'reset' ? 0 : Math.min(low, wins);
      (this.undo[id] ??= []).push({ wins: prev.wins, low: prev.low });
      if (this.undo[id].length > UNDO) this.undo[id].shift();
    }
    this.counts[id] = { wins, low, updatedAt: Date.now() };
    // 「クリアで +1」なのか「ギフトで -1」なのか「戻した」なのかをウィジェットに伝える
    const event = { kind: action, delta: wins - prev.wins, by };
    // 減ったとき（戻す・手で入れ直す・リセットは除く）は、連続妨害の数と演出の段階を決める
    const quiet = action === 'undo' || (!by && (action === 'set' || action === 'reset'));
    if (event.delta < 0 && !quiet) {
      const k = this.#comboHit(id, event.delta);
      event.combo = k.n;
      event.comboTotal = k.total;
      event.tier = lossTier(this.config[id], event.delta, k.n);
    } else if (event.delta > 0 && !quiet) {
      const now = Date.now();
      const g = this.gains[id];
      const n = g && now - g.t < COMBO_WINDOW ? g.n + 1 : 1;
      this.gains[id] = { n, t: now };
      event.combo = n;
      event.tier = gainTier(this.config[id], event.delta, n, action);
      // 目標を越えた瞬間
      const goal = this.config[id]?.goal ?? 0;
      if (goal > 0 && prev.wins < goal && wins >= goal) event.goal = true;
    }
    const c = this.get(id);
    this.hub.broadcast({ type: 'wins', id, counter: c, prev, event });
    this.hub.emit('wins', id, c, event);
    return c;
  }

  // 連続妨害: 前の妨害から COMBO_WINDOW 以内なら続き。途切れたら合計を知らせる
  #comboHit(id, delta) {
    const now = Date.now();
    const last = this.combos[id];
    const k = last && now - last.t < COMBO_WINDOW ? last : { n: 0, total: 0 };
    clearTimeout(k.timer);
    k.n += 1;
    k.total += delta;
    k.t = now;
    k.timer = setTimeout(() => this.#comboEnd(id), COMBO_WINDOW);
    k.timer.unref?.();
    this.combos[id] = k;
    return k;
  }

  #comboEnd(id) {
    const k = this.combos[id];
    if (!k) return;
    delete this.combos[id];
    this.hub.broadcast({ type: 'winsCombo', id, combo: { n: k.n, total: k.total, tier: lossTier(this.config[id], k.total, k.n) }, counter: this.get(id) });
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data && typeof data === 'object') {
        for (const [id, c] of Object.entries(data)) {
          const wins = Number(c?.wins) || 0;
          this.counts[id] = { wins, low: Math.min(wins, Number(c?.low) || 0), updatedAt: Number(c?.updatedAt) || 0 };
        }
      }
    } catch {}
  }

  #save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.counts, null, 2));
    } catch (err) {
      console.warn('[wins] 保存できませんでした:', err.message);
    }
  }
}
