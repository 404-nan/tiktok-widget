#!/usr/bin/env node
// src/gift-names-ja.json から、ブラウザ用の対応表 public/widgets/lib/gift-names-ja.js を作る。
// 使い方: node scripts/build-gift-names.js
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync(new URL('../src/gift-names-ja.json', import.meta.url), 'utf8'));
const byId = {};
const byName = {};
for (const [id, pair] of Object.entries(raw.names ?? {})) {
  const en = String(pair?.[0] ?? '');
  const ja = String(pair?.[1] ?? '');
  if (!ja) continue;
  byId[String(id)] = ja;
  const key = en.trim().toLowerCase().replace(/\s+/g, '');
  if (key && byName[key] == null) byName[key] = ja;
}
const file = new URL('../public/widgets/lib/gift-names-ja.js', import.meta.url);
const body = `// scripts/build-gift-names.js が src/gift-names-ja.json から生成する。手で編集しない。\nexport default ${JSON.stringify({ byId, byName })};\n`;
fs.writeFileSync(file, body);
console.log(`byId ${Object.keys(byId).length} / byName ${Object.keys(byName).length}`);
