// 設定ファイル（config.yaml）の読み書き。
// - 読むときは schema.js に沿って検証し、足りない値を初期値で埋める
// - 書くときは YAML のコメントや並びを残したまま、指定した場所だけ変える
// - 間違った値は書き込む前に弾き、どこが悪いかを返す（AI が直せるように）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { SCHEMA, SECTIONS, COLOR_TOKENS, defaultsFor } from './schema.js';

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
    for (const key of ['color', 'textColor']) {
      if (raw[key] == null) continue;
      if (isColor(raw[key])) item[key] = raw[key];
      else issues.errors.push(`${at}.${key}: 色は #RRGGBB か ${COLOR_TOKENS.join(' / ')} で書いてください`);
    }
    if (raw.image != null) item.image = String(raw.image);
    if (raw.commands != null) item.commands = checkCommands(raw.commands, `${at}.commands`, issues);
    checkSuperStream(raw, item, at, issues);
    if (raw.rush != null) item.rush = raw.rush === true || raw.rush === 'true';
    if (raw.wins != null) {
      const n = Number(raw.wins);
      if (Number.isInteger(n) && n !== 0) item.wins = n;
      else issues.errors.push(`${at}.wins: 0 以外の整数で書いてください（当たったら WIN をこの数だけ増減。例 -5 / 10）`);
    }
    if (raw.winsId != null) item.winsId = String(raw.winsId);
    const known = ['label', 'name', 'weight', 'color', 'textColor', 'image', 'commands', 'superstreamGift', 'superstreamAction', 'rush', 'wins', 'winsId'];
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

// SuperStream の演出の指定（ギフト ID か、演出の種類）
function checkSuperStream(raw, out, at, issues) {
  if (raw.superstreamGift != null) {
    const id = String(raw.superstreamGift).trim();
    if (/^\d+$/.test(id)) out.superstreamGift = id;
    else issues.errors.push(`${at}.superstreamGift: SuperStream のギフト ID（数字）で書いてください`);
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
    if (raw.everyLikes != null) {
      rule.everyLikes = checkValue({ type: 'number', default: 100, min: 1 }, raw.everyLikes, `${at}.everyLikes`, issues);
      if (rule.events && !rule.events.includes('like')) issues.warnings.push(`${at}.everyLikes: events に like がないので使われません`);
    }
    if (!rule.gifts && !rule.events && rule.minCoins == null && !rule.users) {
      issues.warnings.push(`${at}: 条件（gifts / events / minCoins / users）がないので、ギフトのたびに実行されます`);
    }
    for (const key of Object.keys(raw)) {
      if (!['commands', 'gifts', 'users', 'events', 'minCoins', 'perCount', 'name', 'superstreamGift', 'superstreamAction', 'everyLikes'].includes(key)) {
        issues.warnings.push(`${at}.${key}: 使われない項目です`);
      }
    }
    return rule;
  });
}

// WIN 数のギフトのルール（{ gifts: [Lion], add: -1 } / { gifts: [TikTok Universe], set: 0 }）
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
    if (!SCHEMA[key]) issues.warnings.push(`${key}: 使われないセクションです（使えるのは ${SECTIONS.join(', ')}）`);
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
    }
  }
  return { config, ...issues };
}

// --- ファイル ---

export function ensureConfigFile() {
  if (fs.existsSync(CONFIG_PATH)) return false;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
  return true;
}

export function readText() {
  ensureConfigFile();
  return fs.readFileSync(CONFIG_PATH, 'utf8');
}

/** YAML の文字列を読み、構文エラーも含めて検証結果を返す */
export function parseText(text) {
  const doc = YAML.parseDocument(text, { prettyErrors: true });
  if (doc.errors.length) {
    return { doc, config: null, errors: doc.errors.map((e) => `YAML の書き方: ${e.message}`), warnings: [] };
  }
  return { doc, ...normalize(doc.toJS()) };
}

export function load() {
  const text = readText();
  return { text, ...parseText(text) };
}

function writeText(text) {
  const tmp = `${CONFIG_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, CONFIG_PATH);
}

/** YAML 全体を置き換える。エラーがあれば書き込まない */
export function replaceText(text) {
  const result = parseText(text);
  if (result.errors.length) return { ok: false, errors: result.errors, warnings: result.warnings };
  writeText(text.endsWith('\n') ? text : `${text}\n`);
  return { ok: true, errors: [], warnings: result.warnings, config: result.config };
}

/** "roulettes.main.items.0.color" や ['roulettes', 'main'] を配列のパスにする */
export function toPath(p) {
  const parts = Array.isArray(p) ? p : String(p).split('.').filter((s) => s !== '');
  return parts.map((s) => (typeof s === 'string' && /^\d+$/.test(s) ? Number(s) : s));
}

// 書き戻すときに元の書き方をなるべく変えない
const TO_STRING = { flowCollectionPadding: false, lineWidth: 0 };

/** 値を YAML のノードにする。短い一覧や小さな項目は [a, b] / {label: x} の1行で書く */
export function toNode(doc, value) {
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

function edit(mutate) {
  const { doc } = parseText(readText());
  if (doc.errors.length) return { ok: false, errors: doc.errors.map((e) => `今の設定ファイルが壊れています: ${e.message}`), warnings: [] };
  mutate(doc);
  return replaceText(doc.toString(TO_STRING));
}

/** 指定した場所に値を入れる（コメントや並びは残る） */
export function setValue(p, value) {
  const keys = toPath(p);
  if (keys.length === 0) return { ok: false, errors: ['パスを指定してください'], warnings: [] };
  return edit((doc) => doc.setIn(keys, toNode(doc, value)));
}

/** オブジェクトの中身を混ぜる（指定しなかった項目はそのまま） */
export function mergeValue(p, value) {
  const keys = toPath(p);
  return edit((doc) => {
    if (!doc.hasIn(keys) || value == null || typeof value !== 'object' || Array.isArray(value)) {
      doc.setIn(keys, toNode(doc, value));
      return;
    }
    for (const [k, v] of Object.entries(value)) doc.setIn([...keys, k], toNode(doc, v));
  });
}

export function deleteValue(p) {
  const keys = toPath(p);
  return edit((doc) => doc.deleteIn(keys));
}

/** 設定ファイルの変更を見張る（他のツールやエディタで書き換えたときも反映する） */
export function watch(onChange) {
  let timer = null;
  let last = null;
  const check = () => {
    try {
      const text = fs.readFileSync(CONFIG_PATH, 'utf8');
      if (text === last) return;
      last = text;
      onChange(parseText(text));
    } catch {}
  };
  check();
  fs.watch(path.dirname(CONFIG_PATH), (_type, name) => {
    if (name && name !== path.basename(CONFIG_PATH)) return;
    clearTimeout(timer);
    timer = setTimeout(check, 120);
  });
}

// --- ウィジェットの URL と説明 ---

/** 設定にあるウィジェットごとの URL と推奨サイズ */
export function widgetList(config, base = 'http://127.0.0.1:3939') {
  const out = [];
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
    'セクションは theme（共通）と、ウィジェットごとの alerts / jars / goals / counters / roulettes。',
    'theme 以外は「名前: { 設定 }」で何個でも作れる。名前は英数字と - _ だけ。',
    '書かなかった項目は初期値になる。保存すると開いているウィジェットに自動で反映される。',
    'ギフト名は TikTok の英語名（Rose, Doughnut, Galaxy など）。list_gifts で配信中に届いたギフトを確認できる。',
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
