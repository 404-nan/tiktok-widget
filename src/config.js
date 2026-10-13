// 設定ファイル（config.yaml）の読み書き。
// - 読むときは schema.js に沿って検証し、足りない値を初期値で埋める
// - 書くときは YAML のコメントや並びを残したまま、指定した場所だけ変える
// - 間違った値は書き込む前に弾き、どこが悪いかを返す（AI が直せるように）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { SCHEMA, SECTIONS, COLOR_TOKENS, defaultsFor } from './schema.js';
import { checkActions } from './actions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.resolve(process.env.TW_CONFIG || path.join(root, 'config.yaml'));
export const EXAMPLE_PATH = path.join(root, 'config.example.yaml');
export const MEDIA_DIR = path.join(root, 'media');

// --- 検証と正規化 ---

const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const isColor = (v) => typeof v === 'string' && (COLOR_RE.test(v) || COLOR_TOKENS.includes(v));

function checkValue(field, value, where, issues) {
  const err = (msg) => issues.errors.push(`${where}: ${msg}`);
  switch (field.type) {
    case 'string':
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return String(value);
      return err('文字で書いてください'), field.default;
    case 'number': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return err('数値で書いてください'), field.default;
      if (field.min != null && n < field.min) return err(`${field.min} 以上にしてください`), field.min;
      if (field.max != null && n > field.max) return err(`${field.max} 以下にしてください`), field.max;
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1) return true;
      if (value === 'false' || value === 0) return false;
      return err('true か false で書いてください'), field.default;
    case 'enum':
      if (field.values.includes(value)) return value;
      return err(`${field.values.join(' / ')} のどれかにしてください（今: ${JSON.stringify(value)}）`), field.default;
    case 'color':
      if (isColor(value)) return value;
      return err(`色は #RRGGBB か ${COLOR_TOKENS.join(' / ')} で書いてください（今: ${JSON.stringify(value)}）`), field.default;
    case 'list': {
      const arr = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
      if (!arr) return err('一覧（[a, b]）で書いてください'), structuredClone(field.default);
      const out = arr.map((x) => String(x).trim()).filter(Boolean);
      if (field.values) {
        const bad = out.filter((x) => !field.values.includes(x));
        if (bad.length) err(`使えない値 ${bad.join(', ')}（使えるのは ${field.values.join(' / ')}）`);
        return out.filter((x) => field.values.includes(x));
      }
      return out;
    }
    case 'items':
      return checkItems(value, where, issues);
    case 'rules':
      return checkRules(value, where, issues);
    case 'mcRules':
      return checkMcRules(value, where, issues);
    case 'winRules':
      return checkWinRules(value, where, issues);
    case 'timerRules':
      return checkTimerRules(value, where, issues);
    case 'commands':
      // Minecraft のコマンドの一覧（ボス討伐のときに送るものなど）
      return checkCommands(value ?? [], where, issues);
    case 'mediaRules':
      return checkMediaRules(value, where, issues);
    case 'gachaTiers':
      return checkGachaTiers(value, where, issues);
    default:
      return value;
  }
}

