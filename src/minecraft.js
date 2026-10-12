// Minecraft 連携。config.yaml の minecraft.rules と、ルーレットの項目の commands を
// RCON で Minecraft サーバーに送る（SuperStream などのプラグインのコマンドも送れる）。

import { Rcon } from './rcon.js';
import { Panel } from './panel.js';

const MAX_REPEAT = 50;
const MAX_QUEUE = 500;
const GAP_MS = 60; // コマンドの間隔（サーバーを詰まらせない）
const PANEL_GAP_MS = 120; // パネルの API は1分あたりの回数に上限があるので、少しあける
const RETRY_AFTER_MS = 5000;

// 視聴者の名前などはコマンドに入るので、文字・数字・空白・_ . - 以外は取り除く
export const safe = (v, max = 32) =>
  String(v ?? '')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, max);

export function fill(command, vars) {
  return command.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

const named = (gift, names) => {
  if (!gift || !names?.length) return false;
  const want = names.map((n) => String(n).toLowerCase());
  return want.includes(String(gift.name).toLowerCase()) || want.includes(String(gift.id));
};

/** イベントに合うかどうか（events を書かなければギフトだけが対象） */
export function ruleMatches(rule, e) {
  const events = rule.events?.length ? rule.events : ['gift'];
  if (!events.includes(e.kind)) return false;
  if (rule.gifts?.length && !(e.kind === 'gift' && named(e.gift, rule.gifts))) return false;
  if (rule.minCoins != null && !(e.kind === 'gift' && e.totalDiamonds >= rule.minCoins)) return false;
  if (rule.users?.length && !rule.users.includes(e.user?.id)) return false;
  return true;
}

/** SuperStream の演出を起こすコマンド（ss test profile / ss test action） */
export function superstreamCommands(src, profile) {
  const p = safe(profile, 64).replace(/ /g, '') || 'default_profile';
  const out = [];
  if (src.superstreamGift) out.push(`ss test profile ${p} ${src.superstreamGift}`);
  if (src.superstreamAction) out.push(`ss test action ${p} ${src.superstreamAction}`);
  return out;
}

export function varsFor(e = {}, extra = {}) {
  return {
    user: safe(e.user?.name),
    userId: safe(e.user?.id),
    gift: safe(e.gift?.name),
    giftId: safe(e.gift?.id, 20),
    count: e.gift?.count ?? e.count ?? 1,
    coins: e.totalDiamonds ?? 0,
    item: '',
    roulette: '',
    ...extra,
  };
}

export class Minecraft {
  constructor(hub) {
    this.hub = hub;
    this.config = null;
    this.rcon = null;
    this.queue = [];
    this.running = false;
    this.lastFailure = 0;
    this.status = { state: 'off', message: 'Minecraft 連携はオフです', sent: 0 };
    this.likeTotals = new Map(); // everyLikes のルールごとの、いいねの累計
    hub.on('event', (e) => this.onEvent(e));
  }

  setConfig(mc) {
    const prev = this.config;
    this.config = mc;
    const keys = ['via', 'host', 'port', 'password', 'panelUrl', 'panelServer', 'panelKey'];
    const changed = !prev || keys.some((k) => prev[k] !== mc[k]);
    if (changed || !mc.enabled) {
      this.rcon?.close();
      this.rcon = null;
    }
    if (!mc.enabled) return this.#setStatus({ state: 'off', message: 'Minecraft 連携はオフです' });
    if (changed || this.status.state === 'off') this.check();
  }

  /** つながるか確かめる */
  async check() {
    if (!this.config?.enabled) return this.status;
    try {
      await this.#client().connect();
      this.#setStatus({ state: 'ok', message: `${this.#where()} に接続しました` });
    } catch (err) {
      this.lastFailure = Date.now();
      this.#setStatus({ state: 'error', message: err.message });
    }
    return this.status;
  }

  onEvent(e) {
    if (!this.config?.enabled) return;
    const profile = this.config.superstreamProfile;
    // 届いたギフトをそのまま SuperStream に渡す（そのギフト ID に設定された演出が動く）
    if (this.config.forwardGifts && e.kind === 'gift' && /^\d+$/.test(String(e.gift.id))) {
      const times = Math.min(MAX_REPEAT, e.gift.count ?? 1);
      for (let i = 0; i < times; i++) this.enqueue(superstreamCommands({ superstreamGift: e.gift.id }, profile), {}, 'superstream');
    }
    for (const rule of this.config.rules ?? []) {
      if (!ruleMatches(rule, e)) continue;
      let times = rule.perCount ? Math.min(MAX_REPEAT, e.gift?.count ?? e.count ?? 1) : 1;
      // everyLikes: いいねが N 回たまるごとに1回（配信中の合計で数える）
      if (rule.everyLikes && e.kind === 'like') {
        const key = rule.name ?? JSON.stringify(rule);
        const before = this.likeTotals.get(key) ?? 0;
        const after = before + Math.max(0, Number(e.count) || 0);
        this.likeTotals.set(key, after);
        times = Math.min(MAX_REPEAT, Math.floor(after / rule.everyLikes) - Math.floor(before / rule.everyLikes));
        if (times <= 0) continue;
      }
      const vars = varsFor(e);
      const commands = [...rule.commands, ...superstreamCommands(rule, profile)];
      for (let i = 0; i < times; i++) this.enqueue(commands, vars, rule.name);
    }
  }

  /** ルーレットの当たりの項目に commands や SuperStream の演出があれば送る */
  onRouletteResult(roulette, item, trigger) {
    if (!this.config?.enabled) return;
    const commands = [...(item.commands ?? []), ...superstreamCommands(item, this.config.superstreamProfile)];
    if (!commands.length) return;
    this.enqueue(commands, varsFor(trigger ?? {}, { item: safe(item.label, 40), roulette: safe(roulette.name || roulette.id, 40) }), 'roulette');
  }

  enqueue(commands, vars, source) {
    for (const c of commands) {
      if (this.queue.length >= MAX_QUEUE) break;
      this.queue.push({ command: fill(c, vars), source });
    }
    this.#drain();
  }

  /** ダッシュボードや AI からのテスト送信。返事をそのまま返す */
  async test(command) {
    if (!this.config) throw new Error('設定が読み込まれていません');
    const response = await this.#client().send(command.replace(/^\//, ''));
    this.#log({ command, ok: true, response, source: 'test' });
    return response;
  }

  // via: panel ならレンタルサーバーのパネルの API、それ以外は RCON で送る
  #client() {
    if (!this.rcon) {
      const c = this.config;
      this.rcon = c.via === 'panel' ? new Panel({ url: c.panelUrl, server: c.panelServer, key: c.panelKey }) : new Rcon(c);
    }
    return this.rcon;
  }

  #where() {
    return this.config.via === 'panel' ? `パネル（サーバー ${this.config.panelServer}）` : `${this.config.host}:${this.config.port}`;
  }

  async #drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const { command, source } = this.queue.shift();
      // つながらないときは少し待ってから試す（その間のコマンドは捨てる）
      if (Date.now() - this.lastFailure < RETRY_AFTER_MS && this.status.state === 'error') {
        this.#log({ command, ok: false, response: '接続できないため送りませんでした', source });
        continue;
      }
      try {
        const response = await this.#client().send(command);
        if (this.status.state !== 'ok') this.#setStatus({ state: 'ok', message: `${this.#where()} に接続しました` });
        this.status.sent += 1;
        this.#log({ command, ok: true, response, source });
      } catch (err) {
        this.lastFailure = Date.now();
        this.rcon?.close();
        this.#setStatus({ state: 'error', message: err.message });
        this.#log({ command, ok: false, response: err.message, source });
      }
      await new Promise((r) => setTimeout(r, this.config.via === 'panel' ? PANEL_GAP_MS : GAP_MS));
    }
    this.running = false;
  }

  #setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.hub.broadcast({ type: 'minecraft', status: this.status });
  }

  #log(entry) {
    const log = { ts: Date.now(), ...entry };
    this.hub.broadcast({ type: 'minecraft', status: this.status, log });
    this.hub.emit('minecraft', log);
  }
}
