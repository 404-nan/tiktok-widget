// 公開ウィジェットとダッシュボードの JavaScript が、TikTok LIVE Studio(Chromium 103 相当)で動く書き方かを確かめる。
// 書き方は ES2022 まで(Chromium 103 は ES2022 の構文を動かせる)。Chromium 104 より新しい関数は使わない。外部 CDN は読まない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['public/widgets', 'public/dashboard'];

// Chromium 103 には無い関数(数字は使えるようになった版)。見つけたら使わない
const TOO_NEW = [
  [/\.toSorted\(/, 'toSorted (110)'], [/\.toReversed\(/, 'toReversed (110)'], [/\.toSpliced\(/, 'toSpliced (110)'],
  [/\.with\(\s*-?\d+\s*,/, 'Array.with (110)'], [/\b(?:Object|Map)\.groupBy\(/, 'groupBy (117)'],
  [/\bArray\.fromAsync\(/, 'Array.fromAsync (121)'], [/\bPromise\.withResolvers\(/, 'Promise.withResolvers (119)'],
  [/\.isWellFormed\(/, 'isWellFormed (111)'], [/\.(?:union|intersection|difference|symmetricDifference)\(new Set/, 'Set の集合の関数 (122)'],
];

function loadAcorn() {
  const require = createRequire(import.meta.url);
  try { return require('acorn'); } catch {}
  for (const pkg of ['/home/lul/lulos/frontend/node_modules/acorn/package.json', '/home/lul/.hermes/hermes-agent/node_modules/acorn/package.json']) {
    if (!fs.existsSync(pkg)) continue;
    try { return createRequire(pkg)('acorn'); } catch {}
  }
  return null;
}

// { file, code, module } を、.js と .html の中の <script> から集める
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const rel = path.join(dir, name);
      const full = path.join(root, rel);
      if (fs.statSync(full).isDirectory()) { walk(rel); continue; }
      const text = fs.readFileSync(full, 'utf8');
      if (name.endsWith('.js')) out.push({ file: rel, code: text, module: /^\s*(?:import|export)\s/m.test(text) });
      if (name.endsWith('.html')) {
        for (const m of text.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
          if (/\ssrc=/.test(m[1] ?? '') || !m[2].trim()) continue;
          out.push({ file: rel + ' の <script>', code: m[2], module: /type=["']module["']/.test(m[1] ?? '') });
        }
      }
    }
  };
  dirs.forEach(walk);
  return out;
}

test('公開の JavaScript は ES2022 までの書き方で読める', () => {
  const acorn = loadAcorn();
  const list = sources();
  assert.ok(list.length > 30, '公開の JavaScript が見つからない');
  for (const { file, code, module } of list) {
    if (acorn) assert.doesNotThrow(() => acorn.parse(code, { ecmaVersion: 2022, sourceType: module ? 'module' : 'script', allowHashBang: false }), file);
    else if (!module) assert.doesNotThrow(() => new vm.Script(code), file);
  }
});

test('Chromium 103 に無い関数と、外部 CDN を使わない', () => {
  for (const { file, code } of sources()) {
    for (const [re, name] of TOO_NEW) assert.doesNotMatch(code, re, `${file}: ${name} は Chromium 103 で動かない`);
    assert.doesNotMatch(code, /(?:src|href|import\s*\(?)\s*=?\s*["']https?:\/\/(?:cdn|unpkg|cdnjs|jsdelivr)/, `${file}: 外部 CDN を読んでいる`);
  }
});