function checkItems(value, where, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.errors.push(`${where}: 項目を1つ以上、一覧で書いてください`);
    return [{ label: '？', weight: 1 }];
  }
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    if (typeof raw === 'string' || typeof raw === 'number') {
      const m = String(raw).match(/^(.*?)\*(\d+(?:\.\d+)?)$/);
      return { label: (m ? m[1] : String(raw)).trim(), weight: m ? Number(m[2]) : 1 };
    }
    if (!raw || typeof raw !== 'object') {
      issues.errors.push(`${at}: 文字か { label: ... } で書いてください`);
      return { label: '？', weight: 1 };
    }
    const item = { label: String(raw.label ?? raw.name ?? '').trim(), weight: 1 };
    if (!item.label && !raw.image) issues.errors.push(`${at}: label か image のどちらかが必要です`);
    if (raw.weight != null) {
      const w = Number(raw.weight);
      if (!(w > 0)) issues.errors.push(`${at}.weight: 0 より大きい数にしてください`);
      else item.weight = w;
    }
    // 空欄は「書かなかった」と同じ（いつもの weight を使う）。0 は RUSH 中に出さない
    if (raw.rushWeight != null && raw.rushWeight !== '') {
      const w = Number(raw.rushWeight);
      if (!Number.isFinite(w) || w < 0) issues.errors.push(`${at}.rushWeight: 0 以上の数にしてください`);
      else item.rushWeight = w;
    }
    for (const key of ['color', 'textColor']) {
      if (raw[key] == null) continue;
      if (isColor(raw[key])) item[key] = raw[key];
      else issues.errors.push(`${at}.${key}: 色は #RRGGBB か ${COLOR_TOKENS.join(' / ')} で書いてください`);
    }
    if (raw.image != null) item.image = String(raw.image);
    if (raw.commands != null) item.commands = checkCommands(raw.commands, `${at}.commands`, issues);
    checkSuperStream(raw, item, at, issues);
    if (raw.rush != null) item.rush = raw.rush === true || raw.rush === 'true';
    if (raw.actions != null) {
      const actions = checkActions(raw.actions, `${at}.actions`, issues);
      if (actions.length) item.actions = actions;
    }
    const known = ['label', 'name', 'weight', 'rushWeight', 'color', 'textColor', 'image', 'commands', 'superstreamGift', 'superstreamAction', 'rush', 'actions'];
    for (const key of Object.keys(raw)) if (!known.includes(key)) issues.warnings.push(`${at}.${key}: 使われない項目です`);
    return item;
  });
}

const RULE_MATCH = ['gifts', 'users', 'minCoins'];
const RULE_SET = ['color', 'big', 'duration', 'sound', 'text'];
function checkRules(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.errors.push(`${where}: 一覧で書いてください`);
    return [];
  }
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    const rule = {};
    if (!raw || typeof raw !== 'object') {
      issues.errors.push(`${at}: { gifts: [...], color: ... } のように書いてください`);
      return rule;
    }
    for (const key of ['gifts', 'users']) {
      if (raw[key] != null) rule[key] = checkValue({ type: 'list', default: [] }, raw[key], `${at}.${key}`, issues);
    }
    if (raw.minCoins != null) rule.minCoins = checkValue({ type: 'number', default: 0, min: 0 }, raw.minCoins, `${at}.minCoins`, issues);
    if (raw.color != null) rule.color = checkValue({ type: 'color', default: 'accent' }, raw.color, `${at}.color`, issues);
    if (raw.big != null) rule.big = checkValue({ type: 'boolean', default: false }, raw.big, `${at}.big`, issues);
    if (raw.sound != null) rule.sound = checkValue({ type: 'boolean', default: true }, raw.sound, `${at}.sound`, issues);
    if (raw.duration != null) rule.duration = checkValue({ type: 'number', default: 4.5, min: 1, max: 30 }, raw.duration, `${at}.duration`, issues);
    if (raw.text != null) rule.text = String(raw.text);
    if (!RULE_MATCH.some((k) => k in rule)) issues.warnings.push(`${at}: 条件（gifts / users / minCoins）がないので全部に当てはまります`);
    for (const key of Object.keys(raw)) {
      if (![...RULE_MATCH, ...RULE_SET].includes(key)) issues.warnings.push(`${at}.${key}: 使われない項目です`);
    }
    return rule;
  });
}

function checkMediaRules(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.errors.push(`${where}: 一覧で書いてください`);
    return [];
  }
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    const rule = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.errors.push(`${at}: { mediaId, gifts / minCoins / events } で書いてください`);
      return rule;
    }
    if (raw.gifts != null) rule.gifts = checkValue({ type: 'list', default: [] }, raw.gifts, `${at}.gifts`, issues);
    if (raw.minCoins != null) rule.minCoins = checkValue({ type: 'number', default: 0, min: 0 }, raw.minCoins, `${at}.minCoins`, issues);
    if (raw.events != null) rule.events = checkValue({ type: 'list', default: [], values: ['follow'] }, raw.events, `${at}.events`, issues);
    const mediaId = String(raw.mediaId ?? '').trim();
    if (!mediaId) issues.errors.push(`${at}: mediaId が必要です`);
    else rule.mediaId = mediaId;
    if (!rule.gifts?.length && !(rule.minCoins > 0) && !rule.events?.length) {
      issues.warnings.push(`${at}: きっかけ（gifts / minCoins / events）がないので再生されません`);
    }
    const known = ['gifts', 'minCoins', 'events', 'mediaId'];
    for (const key of Object.keys(raw)) if (!known.includes(key)) issues.warnings.push(`${at}.${key}: 使われない項目です`);
    return rule;
  });
}

