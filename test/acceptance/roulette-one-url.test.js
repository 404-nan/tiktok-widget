import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalize, widgetList } from '../../src/config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://127.0.0.1:3939';
const TENANT_BASE = `${BASE}/t/${'o'.repeat(24)}`;

const items = ['a', 'b'];
const configOf = (roulettes) => normalize({ roulettes }).config;
const rouletteRows = (config, base = BASE) => widgetList(config, base).filter((w) => w.section === 'roulettes');

const wheel = (name) => ({ name, style: 'wheel', items });
const strip = (name) => ({ name, style: 'strip', items });

test('AC-1 ルーレットが複数あっても URL の一覧は「ルーレット(全部)」の1件だけで ids を付けない', () => {
  const rows = rouletteRows(configOf({ one: wheel('一'), two: wheel('二'), three: strip('三') }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'ルーレット（全部）');
  assert.equal(rows[0].url, `${BASE}/widgets/roulette.html`);
  assert.ok(!rows[0].url.includes('ids'));
});

test('AC-1 ルーレットが1個でも1件だけ', () => {
  const rows = rouletteRows(configOf({ solo: wheel('ひとり') }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, `${BASE}/widgets/roulette.html`);
});

test('AC-1 テナントの URL は /t/<OBS の鍵>/widgets/roulette.html', () => {
  const rows = rouletteRows(configOf({ one: wheel('一'), two: strip('二') }), TENANT_BASE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, `${TENANT_BASE}/widgets/roulette.html`);
});

test('AC-1 CLI の urls もルーレットは1件だけ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-one-url-'));
  try {
    const configPath = path.join(dir, 'config.yaml');
    fs.writeFileSync(configPath, [
      'roulettes:',
      '  one: {name: 一, items: [a, b]}',
      '  two: {name: 二, items: [a, b]}',
      '',
    ].join('\n'));
    const env = { ...process.env, TW_CONFIG: configPath, TW_DATA: path.join(dir, 'data') };
    for (const k of ['TW_HOSTED', 'TW_SERVER', 'TW_AI_TOKEN', 'TW_AI_TENANT']) delete env[k];
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'bin', 'tw.js'), 'urls'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout.match(/roulette\.html/g) ?? []).length, 1, r.stdout);
    assert.ok(!r.stdout.includes('ids='), r.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-2 丸型だけなら 600×680', () => {
  assert.deepEqual(rouletteRows(configOf({ a: wheel('a'), b: wheel('b') }))[0].size, [600, 680]);
});

test('AC-2 横型だけなら 820×330', () => {
  assert.deepEqual(rouletteRows(configOf({ a: strip('a'), b: strip('b') }))[0].size, [820, 330]);
});

test('AC-2 丸型と横型の両方なら 820×680', () => {
  assert.deepEqual(rouletteRows(configOf({ a: wheel('a'), b: strip('b') }))[0].size, [820, 680]);
});

test('AC-3 ルーレットごとの ?ids= の URL は、ダッシュボードの「ほかの項目」の中の「1つだけ出したいとき」に残る', () => {
  const editor = fs.readFileSync(path.join(repoRoot, 'public/dashboard/editor.js'), 'utf8');
  assert.ok(editor.includes('1つだけ出したいとき'));
  assert.ok(editor.includes('ids='));
  assert.ok(editor.includes('ほかの項目'));
});

test('AC-4 ダッシュボードに1行の説明を出す', () => {
  const text = ['editor.js', 'simple.js', 'index.html']
    .map((f) => fs.readFileSync(path.join(repoRoot, 'public/dashboard', f), 'utf8'))
    .join('\n');
  assert.ok(text.includes('ルーレットが何個あっても、入れるのはこの1本です。ギフトが来たルーレットが順番に出ます'));
});

test('AC-5 all.html の URL と大きさは変わらない', () => {
  const all = widgetList(configOf({ a: wheel('a') }), BASE).find((w) => w.section === 'all');
  assert.equal(all.url, `${BASE}/widgets/all.html`);
  assert.deepEqual(all.size, [1080, 1920]);
});
