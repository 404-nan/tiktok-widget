// ライコネの製品名を、配信者向けの画面と説明でそろえているか確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldProductName = 'TikTok LIVE ' + 'ウィジェット';
const romanBrand = /raikone/i;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function allFiles(directory, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) allFiles(fullPath, results);
    else results.push(fullPath);
  }
  return results;
}

test('配信者向けの表示と説明はライコネになっている', () => {
  const targetFiles = [
    'public/dashboard/index.html',
    'public/dashboard/editor.js',
    'public/help/index.html',
    'public/admin/index.html',
    'server.js',
    'README.md',
    'config.example.yaml',
    'docs/knowledge/decisions.md',
  ];
  const text = targetFiles.map(read).join('\n');

  assert.match(text, /ライコネ/);
  assert.doesNotMatch(text, new RegExp(oldProductName));
  assert.match(read('public/dashboard/index.html'), /<title>ライコネ<\/title>/);
  assert.match(read('public/dashboard/index.html'), /class="brand-title">ライコネ<\/div>/);
  assert.match(read('public/dashboard/editor.js'), /\$\{me\.name\} のライコネ/);
  assert.match(read('public/help/index.html'), /<title>使い方 — ライコネ<\/title>/);
  assert.match(read('public/admin/index.html'), /<title>管理画面 · ライコネ<\/title>/);
  assert.match(read('server.js'), /console\.log\(`\\n  ライコネ`\)/);
  assert.match(read('config.example.yaml'), /^# ライコネの設定/m);
  assert.match(read('docs/knowledge/decisions.md'), /画面と説明の製品名は「ライコネ」/);
});

test('ローマ字ブランド名を追加せず、内部名はtiktok-widgetのままにする', () => {
  const files = allFiles(root).filter((file) => {
    const relativePath = path.relative(root, file).replaceAll('\\', '/');
    return !relativePath.startsWith('docs/cards/') && relativePath !== 'test/brand.test.js';
  });
  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), romanBrand, `${path.relative(root, file)} にローマ字名があります`);
  }

  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.name, 'tiktok-widget');
  assert.match(read('mcp/server.js'), /tiktok-widget/);
  assert.match(read('package.json'), /tiktok-widget\.git/);
});