const TIER_ID = /^[A-Za-z0-9_-]+$/;
function checkGachaTiers(value, where, issues) {
  const fallback = structuredClone(SCHEMA.gacha.fields.tiers.default);
  if (value == null) return fallback;
  if (!Array.isArray(value) || value.length === 0) {
    issues.errors.push(`${where}: レアリティを1つ以上書いてください`);
    return fallback;
  }
  const ids = new Set();
  let pitySeen = false;
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.errors.push(`${at}: { id, label, weight } で書いてください`);
      return { id: `tier${i}`, label: '？', weight: 1, pity: false };
    }
    const id = String(raw.id ?? `tier${i}`).trim();
    if (!TIER_ID.test(id)) issues.errors.push(`${at}.id: 英数字と - _ だけにしてください`);
    if (ids.has(id)) issues.errors.push(`${at}.id: 同じ id が重なっています`);
    ids.add(id);
    const label = String(raw.label ?? id).trim() || id;
    const weight = Number(raw.weight ?? 1);
    if (!(weight > 0)) issues.errors.push(`${at}.weight: 0 より大きい数にしてください`);
    const wantPity = raw.pity === true || raw.pity === 'true';
    const pity = wantPity && !pitySeen;
    if (wantPity && pitySeen) issues.warnings.push(`${at}.pity: 天井の対象は1つだけ使います（先のものを使います）`);
    if (pity) pitySeen = true;
    const known = ['id', 'label', 'weight', 'pity'];
    for (const key of Object.keys(raw)) if (!known.includes(key)) issues.warnings.push(`${at}.${key}: 使われない項目です`);
    return { id: TIER_ID.test(id) ? id : `tier${i}`, label, weight: weight > 0 ? weight : 1, pity };
  });
}

function checkCommands(value, where, issues) {
  const arr = Array.isArray(value) ? value : [value];
  const out = [];
  for (const c of arr) {
    if (typeof c !== 'string' || !c.trim()) {
      issues.errors.push(`${where}: コマンドは文字で書いてください`);
      continue;
    }
    if (/[\r\n]/.test(c)) {
      issues.errors.push(`${where}: コマンドは1行ずつ書いてください`);
      continue;
    }
    out.push(c.trim().replace(/^\//, ''));
  }
  return out;
}

// マイクラの演出の指定（ギフト ID か、演出の種類）
function checkSuperStream(raw, out, at, issues) {
  if (raw.superstreamGift != null) {
    const id = String(raw.superstreamGift).trim();
    if (/^\d+$/.test(id)) out.superstreamGift = id;
    else issues.errors.push(`${at}.superstreamGift: マイクラの演出のギフト ID（数字）で書いてください`);
  }
  if (raw.superstreamAction != null) {
    const a = String(raw.superstreamAction).trim();
    if (a && !/[\r\n]/.test(a)) out.superstreamAction = a;
    else issues.errors.push(`${at}.superstreamAction: 演出の種類を1行で書いてください（例: lightning）`);
  }
}

const MC_EVENTS = ['gift', 'follow', 'share', 'like'];
function checkMcRules(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.errors.push(`${where}: 一覧で書いてください`);
    return [];
  }
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    if (!raw || typeof raw !== 'object') {
      issues.errors.push(`${at}: { gifts: [...], commands: [...] } のように書いてください`);
      return { commands: [] };
    }
    const rule = { commands: checkCommands(raw.commands ?? [], `${at}.commands`, issues) };
    checkSuperStream(raw, rule, at, issues);
    if (!rule.commands.length && !rule.superstreamGift && !rule.superstreamAction) {
      issues.errors.push(`${at}: commands / superstreamGift / superstreamAction のどれかを書いてください`);
    }
    if (raw.gifts != null) rule.gifts = checkValue({ type: 'list', default: [] }, raw.gifts, `${at}.gifts`, issues);
    if (raw.users != null) rule.users = checkValue({ type: 'list', default: [] }, raw.users, `${at}.users`, issues);
    if (raw.events != null) rule.events = checkValue({ type: 'list', default: [], values: MC_EVENTS }, raw.events, `${at}.events`, issues);
    if (raw.minCoins != null) rule.minCoins = checkValue({ type: 'number', default: 0, min: 0 }, raw.minCoins, `${at}.minCoins`, issues);
    if (raw.perCount != null) rule.perCount = checkValue({ type: 'boolean', default: false }, raw.perCount, `${at}.perCount`, issues);
    if (raw.name != null) rule.name = String(raw.name);
    if (!rule.gifts && !rule.events && rule.minCoins == null && !rule.users) {
      issues.warnings.push(`${at}: 条件（gifts / events / minCoins / users）がないので、ギフトのたびに実行されます`);
    }
    for (const key of Object.keys(raw)) {
      if (!['commands', 'gifts', 'users', 'events', 'minCoins', 'perCount', 'name', 'superstreamGift', 'superstreamAction'].includes(key)) {
        issues.warnings.push(`${at}.${key}: 使われない項目です`);
      }
    }
    return rule;
  });
}

