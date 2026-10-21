import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readWidget = (name) => fs.readFileSync(path.join(root, 'public/widgets', name), 'utf8');

test('AC-1: ステップアップと群の画面ファイルがある', () => {
  for (const file of ['stepup.html', 'stepup.js', 'swarm.html', 'swarm.js']) {
    assert.equal(fs.existsSync(path.join(root, 'public/widgets', file)), true, file);
  }
});

test('AC-2: ステップアップ画面がサーバーのイベントとプレビューを扱う', () => {
  const html = readWidget('stepup.html');
  const script = readWidget('stepup.js');
  const source = html + script;

  assert.match(source, /\/ws/);
  assert.match(source, /\/api\/stepup/);
  for (const kind of ['up', 'final', 'end', 'preview']) assert.match(source, new RegExp("['\\\"]" + kind + "['\\\"]"));
  assert.match(source, /preview=1/);
  assert.match(source, /STEP/);
  assert.match(source, /虹確定/);
});

test('AC-2: 群の画面がサーバーのイベントとプレビューを扱う', () => {
  const html = readWidget('swarm.html');
  const script = readWidget('swarm.js');
  const source = html + script;

  assert.match(source, /\/ws/);
  assert.match(source, /\/api\/swarm/);
  assert.match(source, /['\"]swarm['\"]/);
  assert.match(source, /preview=1/);
  assert.match(source, /群/);
});

test('AC-2: 画面は日本語の見出しを持ち、外部 CDN を参照しない', () => {
  const source = ['stepup.html', 'stepup.js', 'swarm.html', 'swarm.js'].map(readWidget).join('\n');
  assert.match(source, /lang=["']ja["']/);
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /(?:unpkg|jsdelivr|cdnjs|fonts\.googleapis|fonts\.gstatic)/i);
});
