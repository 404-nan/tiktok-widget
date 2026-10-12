// 配信の設定のひな形（presets/*.yaml）。「妨害マイクラ（エンドラ討伐）」のような配信ごとの設定をまとめておき、
// config.yaml に切り替えて使う。切り替える前の config.yaml は data/backups/ に残す。
//
// ひな形の形:
//   name / summary / game / clear  … 配信ページに出す説明
//   goal                           … 目標の WIN 数の初めの値（配信ページで配信ごとに変えられる）
//   buttons                        … 配信ページに出す WIN のボタン（{label, action: win} か {label, value: 1}）
//   setup                          … 配信の前に Minecraft 側でやること
//   server                         … Minecraft サーバーをこのゲームに合わせる（世界・server.properties・コマンド。server-setup.js）
//   layout                         … まとめ表示（/widgets/stage.html）に並べるウィジェット（show: spin で回っている間だけ出す）
//   config                         … config.yaml に入れる設定。名前ごとのセクション（wins・roulettes など）は丸ごと入れ替え、
//                                    1つだけのセクション（rush・minecraft など）は書いた項目だけ入れ替える（RCON の接続設定は残る）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import * as cfg from './config.js';
import { SCHEMA } from './schema.js';
import { DEMO_GIFTS } from './demo.js';
import { checkServer } from './server-setup.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRESETS_DIR = path.join(root, 'presets');
const DATA_DIR = path.resolve(process.env.TW_DATA || path.join(root, 'data'));
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CURRENT_FILE = path.join(DATA_DIR, 'preset.json');
const KEEP_BACKUPS = 30;

const ID_RE = /^[A-Za-z0-9_-]+$/;
// まとめ表示に並べられるウィジェット（ページ名）
export const STAGE_WIDGETS = ['wins', 'wins-fx', 'roulette', 'rush', 'cutin', 'image-cutin', 'gift-alert', 'ranking', 'counter', 'goal', 'gift-jar'];

/** ひな形を1つ読む。壊れていたら error を付けて返す */
export function readPreset(id) {
  if (!ID_RE.test(String(id))) return null;
  const file = path.join(PRESETS_DIR, `${id}.yaml`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
    return { id, ...data, config: data.config ?? {}, buttons: data.buttons ?? [], setup: data.setup ?? [], layout: data.layout ?? [] };
  } catch (err) {
    return { id, name: id, error: `ひな形の YAML が読めません: ${err.message}`, config: {}, buttons: [], setup: [], layout: [] };
  }
}

/** ひな形の一覧（名前順） */
export function listPresets() {
  if (!fs.existsSync(PRESETS_DIR)) return [];
  return fs
    .readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => readPreset(f.replace(/\.yaml$/, '')))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** 今使っているひな形（切り替えたときに data/preset.json に残す） */
export function currentPreset() {
  try {
    return JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** ひな形の config を、今の config.yaml にどう入れるかの一覧（[パス, 値]） */
export function editsFor(preset, { goal } = {}) {
  const edits = [];
  for (const [section, value] of Object.entries(preset.config ?? {})) {
    const def = SCHEMA[section];
    if (!def) throw new Error(`${preset.id}: config.${section} は使われないセクションです`);
    if (def.kind === 'map') edits.push([[section], value]);
    else for (const [key, v] of Object.entries(value ?? {})) edits.push([[section, key], v]);
  }
  const g = goal ?? preset.goal;
  if (g != null && preset.config?.wins?.default) edits.push([['wins', 'default', 'goal'], Math.max(0, Math.round(Number(g) || 0))]);
  return edits;
}

function backup(text) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `config-${stamp}.yaml`);
  fs.writeFileSync(file, text);
  // 古いものから消して、KEEP_BACKUPS 個だけ残す
  const all = fs.readdirSync(BACKUP_DIR).filter((f) => /^config-.*\.yaml$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  return file;
}

/**
 * ひな形を config.yaml に入れる。エラーがあれば何も書き換えない。
 * goal: 目標の WIN 数（省くとひな形の goal）
 */
export function applyPreset(id, { goal } = {}) {
  const preset = readPreset(id);
  if (!preset) return { ok: false, errors: [`ひな形「${id}」がありません（presets/${id}.yaml）`], warnings: [] };
  if (preset.error) return { ok: false, errors: [preset.error], warnings: [] };
  let edits;
  try {
    edits = editsFor(preset, { goal });
  } catch (err) {
    return { ok: false, errors: [err.message], warnings: [] };
  }
  const before = cfg.readText();
  const { doc } = cfg.parseText(before);
  if (doc.errors.length) return { ok: false, errors: doc.errors.map((e) => `今の設定ファイルが壊れています: ${e.message}`), warnings: [] };
  for (const [keys, value] of edits) doc.setIn(keys, cfg.toNode(doc, value));
  const text = doc.toString({ flowCollectionPadding: false, lineWidth: 0 });
  // 先に検証してから、元の設定を残して書き込む
  const check = cfg.parseText(text);
  if (check.errors.length) return { ok: false, errors: check.errors, warnings: check.warnings };
  const backupFile = backup(before);
  const result = cfg.replaceText(text);
  if (result.ok) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CURRENT_FILE, JSON.stringify({ id, name: preset.name ?? id, appliedAt: Date.now() }, null, 2));
  }
  return { ...result, preset: id, backup: backupFile };
}

