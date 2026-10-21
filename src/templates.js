// 配信テンプレートの JSON を読み、検証し、現在の設定との差分を作る。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cfg from './config.js';
import { SECTIONS } from './schema.js';
import { checkChanges } from './ai.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates');

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const getAt = (value, dotted) => dotted.split('.').reduce((current, key) => current?.[key], value);
const sectionOf = (change) => String(change.path).split('.')[0];

function setProjected(target, dotted, value, merge) {
  const keys = cfg.toPath(dotted);
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ?? (typeof key === 'number' ? [] : {});
  const last = keys.at(-1);
  if (merge && cursor[last] && typeof cursor[last] === 'object' && !Array.isArray(cursor[last]) && value && typeof value === 'object' && !Array.isArray(value)) cursor[last] = { ...cursor[last], ...value };
  else cursor[last] = structuredClone(value);
}

function validateTemplate(template, fileName) {
  if (!template || typeof template !== 'object') throw new Error(`${fileName}: オブジェクトではありません`);
  if (!/^[a-z0-9_-]+$/.test(template.id) || !template.name || !template.desc || template.desc.length > 40) throw new Error(`${fileName}: id・名前・ひとことが正しくありません`);
  if (!Array.isArray(template.widgets) || !template.widgets.every((section) => SECTIONS.includes(section))) throw new Error(`${fileName}: 使うウィジェットにない名前があります`);
  if (!Array.isArray(template.changes)) throw new Error(`${fileName}: changes が一覧ではありません`);
  if (template.changes.some((change) => sectionOf(change) === 'minecraft')) throw new Error(`${fileName}: minecraft は変更できません`);
  const checked = checkChanges(template.changes);
  if (checked.errors.length) throw new Error(`${fileName}: ${checked.errors.join(' / ')}`);
  const changedSections = [...new Set(checked.changes.map(sectionOf))].sort();
  if (!equal(changedSections, [...new Set(template.widgets)].sort())) throw new Error(`${fileName}: widgets と changes の section が一致しません`);
  return { ...template, changes: checked.changes };
}

export function loadTemplates() {
  const out = {};
  for (const fileName of fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    try {
      const template = validateTemplate(JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8')), fileName);
      if (out[template.id]) throw new Error(`${fileName}: id が重複しています`);
      out[template.id] = template;
    } catch (error) {
      console.warn(`[templates] ${error.message}`);
    }
  }
  return out;
}

export function templateList() {
  return Object.values(loadTemplates()).map(({ id, name, desc, flow, peaks, widgets }) => ({ id, name, desc, flow, peaks, widgets }));
}

export function previewTemplate(template, { config, widgets = [], tenant = false, entitled = () => true } = {}) {
  const rows = [];
  const projected = structuredClone(config ?? {});
  for (const section of template.widgets) {
    if (!entitled(section)) {
      rows.push({ kind: 'skip', section, label: templateLabel(section), reason: 'この配信では使えない設定です' });
      continue;
    }
    if (tenant && !widgets.includes(section)) rows.push({ kind: 'widget', section, label: templateLabel(section) });
    for (const change of template.changes.filter((item) => sectionOf(item) === section)) {
      const before = getAt(projected, change.path);
      const after = change.op === 'merge' && before && typeof before === 'object' && !Array.isArray(before)
        ? { ...before, ...change.value }
        : change.value;
      if (equal(before, after)) continue;
      rows.push({
        kind: before === undefined ? 'create' : 'change',
        section,
        label: change.label,
        before,
        after,
      });
      setProjected(projected, change.path, change.value, change.op === 'merge');
    }
  }
  for (const section of template.optionalWidgets ?? []) {
    if (!entitled(section)) rows.push({ kind: 'skip', section, label: templateLabel(section), reason: '管理者が許可していないため入れません' });
    else if (tenant && !widgets.includes(section)) rows.push({ kind: 'widget', section, label: templateLabel(section) });
  }
  return { id: template.id, name: template.name, rows, notes: template.notes ?? [], live: false, nothingToDo: !rows.some((row) => ['create', 'change', 'widget'].includes(row.kind)) };
}

const templateLabel = (section) => ({ alerts: 'ギフト通知', chats: 'コメント欄', wins: 'WIN数', winsFx: 'WIN数の全画面演出', cutins: 'カットイン', rush: 'RUSH', rankings: 'ランキング', roulettes: 'ルーレット', goals: '目標バー', timers: '延長タイマー' }[section] ?? section);

export function getTemplate(id) {
  const template = loadTemplates()[id];
  if (!template) return null;
  return template;
}

export { templateLabel };
