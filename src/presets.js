// プリセット基盤。「出来事 → 動作」の対応を、名前付きの束（プリセット）として保存し、
// 配信中に切り替えるための横断の層。動作そのものは既存の actions（runActions）を使う。
// 機能ごとの対応づけ（ルーレットの当たり動作など）には触らない。
// 壊れた規則は、その規則だけを無効化して記録し、全体は止めない。
import { defaultsFor } from './schema.js';
import { parseAction } from './actions.js';
import { eventCoinTotal, giftMatches } from './gifts.js';
import { recordError } from './error-log.js';

export const TRIGGER_KINDS = ['gift', 'chat', 'like', 'follow', 'share', 'member'];
const ID_RE = /^[A-Za-z0-9_-]+$/;
const isDemo = (event) => event?.test === true || String(event?.user?.id ?? '').startsWith('demo_');

/**
 * 規則1件を検証して正規化する。壊れていれば rule は null で、理由が errors に入る。
 * 規則の形：{ on, gift?, keyword?, minCoins?, every?, cooldownSec?, actions: [...] }
 */
export function parsePresetRule(raw, where = '規則') {
  const errors = [];
  const err = (msg) => errors.push(`${where}: ${msg}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    err('規則は { on: ..., actions: [...] } で書いてください');
    return { rule: null, errors };
  }
  const on = String(raw.on ?? '');
  if (!TRIGGER_KINDS.includes(on)) err(`on は ${TRIGGER_KINDS.join(' / ')} のどれかです`);
  const rule = { on, cooldownSec: 0, actions: [] };
  if (raw.gift != null && String(raw.gift).trim()) rule.gift = String(raw.gift).trim();
  if (raw.keyword != null && String(raw.keyword).trim()) rule.keyword = String(raw.keyword).trim();
  if (raw.minCoins != null && raw.minCoins !== '') {
    const n = Number(raw.minCoins);
    if (!Number.isFinite(n) || n < 0) err('minCoins は 0 以上の数で書いてください');
    else rule.minCoins = n;
  }
  if (raw.every != null && raw.every !== '') {
    const n = Number(raw.every);
    if (!Number.isInteger(n) || n < 1) err('every は 1 以上の整数で書いてください（いいね何件ごと）');
    else rule.every = n;
  }
  if (raw.cooldownSec != null && raw.cooldownSec !== '') {
    const n = Number(raw.cooldownSec);
    if (!Number.isFinite(n) || n < 0) err('cooldownSec は 0 以上の数で書いてください（間引きの秒数）');
    else rule.cooldownSec = n;
  }
  if (!Array.isArray(raw.actions) || !raw.actions.length) {
    err('actions に動作を1つ以上書いてください');
  } else {
    const issues = { errors: [], warnings: [] };
    rule.actions = raw.actions.map((action, i) => parseAction(action, `${where}.actions[${i}]`, issues)).filter(Boolean);
    errors.push(...issues.errors);
    if (!rule.actions.length && !issues.errors.length) err('actions に正しい動作がありません');
  }
  const known = ['on', 'gift', 'keyword', 'minCoins', 'every', 'cooldownSec', 'actions'];
  const warnings = Object.keys(raw).filter((key) => !known.includes(key)).map((key) => `${where}.${key}: 使われない項目です`);
  return { rule: errors.length ? null : rule, errors, warnings };
}

/** 設定の検証用（config.js から使う）。壊れた規則は警告に記録して落とす＝規則単位の無効化。 */
export function checkPresetRules(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.warnings.push(`${where}: 規則の一覧で書いてください（この項目は無効化しました）`);
    return [];
  }
  const out = [];
  value.forEach((raw, i) => {
    const { rule, errors, warnings } = parsePresetRule(raw, `${where}[${i}]`);
    issues.warnings.push(...(warnings ?? []));
    if (rule) out.push(rule);
    else issues.warnings.push(...errors.map((e) => `${e}（この規則は無効化しました）`));
  });
  return out;
}

/** 設定の検証用（config.js から使う）。プリセットの一覧 { id, name, rules }。 */
export function checkPresets(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.warnings.push(`${where}: プリセットの一覧で書いてください（この項目は無効化しました）`);
    return [];
  }
  const out = [];
  const seen = new Set();
  value.forEach((raw, i) => {
    const at = `${where}[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.warnings.push(`${at}: { id, name, rules } で書いてください（このプリセットは無効化しました）`);
      return;
    }
    const id = String(raw.id ?? '').trim();
    if (!ID_RE.test(id)) {
      issues.warnings.push(`${at}.id: id は英数字と - _ だけにしてください（このプリセットは無効化しました）`);
      return;
    }
    if (seen.has(id)) {
      issues.warnings.push(`${at}.id: id が重なっています: ${id}（このプリセットは無効化しました）`);
      return;
    }
    seen.add(id);
    out.push({ id, name: String(raw.name ?? id), rules: checkPresetRules(raw.rules, `${at}.rules`, issues) });
  });
  return out;
}

export class Presets {
  /**
   * run: (actions, meta) => results。runtime では runActions へ actionDeps を束ねて渡す。
   */
  constructor(hub, { run = null, now = Date.now } = {}) {
    this.hub = hub;
    this.run = run;
    this.now = now;
    this.config = defaultsFor('presets');
    this.base = []; // 常時有効の基本規則（包み）
    this.presets = new Map(); // id -> { id, name, rules: [包み] }
    this.active = '';
    this.disabled = []; // { where, errors } 壊れていて無効化した規則の記録
    this.likeTotal = 0;
    this.lastError = null;
    this.onEvent = (event) => this.handleEvent(event);
    hub.on?.('event', this.onEvent);
  }