// WIN 数のギフトのルール（{ gifts: [Lion], add: -1 } / { gifts: [Universe], set: 0 }）
function checkWinRules(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.errors.push(`${where}: 一覧で書いてください`);
    return [];
  }
  const known = ['gifts', 'users', 'minCoins', 'add', 'set', 'reset', 'perCount', 'text'];
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    const rule = {};
    if (!raw || typeof raw !== 'object') {
      issues.errors.push(`${at}: { gifts: [Lion], add: -1 } のように書いてください`);
      return rule;
    }
    for (const key of ['gifts', 'users']) {
      if (raw[key] != null) rule[key] = checkValue({ type: 'list', default: [] }, raw[key], `${at}.${key}`, issues);
    }
    if (raw.minCoins != null) rule.minCoins = checkValue({ type: 'number', default: 0, min: 0 }, raw.minCoins, `${at}.minCoins`, issues);
    for (const key of ['add', 'set']) {
      if (raw[key] == null) continue;
      const n = Number(raw[key]);
      if (Number.isInteger(n)) rule[key] = n;
      else issues.errors.push(`${at}.${key}: 整数で書いてください（今: ${JSON.stringify(raw[key])}）`);
    }
    // reset: true は set: 0 と同じ（0 にリセット）
    if (raw.reset === true || raw.reset === 'true') {
      if ('set' in rule && rule.set !== 0) issues.errors.push(`${at}: reset と set はどちらか1つにしてください`);
      rule.set = 0;
    }
    if ('add' in rule && 'set' in rule) issues.errors.push(`${at}: add と set（reset）はどちらか1つにしてください`);
    if (!('add' in rule) && !('set' in rule)) issues.errors.push(`${at}: add（足す数。-1 で減らす）か set（その数にする）か reset: true（0 に戻す）を書いてください`);
    if (rule.add === 0) issues.warnings.push(`${at}.add: 0 なので何も変わりません`);
    if (raw.perCount != null) rule.perCount = checkValue({ type: 'boolean', default: true }, raw.perCount, `${at}.perCount`, issues);
    if (raw.text != null) rule.text = String(raw.text);
    if (!rule.gifts && !rule.users && rule.minCoins == null) {
      issues.warnings.push(`${at}: 条件（gifts / minCoins / users）がないので、ギフトのたびに変わります`);
    }
    for (const key of Object.keys(raw)) if (!known.includes(key)) issues.warnings.push(`${at}.${key}: 使われない項目です`);
    return rule;
  });
}

// コメント欄: 項目どうしの組み合わせ（書いている途中でも保存できるよう、警告にとどめる）
function checkChat(c, where, issues) {
  if (!(c.gifterCoins <= c.bigGifterCoins && c.bigGifterCoins <= c.topGifterCoins)) {
    issues.warnings.push(
      `${where}: 目立たせる段階のコインは gifterCoins ≤ bigGifterCoins ≤ topGifterCoins の順にしてください（今: ${c.gifterCoins} / ${c.bigGifterCoins} / ${c.topGifterCoins}）`,
    );
  }
  // 「@名前」と書いても ID として扱う
  c.hideUsers = c.hideUsers.map((u) => u.replace(/^@/, ''));
}

