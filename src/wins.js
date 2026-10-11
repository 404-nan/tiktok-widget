// WIN 数（連勝数・勝ち数・戦績）。数はサーバーで持ち、data/wins.json に残す（配信をまたいで続けられる）。
// PK バトルの結果（'battle' イベント）と、ボタン（/api/control の target: 'wins'）で増減する。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WINS_FILE = path.resolve(process.env.TW_DATA || path.join(root, 'data'), 'wins.json');

const UNDO = 30; // 1つ戻すために覚えておく数
const ACTIONS = ['win', 'lose', 'draw', 'undo', 'set', 'reset'];

export const emptyCounter = () => ({ wins: 0, losses: 0, draws: 0, streak: 0, best: 0, updatedAt: 0 });

export class WinsEngine {
  constructor(hub, file = WINS_FILE) {
    this.hub = hub;
    this.file = file;
    this.config = {};
    this.counters = {};
    this.undo = {}; // id → 前の状態の一覧
    this.#load();
    hub.on('event', (e) => {
      if (e.kind !== 'battle') return;
      for (const [id, c] of Object.entries(this.config)) if (c.pk) this.apply(id, e.result, { battle: e });
    });
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
    return { ...emptyCounter(), ...this.counters[id] };
  }

  snapshot() {
    const out = {};
    for (const id of new Set([...this.ids(), ...Object.keys(this.counters)])) out[id] = this.get(id);
    return out;
  }

  /**
   * 数を変える。id を省くと設定にある全部。
   * action: win / lose / draw / undo（1つ戻す）/ set（value に数を入れる）/ reset
   */
  apply(id, action, { value, battle } = {}) {
    if (!ACTIONS.includes(action)) throw new Error(`action は ${ACTIONS.join(' / ')} のどれかです`);
    const ids = id ? [id] : this.ids();
    const out = {};
    for (const k of ids) out[k] = this.#applyOne(k, action, value, battle);
    this.#save();
    return out;
  }

  #applyOne(id, action, value, battle) {
    const prev = this.get(id);
    const c = { ...prev };
    const mode = this.config[id]?.mode ?? 'streak';
    if (action === 'undo') {
      const stack = this.undo[id] ?? [];
      if (!stack.length) return c;
      Object.assign(c, stack.pop());
    } else {
      (this.undo[id] ??= []).push(prev);
      if (this.undo[id].length > UNDO) this.undo[id].shift();
      if (action === 'win') {
        c.wins++;
        c.streak++;
      } else if (action === 'lose') {
        c.losses++;
        c.streak = 0;
      } else if (action === 'draw') {
        c.draws++;
      } else if (action === 'set') {
        const n = Math.max(0, Math.floor(Number(value)));
        if (!Number.isFinite(n)) throw new Error('value に数を入れてください');
        if (mode === 'streak') c.streak = n;
        else c.wins = n;
      } else if (action === 'reset') {
        Object.assign(c, emptyCounter());
      }
      c.best = action === 'reset' ? 0 : Math.max(c.best, c.streak);
    }
    c.updatedAt = Date.now();
    this.counters[id] = c;
    const event = { kind: action, battle: battle ?? null };
    // 画面の数が変わったのが「勝ち」なのか「戻した」なのかをウィジェットに伝える
    this.hub.broadcast({ type: 'wins', id, counter: c, prev, event });
    this.hub.emit('wins', id, c, event);
    return c;
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data && typeof data === 'object') this.counters = data;
    } catch {}
  }

  #save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.counters, null, 2));
    } catch (err) {
      console.warn('[wins] 保存できませんでした:', err.message);
    }
  }
}