  #wrap(rule) {
    return { rule, lastFiredAt: 0, likeMark: 0 };
  }

  #buildRules(rawRules, where) {
    const out = [];
    (Array.isArray(rawRules) ? rawRules : []).forEach((raw, i) => {
      // 設定の検証を通った規則は parse 済みの形だが、直接渡された場合に備えて毎回確かめる
      const { rule, errors } = parsePresetRule(raw, `${where}[${i}]`);
      if (rule) out.push(this.#wrap(rule));
      else this.disabled.push({ where: `${where}[${i}]`, errors });
    });
    return out;
  }

  setConfig(cfg) {
    this.config = { ...defaultsFor('presets'), ...(cfg ?? {}) };
    this.disabled = [];
    this.base = this.#buildRules(this.config.base, 'presets.base');
    this.presets = new Map();
    for (const preset of Array.isArray(this.config.list) ? this.config.list : []) {
      const id = String(preset?.id ?? '').trim();
      if (!ID_RE.test(id) || this.presets.has(id)) {
        this.disabled.push({ where: `presets.list:${id || '(idなし)'}`, errors: ['id が不正か重なっています'] });
        continue;
      }
      this.presets.set(id, { id, name: String(preset?.name ?? id), rules: this.#buildRules(preset?.rules, `presets.list.${id}`) });
    }
    const wanted = String(this.config.active ?? '').trim();
    this.active = wanted && this.presets.has(wanted) ? wanted : '';
    this.likeTotal = 0;
  }

  enabled() {
    return this.config.enabled !== false;
  }

  activeId() {
    return this.active;
  }

  /** 配信中の切り替え。有効なプリセットは1つだけ。空文字で「基本規則だけ」に戻す。 */
  switchTo(id) {
    const next = String(id ?? '').trim();
    if (next && !this.presets.has(next)) return { ok: false, error: `プリセットがありません: ${next}` };
    this.active = next;
    this.hub?.broadcast?.({ type: 'presets', active: this.active });
    return { ok: true, active: this.active };
  }

  snapshot() {
    return {
      enabled: this.enabled(),
      active: this.active,
      base: this.base.length,
      presets: [...this.presets.values()].map((preset) => ({ id: preset.id, name: preset.name, rules: preset.rules.length })),
      disabled: this.disabled,
      switchCommand: String(this.config.switchCommand ?? '').trim() || null,
      lastError: this.lastError,
    };
  }

  handleEvent(event) {
    if (!this.enabled() || !event || isDemo(event)) return null;
    if (event.kind === 'chat' && this.#switchCommand(event)) return null;
    if (event.kind === 'like') this.likeTotal += Math.max(0, Number(event.count) || 0);
    const now = this.now();
    const results = [];
    const fire = (wrapped, presetId) => {
      // 間引き中は見送る（いいね到達の区切りも消費しない）
      const cooldownMs = Math.max(0, Number(wrapped.rule.cooldownSec) || 0) * 1000;
      if (cooldownMs > 0 && wrapped.lastFiredAt && now - wrapped.lastFiredAt < cooldownMs) return;
      if (!this.#matches(wrapped, event)) return;
      wrapped.lastFiredAt = now;
      if (!this.run) return;
      try {
        const out = this.run(wrapped.rule.actions, {
          source: 'preset',
          preset: presetId,
          on: wrapped.rule.on,
          user: event.user ? { id: event.user.id, name: event.user.name } : null,
        });
        results.push(...(Array.isArray(out) ? out : []));
      } catch (error) {
        // 動作の実行で全体を止めない。失敗は記録だけ残す
        this.lastError = { at: now, error: error?.message ?? String(error) };
        console.warn(`[presets] 動作の実行に失敗しました: ${this.lastError.error}`);
        recordError(error, { kind: 'engine.presets', level: 'warn', context: { op: 'presets.fire' } });
      }
    };
    for (const wrapped of this.base) fire(wrapped, '');
    const active = this.active ? this.presets.get(this.active) : null;
    if (active) for (const wrapped of active.rules) fire(wrapped, active.id);
    return results;
  }

  #switchCommand(event) {
    const command = String(this.config.switchCommand ?? '').trim();
    if (!command) return false;
    const text = String(event.text ?? '').trim();
    if (!text.startsWith(`${command} `)) return false;
    const id = text.slice(command.length).trim();
    this.switchTo(id);
    return true;
  }

  #matches(wrapped, event) {
    const rule = wrapped.rule;
    if (rule.on !== event.kind) return false;
    switch (rule.on) {
      case 'gift': {
        if (rule.gift && !giftMatches(event.gift, [rule.gift])) return false;
        if (rule.minCoins != null && eventCoinTotal(event) < rule.minCoins) return false;
        return true;
      }
      case 'chat':
        return !rule.keyword || String(event.text ?? '').includes(rule.keyword);
      case 'like': {
        if (!rule.every) return true;
        // 到達：累計が every の倍数を越えたら1回だけ発火する
        const crossed = Math.floor(this.likeTotal / rule.every);
        if (crossed <= wrapped.likeMark) return false;
        wrapped.likeMark = crossed;
        return true;
      }
      default:
        return true; // follow / share / member は種類が合えば発火
    }
  }

  close() {
    this.hub?.off?.('event', this.onEvent);
  }
}