// 延長タイマーのギフトのルール（{ gifts: [Galaxy], minutes: 10 } / { gifts: [Rose], seconds: 30 }）
function checkTimerRules(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.errors.push(`${where}: 一覧で書いてください`);
    return [];
  }
  const known = ['gifts', 'users', 'minCoins', 'seconds', 'minutes', 'perCount', 'text'];
  return value.map((raw, i) => {
    const at = `${where}[${i}]`;
    const rule = {};
    if (!raw || typeof raw !== 'object') {
      issues.errors.push(`${at}: { gifts: [Galaxy], minutes: 10 } のように書いてください`);
      return { seconds: 0 };
    }
    for (const key of ['gifts', 'users']) {
      if (raw[key] != null) rule[key] = checkValue({ type: 'list', default: [] }, raw[key], `${at}.${key}`, issues);
    }
    if (raw.minCoins != null) rule.minCoins = checkValue({ type: 'number', default: 0, min: 0 }, raw.minCoins, `${at}.minCoins`, issues);
    if (raw.seconds != null && raw.minutes != null) issues.errors.push(`${at}: seconds と minutes はどちらか1つにしてください`);
    const amount = raw.seconds ?? raw.minutes;
    rule.seconds = 0;
    if (amount == null) {
      issues.errors.push(`${at}: seconds（延ばす秒数）か minutes（延ばす分数）を書いてください`);
    } else if (!Number.isFinite(Number(amount))) {
      issues.errors.push(`${at}.${raw.seconds != null ? 'seconds' : 'minutes'}: 数で書いてください（今: ${JSON.stringify(amount)}）`);
    } else {
      rule.seconds = Math.round(Number(amount) * (raw.seconds != null ? 1 : 60));
      if (rule.seconds === 0) issues.warnings.push(`${at}: 0 なので延びません`);
    }
    if (raw.perCount != null) rule.perCount = checkValue({ type: 'boolean', default: true }, raw.perCount, `${at}.perCount`, issues);
    if (raw.text != null) rule.text = String(raw.text);
    if (!rule.gifts && !rule.users && rule.minCoins == null) {
      issues.warnings.push(`${at}: 条件（gifts / minCoins / users）がないので、ギフトのたびに使われます`);
    }
    for (const key of Object.keys(raw)) if (!known.includes(key)) issues.warnings.push(`${at}.${key}: 使われない項目です`);
    return rule;
  });
}

function checkFields(section, raw, where, issues) {
  const { fields } = SCHEMA[section];
  const out = defaultsFor(section);
  if (raw == null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    issues.errors.push(`${where}: 「項目: 値」の形で書いてください`);
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!fields[key]) {
      issues.warnings.push(`${where}.${key}: 使われない項目です（使えるのは ${Object.keys(fields).join(', ')}）`);
      continue;
    }
    if (value == null) continue;
    out[key] = checkValue(fields[key], value, `${where}.${key}`, issues);
  }
  return out;
}

const ID_RE = /^[A-Za-z0-9_-]+$/;

/** 生の設定を検証し、初期値で埋めた設定と、エラー・警告を返す */
export function normalize(raw) {
  const issues = { errors: [], warnings: [] };
  const config = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) issues.errors.push('設定の一番外側は「セクション名: ...」の形にしてください');

  for (const key of Object.keys(src)) {
    if (!SCHEMA[key] && key !== 'active') issues.warnings.push(`${key}: 使われないセクションです（使えるのは ${SECTIONS.join(', ')}）`);
  }
  for (const section of SECTIONS) {
    const def = SCHEMA[section];
    if (def.kind === 'object') {
      config[section] = checkFields(section, src[section], section, issues);
      continue;
    }
    config[section] = {};
    const entries = src[section] ?? {};
    if (typeof entries !== 'object' || Array.isArray(entries)) {
      issues.errors.push(`${section}: 「名前: { ... }」の形で書いてください`);
      continue;
    }
    for (const [id, entry] of Object.entries(entries)) {
      if (!ID_RE.test(id)) issues.errors.push(`${section}.${id}: 名前は英数字と - _ だけにしてください（URL に使うため）`);
      config[section][id] = checkFields(section, entry, `${section}.${id}`, issues);
      if (section === 'chats') checkChat(config[section][id], `${section}.${id}`, issues);
    }
  }
  // active は「種類を選ぶ」ための記録。書かれていないときは default、
  // default もなければそのウィジェットの最初の種類を使う。
  config.active = {};
  const active = src.active && typeof src.active === 'object' && !Array.isArray(src.active) ? src.active : {};
  for (const section of SECTIONS) {
    if (SCHEMA[section].kind !== 'map') continue;
    const names = Object.keys(config[section] ?? {});
    const requested = active[section];
    config.active[section] = names.includes(requested) ? requested : names.includes('default') ? 'default' : names[0] ?? 'default';
    if (requested != null && typeof requested !== 'string') issues.errors.push(`active.${section}: 種類の名前は文字で書いてください`);
  }
  return { config, ...issues };
}

