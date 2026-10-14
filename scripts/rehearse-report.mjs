// 取得結果と data コピーの前後差分から rehearsal-report.md を書く。
import fs from 'node:fs';

const [collectFile, beforeNew, afterNew, beforeOld, afterOld, report] = process.argv.slice(2);
const collect = JSON.parse(fs.readFileSync(collectFile, 'utf8'));

function loadSnap(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const i = line.indexOf(' ');
    map.set(line.slice(i + 1), line.slice(0, i));
  }
  return map;
}

function fileDiff(beforeFile, afterFile) {
  const before = loadSnap(beforeFile);
  const after = loadSnap(afterFile);
  const created = [];
  const changed = [];
  const removed = [];
  for (const [rel, sum] of after) {
    if (!before.has(rel)) created.push(rel);
    else if (before.get(rel) !== sum) changed.push(rel);
  }
  for (const rel of before.keys()) if (!after.has(rel)) removed.push(rel);
  return { created, changed, removed };
}

function list(title, items) {
  if (!items.length) return `- ${title}: なし`;
  return [`- ${title}:`, ...items.map((item) => `  - \`${item}\``)].join('\n');
}

function join(items) {
  return items.length ? items.join('、') : '（なし）';
}

const lines = [];
lines.push('# リハーサル');
lines.push('');
lines.push('release は 127.0.0.1:3941、旧版 d03dd38 は 127.0.0.1:3942。TW_HOSTED=1、TikTok へは接続していない。');
lines.push('');
lines.push('## 設定画面と all.html');
lines.push('');
lines.push('| テナント | 見ているもの | release (3941) | 旧版 (3942) |');
lines.push('| --- | --- | --- | --- |');

for (const row of collect.rows) {
  const a = row.side.release;
  const b = row.side.old;
  const cell = (status, extra) => `HTTP ${status}${extra ? ` ${extra}` : ''}`;
  const schema = (side) => side.schema.map((section) => `${section.title}(${section.id})`).join('、') || '（なし）';
  const only = (left, right) => left.filter((id) => !right.includes(id));
  const aIds = a.schema.map((section) => section.id);
  const bIds = b.schema.map((section) => section.id);
  const aFields = new Map(a.schema.map((section) => [section.id, section.fields]));
  const fieldDiff = [];
  for (const id of aIds.filter((name) => bIds.includes(name))) {
    const added = only(aFields.get(id), new Map(b.schema.map((section) => [section.id, section.fields])).get(id) ?? []);
    if (added.length) fieldDiff.push(`${id}: ${added.join(',')}`);
  }
  const saved = (side) => Object.keys(side.config ?? {}).sort().join('、') || '（なし）';
  const valueDiff = [];
  const flat = (config) => {
    const out = new Map();
    const walk = (value, prefix) => {
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        out.set(prefix, JSON.stringify(value));
        return;
      }
      const keys = Object.keys(value).sort();
      if (!keys.length) { out.set(prefix, '{}'); return; }
      for (const key of keys) walk(value[key], prefix ? `${prefix}.${key}` : key);
    };
    walk(config ?? {}, '');
    return out;
  };
  const fa = flat(a.config);
  const fb = flat(b.config);
  const keys = new Set([...fa.keys(), ...fb.keys()]);
  for (const key of [...keys].sort()) {
    if (fa.get(key) !== fb.get(key)) valueDiff.push(key || '（全体）');
  }
  const shown = valueDiff.slice(0, 12);
  const more = valueDiff.length > shown.length ? ` ほか${valueDiff.length - shown.length}件` : '';
  lines.push(`| ${row.name} | 設定画面 | ${cell(a.dashboardStatus, a.dashboardShell ? 'サイドバーあり' : '')} | ${cell(b.dashboardStatus, b.dashboardShell ? 'サイドバーあり' : '')} |`);
  lines.push(`| ${row.name} | 設定の項目 | ${schema(a)} | ${schema(b)} |`);
  lines.push(`| ${row.name} | release だけにある項目 | ${join(only(aIds, bIds))} | — |`);
  lines.push(`| ${row.name} | 増えたフィールド | ${join(fieldDiff)} | — |`);
  lines.push(`| ${row.name} | 保存設定のキー | ${saved(a)} | ${saved(b)} |`);
  lines.push(`| ${row.name} | 保存設定の差 | ${shown.length ? `${shown.join('、')}${more}` : 'なし'} | 同じパスで値が違うもの |`);
  lines.push(`| ${row.name} | all.html | ${cell(a.allStatus, a.allWidgets.join('、'))} | ${cell(b.allStatus, b.allWidgets.join('、'))} |`);
}

lines.push('');
lines.push('## data コピーで増えた・変わったファイル');
lines.push('');
lines.push('起動前（鍵ファイルを消したあと）と停止後の差。');
lines.push('');
lines.push('### release 用コピー');
lines.push('');
const rel = fileDiff(beforeNew, afterNew);
lines.push(list('新規', rel.created));
lines.push(list('変更', rel.changed));
lines.push(list('削除', rel.removed));
lines.push('');
lines.push('### 旧版用コピー');
lines.push('');
const old = fileDiff(beforeOld, afterOld);
lines.push(list('新規', old.created));
lines.push(list('変更', old.changed));
lines.push(list('削除', old.removed));
lines.push('');
lines.push('## Chromium 103');
lines.push('');
lines.push(`puppeteer ${collect.puppeteer}（Chromium 103）。対象は release の最初のテナント。`);
lines.push('');
lines.push('| 画面 | HTTP | コンソールエラー | スクショ |');
lines.push('| --- | --- | --- | --- |');
for (const shot of collect.chromium) {
  const detail = shot.errors.length ? shot.errors.map((err) => err.replace(/\|/g, '/').replace(/\n/g, ' ')).join('<br>') : '0';
  lines.push(`| ${shot.name} | ${shot.status} | ${shot.errors.length}件 ${shot.errors.length ? detail : ''} | ${shot.file} |`);
}
lines.push('');
fs.writeFileSync(report, `${lines.join('\n')}\n`);
