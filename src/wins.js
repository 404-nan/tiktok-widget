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

export class WinsEngine {
  constructor(hub, file = WINS_FILE) {
    this.hub = hub;
    this.file = file;
    this.config = {};
    this.counts = {}; // id → { wins, updatedAt }
    this.undo = {}; // id → 前の数の一覧
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

  get(id) {
    return { wins: 0, updatedAt: 0, ...this.counts[id] };
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
      const by = { user: slimUser(e.user), gift: e.gift.name, count: e.gift.count, text: rule.text ?? '' };
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
    if (action === 'undo') {
      const stack = this.undo[id] ?? [];
      if (!stack.length) return prev;
      wins = stack.pop();
    } else {
      if (action === 'win') wins += 1;
      else if (action === 'add') wins += value;
      else if (action === 'set') wins = value;
      else if (action === 'reset') wins = 0;
      if (!this.config[id]?.negative) wins = Math.max(0, wins);
      (this.undo[id] ??= []).push(prev.wins);
      if (this.undo[id].length > UNDO) this.undo[id].shift();
    }
    const c = { wins, updatedAt: Date.now() };
    this.counts[id] = c;
    // 「クリアで +1」なのか「ギフトで -1」なのか「戻した」なのかをウィジェットに伝える
    const event = { kind: action, delta: wins - prev.wins, by };
    this.hub.broadcast({ type: 'wins', id, counter: c, prev, event });
    this.hub.emit('wins', id, c, event);
    return c;
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data && typeof data === 'object') {
        for (const [id, c] of Object.entries(data)) this.counts[id] = { wins: Number(c?.wins) || 0, updatedAt: Number(c?.updatedAt) || 0 };
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