// --- ファイル ---
// 設定ファイル1つ分の読み書き。ふだんは config.yaml、配信者ごとの設定は data/tenants/<id>/config.yaml

/** YAML の文字列を読み、構文エラーも含めて検証結果を返す */
export function parseText(text) {
  const doc = YAML.parseDocument(text, { prettyErrors: true });
  if (doc.errors.length) {
    return { doc, config: null, errors: doc.errors.map((e) => `YAML の書き方: ${e.message}`), warnings: [] };
  }
  return { doc, ...normalize(doc.toJS()) };
}

/** "roulettes.main.items.0.color" や ['roulettes', 'main'] を配列のパスにする */
export function toPath(p) {
  const parts = Array.isArray(p) ? p : String(p).split('.').filter((s) => s !== '');
  return parts.map((s) => (typeof s === 'string' && /^\d+$/.test(s) ? Number(s) : s));
}

// 書き戻すときに元の書き方をなるべく変えない
const TO_STRING = { flowCollectionPadding: false, lineWidth: 0 };

/** 値を YAML のノードにする。短い一覧や小さな項目は [a, b] / {label: x} の1行で書く */
function toNode(doc, value) {
  const node = doc.createNode(value);
  const style = (n) => {
    if (YAML.isSeq(n)) {
      if (n.items.length <= 8 && n.items.every((x) => YAML.isScalar(x))) n.flow = true;
      n.items.forEach(style);
    } else if (YAML.isMap(n)) {
      n.items.forEach((pair) => style(pair.value));
    }
  };
  style(node);
  // ルーレットの項目のような「一覧の中の小さなオブジェクト」は1行にする
  const inline = (n) => {
    if (YAML.isSeq(n)) {
      for (const item of n.items) {
        if (YAML.isMap(item) && item.items.length <= 4 && item.items.every((pair) => YAML.isScalar(pair.value))) item.flow = true;
        else inline(item);
      }
    } else if (YAML.isMap(n)) {
      n.items.forEach((pair) => inline(pair.value));
    }
  };
  inline(node);
  return node;
}

/**
 * YAML の文字に、いくつかの変更をまとめて当てた結果を返す（ファイルには書かない）。
 * changes: [{ op: 'set' | 'merge' | 'delete', path, value }]。コメントや並びは残る
 */
export function applyChanges(text, changes) {
  const { doc } = parseText(text);
  if (doc.errors.length) return { ok: false, errors: doc.errors.map((e) => `今の設定ファイルが壊れています: ${e.message}`), warnings: [] };
  for (const c of changes) {
    const keys = toPath(c.path);
    try {
      if (c.op === 'delete') doc.deleteIn(keys);
      else if (c.op === 'merge' && doc.hasIn(keys) && c.value != null && typeof c.value === 'object' && !Array.isArray(c.value)) {
        for (const [k, v] of Object.entries(c.value)) doc.setIn([...keys, k], toNode(doc, v));
      } else doc.setIn(keys, toNode(doc, c.value));
    } catch (err) {
      return { ok: false, errors: [`${keys.join('.')}: 変えられませんでした（${err.message}）`], warnings: [] };
    }
  }
  const out = doc.toString(TO_STRING);
  const result = parseText(out);
  return { ok: !result.errors.length, text: out, errors: result.errors, warnings: result.warnings, config: result.config };
}

