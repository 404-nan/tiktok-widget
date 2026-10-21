// Minecraft 連携。config.yaml の minecraft.rules と、ルーレットの項目の commands を
// RCON で Minecraft サーバーに送る（マイクラ側の演出プラグインのコマンドも送れる）。

import { Rcon } from './rcon.js';
import { giftMatches, giftDisplayName } from './gifts.js';
import { NamedSabotageEngine, namedSabotageCleanupCommands } from './minecraft-name.js';
import { GoalAlertEngine } from './mc-goal-alert.js';

const MAX_REPEAT = 50;
const GAP_MS = 60; // コマンドの間隔（サーバーを詰まらせない）
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
  return giftMatches(gift, names);
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

/** マイクラの演出を起こすコマンド（ss test profile / ss test action） */
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
    gift: safe(giftDisplayName(e.gift)),
    giftId: safe(e.gift?.id, 20),
    count: e.gift?.count ?? e.count ?? 1,
    coins: e.totalDiamonds ?? 0,
    item: '',
    roulette: '',
    ...extra,
  };
}

export class Minecraft {
  constructor(hub, { namedSabotageStatePath = null } = {}) {
    this.hub = hub;
    this.config = null;
    this.rcon = null;
    this.queue = [];
    this.running = false;
    this.lastFailure = 0;
    this.status = { state: 'off', message: 'マイクラ連携はオフです', sent: 0 };
    this.namedSabotage = new NamedSabotageEngine({ hub, statePath: namedSabotageStatePath });
    this.goalBarReady = false;
    this.goalAlert = new GoalAlertEngine({
      hub,
      queryDistance: (goal) => this.#client().goalDistance(goal),
      onAlert: (event) => this.#sendGoalAlert(event),
    });
    hub.on('event', (e) => this.onEvent(e));
  }

  setConfig(mc) {
    const prev = this.config;
    this.config = mc;
    this.namedSabotage.setConfig(mc.namedSabotage ?? { enabled: false });
    const changed = !prev || prev.host !== mc.host || prev.port !== mc.port || prev.password !== mc.password;
    if (changed || !mc.enabled) {
      this.rcon?.close();
      this.rcon = null;
    }
    this.goalAlert.setConfig({ ...mc, goalAlert: { ...(mc.goalAlert ?? {}), enabled: Boolean(mc.enabled && mc.goalAlert?.enabled) } });
    if (!mc.enabled) {
      this.goalBarReady = false;
      return this.#setStatus({ state: 'off', message: 'マイクラ連携はオフです' });
    }
    for (const item of this.namedSabotage.takeStale()) this.enqueue(namedSabotageCleanupCommands(item), {}, 'named-sabotage-cleanup');
    if (changed || this.status.state === 'off') this.check();
  }

  /** つながるか確かめる */
  async check() {
    if (!this.config?.enabled) return this.status;
    try {
      await this.#client().connect();
      this.#setStatus({ state: 'ok', message: `${this.config.host}:${this.config.port} に接続しました` });
    } catch (err) {
      this.lastFailure = Date.now();
      this.#setStatus({ state: 'error', message: err.message });
    }
    return this.status;
  }

  onEvent(e) {
    if (!this.config?.enabled) return;
    const profile = this.config.superstreamProfile;
    this.#triggerNamedSabotage(e);
    // 届いたギフトをそのままマイクラ側の演出に渡す（そのギフト ID に設定された演出が動く）
    if (this.config.forwardGifts && e.kind === 'gift' && /^\d+$/.test(String(e.gift.id))) {
      const times = Math.min(MAX_REPEAT, e.gift.count ?? 1);
      for (let i = 0; i < times; i++) this.enqueue(superstreamCommands({ superstreamGift: e.gift.id }, profile), {}, 'superstream');
    }
    let sabotage = false;
    for (const rule of this.config.rules ?? []) {
      if (!ruleMatches(rule, e)) continue;
      sabotage = true;
      const times = rule.perCount ? Math.min(MAX_REPEAT, e.gift?.count ?? e.count ?? 1) : 1;
      const vars = varsFor(e);
      const commands = [...rule.commands, ...superstreamCommands(rule, profile)];
      for (let i = 0; i < times; i++) this.enqueue(commands, vars, rule.name);
    }
    if (sabotage) this.goalAlert.recordSabotage(e);
  }

  /** ゴール到達時のWIN処理をランタイムから差し込む。 */
  setGoalReachedHandler(handler) {
    this.goalAlert.setGoalReachedHandler(handler);
  }