/** ひな形の中身が正しいか（config を検証し、ボタン・配置を確かめる）。テストと CLI 用 */
export function checkPreset(preset) {
  const errors = [];
  const warnings = [];
  if (preset.error) return { errors: [preset.error], warnings };
  if (!preset.name) warnings.push('name（表示名）がありません');
  const { errors: e, warnings: w } = cfg.normalize(preset.config);
  errors.push(...e.map((x) => `config.${x}`));
  warnings.push(...w.map((x) => `config.${x}`));
  preset.buttons.forEach((b, i) => {
    if (!b?.label) errors.push(`buttons[${i}]: label が必要です`);
    if (b?.action !== 'win' && !Number.isFinite(Number(b?.value))) errors.push(`buttons[${i}]: action: win か value（数）を書いてください`);
  });
  (preset.setup ?? []).forEach((t, i) => {
    if (typeof t !== 'string') errors.push(`setup[${i}]: 文で書いてください（「: 」を含むときは "..." で囲む）`);
  });
  preset.layout.forEach((l, i) => {
    if (!STAGE_WIDGETS.includes(l?.widget)) errors.push(`layout[${i}].widget: ${STAGE_WIDGETS.join(' / ')} のどれかにしてください`);
    for (const k of ['x', 'y', 'w', 'h']) if (!Number.isFinite(Number(l?.[k]))) errors.push(`layout[${i}].${k}: 数で書いてください`);
    if (l?.show != null && !['always', 'spin'].includes(l.show)) errors.push(`layout[${i}].show: always（いつも出す）か spin（ルーレットが回っている間だけ）にしてください`);
  });
  return { errors, warnings };
}

// デモの一覧にない高額ギフトのコイン数（早見表の並び用）
const KNOWN_COINS = { Universe: 34999 };
const EVENT_NAMES = { follow: 'フォロー', share: 'シェア', like: 'いいね' };

/**
 * 「ギフト → WIN の増減・Minecraft で起きること・ルーレット・RUSH」の早見表。
 * 並びはフォローなどのイベント → ギフトの安い順（コイン数が分からないギフトは後ろ）
 */
export function giftTable(preset) {
  const c = preset.config ?? {};
  const rows = new Map();
  const row = (name) => {
    const key = String(name);
    if (!rows.has(key)) rows.set(key, { gift: key, win: null, effects: [], roulette: null, rush: false });
    return rows.get(key);
  };
  for (const r of c.minecraft?.rules ?? []) {
    const names = r.gifts?.length ? r.gifts : (r.events ?? []).map((e) => EVENT_NAMES[e] ?? e);
    // 「Rose でゾンビ（送った人の名前つき）」→「ゾンビ（送った人の名前つき）」、後ろの（WIN …）は WIN の欄に出すので外す
    const label = String(r.name ?? '')
      .replace(/^.*?で/, '')
      .replace(/（WIN[^）]*）$/, '')
      .trim();
    for (const n of names) if (label) row(n).effects.push(label);
  }
  // WIN は上から順に最初に合ったルールだけ
  for (const r of c.wins?.default?.rules ?? []) {
    for (const n of r.gifts ?? []) {
      const x = row(n);
      if (x.win == null) x.win = r.reset === true || r.set === 0 ? 'reset' : r.set != null ? `=${r.set}` : r.add;
    }
  }
  for (const [id, ro] of Object.entries(c.roulettes ?? {})) for (const n of ro.gifts ?? []) row(n).roulette = ro.name || id;
  for (const n of c.rush?.gifts ?? []) row(n).rush = true;
  const coins = new Map([...DEMO_GIFTS.map((g) => [g.name, g.diamonds]), ...Object.entries(KNOWN_COINS)]);
  const rank = (r) => (Object.values(EVENT_NAMES).includes(r.gift) ? -1 : coins.get(r.gift) ?? Infinity);
  return [...rows.values()].map((r) => ({ ...r, coins: coins.get(r.gift) ?? null })).sort((a, b) => rank(a) - rank(b));
}

/** 配信ページ・API 用の形（config は省いて軽くし、早見表を付ける） */
export function summary(preset) {
  const { config, ...rest } = preset;
  return { ...rest, sections: Object.keys(config ?? {}), gifts: giftTable(preset) };
}