/** 設定ファイル1つ分の読み書きと見張り */
export function createStore(file) {
  const ensure = () => {
    if (fs.existsSync(file)) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(EXAMPLE_PATH, file);
    return true;
  };
  const readText = () => {
    ensure();
    return fs.readFileSync(file, 'utf8');
  };
  const load = () => {
    const text = readText();
    return { text, ...parseText(text) };
  };
  const writeText = (text) => {
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  };
  /** YAML 全体を置き換える。エラーがあれば書き込まない */
  const replaceText = (text) => {
    const result = parseText(text);
    if (result.errors.length) return { ok: false, errors: result.errors, warnings: result.warnings };
    writeText(text.endsWith('\n') ? text : `${text}\n`);
    return { ok: true, errors: [], warnings: result.warnings, config: result.config };
  };
  const edit = (mutate) => {
    const { doc } = parseText(readText());
    if (doc.errors.length) return { ok: false, errors: doc.errors.map((e) => `今の設定ファイルが壊れています: ${e.message}`), warnings: [] };
    mutate(doc);
    return replaceText(doc.toString(TO_STRING));
  };
  /** 指定した場所に値を入れる（コメントや並びは残る） */
  const setValue = (p, value) => {
    const keys = toPath(p);
    if (keys.length === 0) return { ok: false, errors: ['パスを指定してください'], warnings: [] };
    return edit((doc) => doc.setIn(keys, toNode(doc, value)));
  };
  /** オブジェクトの中身を混ぜる（指定しなかった項目はそのまま） */
  const mergeValue = (p, value) => {
    const keys = toPath(p);
    return edit((doc) => {
      if (!doc.hasIn(keys) || value == null || typeof value !== 'object' || Array.isArray(value)) {
        doc.setIn(keys, toNode(doc, value));
        return;
      }
      for (const [k, v] of Object.entries(value)) doc.setIn([...keys, k], toNode(doc, v));
    });
  };
  const deleteValue = (p) => edit((doc) => doc.deleteIn(toPath(p)));
  /** 設定ファイルの変更を見張る（他のツールやエディタで書き換えたときも反映する）。止める関数を返す */
  const watch = (onChange) => {
    let timer = null;
    let last = null;
    const check = () => {
      try {
        const text = fs.readFileSync(file, 'utf8');
        if (text === last) return;
        last = text;
        onChange(parseText(text));
      } catch {}
    };
    check();
    const watcher = fs.watch(path.dirname(file), (_type, name) => {
      if (name && name !== path.basename(file)) return;
      clearTimeout(timer);
      timer = setTimeout(check, 120);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  };
  return { path: file, ensure, readText, load, replaceText, setValue, mergeValue, deleteValue, watch };
}

// ふだん（1人で使うとき）の設定ファイル。CLI・MCP・ローカルのダッシュボードが使う
export const localStore = createStore(CONFIG_PATH);
const local = localStore;
export const ensureConfigFile = local.ensure;
export const readText = local.readText;
export const load = local.load;
export const replaceText = local.replaceText;
export const setValue = local.setValue;
export const mergeValue = local.mergeValue;
export const deleteValue = local.deleteValue;
export const watch = local.watch;

/** ウィジェットに配ってよい設定（パスワードなど secret の項目を抜く） */
export function publicConfig(config) {
  if (!config) return config;
  const out = { ...config };
  for (const section of SECTIONS) {
    const def = SCHEMA[section];
    const secrets = Object.entries(def.fields ?? {}).filter(([, f]) => f.secret).map(([k]) => k);
    if (!secrets.length || !out[section]) continue;
    const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !secrets.includes(k)));
    out[section] = def.kind === 'map' ? Object.fromEntries(Object.entries(out[section]).map(([id, e]) => [id, strip(e)])) : strip(out[section]);
  }
  return out;
}

/** URL に種類の指定がないときに使う種類。存在しない active は安全にフォールバックする。 */
export function activeId(config, section, requested = null) {
  const entries = config?.[section] ?? {};
  const names = Object.keys(entries);
  if (requested != null) return requested;
  const chosen = config?.active?.[section];
  return names.includes(chosen) ? chosen : names.includes('default') ? 'default' : names[0] ?? 'default';
}