  goalAlertSnapshot() {
    return this.goalAlert.snapshot();
  }

  testGoalDistance(result) {
    return this.goalAlert.testDistance(result);
  }

  #sendGoalAlert(event) {
    const color = event.stage === 'final' ? 'yellow' : event.stage === 'warning' ? 'red' : 'blue';
    const text = JSON.stringify({ text: event.message });
    const commands = [];
    if (!this.goalBarReady) {
      commands.push('bossbar add tw:goal_alert {"text":"ゴール接近警報"}');
      this.goalBarReady = true;
    }
    commands.push(
      `bossbar set tw:goal_alert name ${text}`,
      `bossbar set tw:goal_alert color ${color}`,
      'bossbar set tw:goal_alert visible true',
    );
    this.enqueue(commands, {}, 'goal-alert');
  }

  /** 名前入り妨害は通常のルールと別の安全なコマンド集合へ送る。 */
  #triggerNamedSabotage(e) {
    const setting = this.config?.namedSabotage;
    if (!setting?.enabled || e.test || e.kind !== 'gift') return;
    const size = Number(e.totalDiamonds ?? 0) >= Number(setting.largeMinCoins ?? 1000) ? 'large' : 'medium';
    const item = this.namedSabotage.trigger({ ...e, size });
    if (!item) return;
    this.enqueue(item.commands, {}, 'named-sabotage');
    this.namedSabotage.markSent(item.eventId);
    const activeTimer = setTimeout(() => this.namedSabotage.markActive(item.eventId), 0);
    activeTimer.unref?.();
    const timer = setTimeout(() => {
      this.enqueue(namedSabotageCleanupCommands(item), {}, 'named-sabotage');
      this.namedSabotage.expire(item.eventId);
    }, Math.max(1, item.expiresAt - Date.now()));
    timer.unref?.();
  }

  testNamedSabotage(e) {
    return this.namedSabotage.testEvent(e);
  }

  /** ルーレットの当たりの項目に commands やマイクラの演出があれば送る */
  onRouletteResult(roulette, item, trigger) {
    if (!this.config?.enabled) return;
    const commands = [...(item.commands ?? []), ...superstreamCommands(item, this.config.superstreamProfile)];
    if (!commands.length) return;
    this.enqueue(commands, varsFor(trigger ?? {}, { item: safe(item.label, 40), roulette: safe(roulette.name || roulette.id, 40) }), 'roulette');
  }

  /** ボスを討伐したら、そのボスの設定の commands とマイクラの演出を送る（{user} はとどめを刺した人） */
  onBossDefeated(cfg, boss, by, trigger) {
    if (!this.config?.enabled) return;
    const ss = { superstreamGift: /^\d+$/.test(String(cfg.superstreamGift ?? '').trim()) ? String(cfg.superstreamGift).trim() : '', superstreamAction: String(cfg.superstreamAction ?? '').split(/[\r\n]/)[0].trim() };
    const commands = [...(cfg.commands ?? []), ...superstreamCommands(ss, this.config.superstreamProfile)];
    if (!commands.length) return;
    const e = trigger ?? (by?.user ? { user: by.user } : {});
    this.enqueue(commands, varsFor(e, { boss: safe(boss.name, 40), round: boss.round }), 'boss');
  }

  enqueue(commands, vars, source) {
    for (const c of commands) {
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

  async #queryGoalDistance(goal) {
    return this.#client().goalDistance(goal);
  }

  #client() {
    if (!this.rcon) this.rcon = new Rcon(this.config);
    return this.rcon;
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
        if (this.status.state !== 'ok') this.#setStatus({ state: 'ok', message: `${this.config.host}:${this.config.port} に接続しました` });
        this.status.sent += 1;
        this.#log({ command, ok: true, response, source });
      } catch (err) {
        this.lastFailure = Date.now();
        this.rcon?.close();
        this.#setStatus({ state: 'error', message: err.message });
        this.#log({ command, ok: false, response: err.message, source });
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    this.running = false;
  }

  #setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.hub.broadcast({ type: 'minecraft', status: this.status });
  }

  #log(entry) {
    const log = { ts: Date.now(), ...entry };
    if (log.source === 'named-sabotage') {
      delete log.command;
      delete log.response;
    }
    this.hub.broadcast({ type: 'minecraft', status: this.status, log });
    this.hub.emit('minecraft', log);
  }
}