// --- ウィジェットの URL と説明 ---

/** 設定にあるウィジェットごとの URL と推奨サイズ */
export function widgetList(config, base = 'http://127.0.0.1:3939') {
  const out = [{ section: 'all', id: null, title: '全部まとめて', url: `${base}/widgets/all.html`, size: [1080, 1920] }];
  for (const section of SECTIONS) {
    const def = SCHEMA[section];
    if (def.kind !== 'map') {
      if (def.page && def.size) out.push({ section, id: null, title: def.title, url: `${base}/widgets/${def.page}.html`, size: def.size(config[section] ?? {}) });
      continue;
    }
    const entries = Object.entries(config[section] ?? {});
    if (section === 'roulettes') {
      if (entries.length) {
        const styles = [...new Set(entries.map(([, e]) => e.style))];
        const size = styles.includes('wheel') ? [600, 680] : [820, 330];
        out.push({ section, id: '*', title: 'ルーレット（全部）', url: `${base}/widgets/roulette.html`, size });
      }
      for (const [id, e] of entries) {
        out.push({ section, id, title: `ルーレット: ${e.name || id}`, url: `${base}/widgets/roulette.html?ids=${id}`, size: def.size(e) });
      }
      continue;
    }
    for (const [id, e] of entries) {
      const q = id === 'default' ? '' : `?id=${id}`;
      out.push({ section, id, title: `${def.title}: ${id}`, url: `${base}/widgets/${def.page}.html${q}`, size: def.size(e) });
      // 同じ設定で動く別のページ（WIN数の全画面演出など）
      for (const x of def.extraPages ?? []) {
        out.push({ section, id, extra: true, title: `${x.title}: ${id}`, url: `${base}/widgets/${x.page}.html${q}`, size: x.size(e) });
      }
    }
  }
  return out;
}

/** AI と人のための設定の説明（schema から作る Markdown） */
export function reference() {
  const lines = [
    '# 設定ファイル config.yaml の書き方',
    '',
    `場所: ${CONFIG_PATH}`,
    '',
    'セクションは theme（共通）と、ウィジェットごとの alerts / chats / jars / goals / counters / roulettes / wins / timers / bosses / mediaAlerts / gacha など。',
    'theme 以外は「名前: { 設定 }」で何個でも作れる。名前は英数字と - _ だけ。',
    '書かなかった項目は初期値になる。保存すると開いているウィジェットに自動で反映される。',
    'ギフト名は TikTok の英語名・日本語名・ID のどれでも書けます。画面には TikTok の日本語名を出します。list_gifts で確認できます。',
    '色は #RRGGBB か、テーマの色の名前 accent（朱）/ gold（金）/ ink（墨）/ ink-2（少し明るい墨）/ paper（白）。',
    '',
  ];
  for (const section of SECTIONS) {
    const def = SCHEMA[section];
    lines.push(`## ${section}（${def.title}）`, '', def.desc, '');
    lines.push('| 項目 | 型 | 初期値 | 説明 |', '| --- | --- | --- | --- |');
    for (const [key, f] of Object.entries(def.fields)) {
      const type = f.type === 'enum' ? f.values.join(' / ') : f.type === 'list' && f.values ? `list（${f.values.join(' / ')}）` : f.type;
      lines.push(`| ${key} | ${type} | ${JSON.stringify(f.default)} | ${f.desc ?? ''} |`);
    }
    lines.push('');
  }
  lines.push(
    '## 例: ギフトごとに別のルーレット',
    '',
    '```yaml',
    'roulettes:',
    '  punishment:',
    '    name: 罰ゲーム',
    '    gifts: [Rose]',
    '    items:',
    '      - 歌う*2',
    '      - {label: 変顔, color: "#3FA9F5"}',
    '      - {label: 激辛, image: media/chili.png}',
    '  reward:',
    '    name: ご褒美',
    '    style: strip',
    '    gifts: [Doughnut, Corgi]',
    '    items: [スタンプ, 名前を呼ぶ*3, リクエスト曲]',
    '```',
    '',
  );
  return lines.join('\n');
}
