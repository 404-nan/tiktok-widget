// 出す前の関門（2026-11-21〜22 の事故の再発防止）。
// A: 設定の届き方（object 型の節を map 型専用の setupWidget で読むと、設定が初期値のまま動く）
// B: お知らせの形（種別が無い告知は表示で黙って落ちる）
// C: 外部読み込み（許可リストに無い宛先は全部止める。正規表現の対象漏れで Google Fonts が通った事故）
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SCHEMA } from '../src/schema.js';

const WIDGETS_DIR = new URL('../public/widgets/', import.meta.url).pathname;

function widgetFiles(dir = WIDGETS_DIR, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) out.push(...widgetFiles(join(dir, name.name), `${prefix}${name.name}/`));
    else if (/\.(html|js)$/.test(name.name)) out.push({ path: join(dir, name.name), label: `${prefix}${name.name}` });
  }
  return out;
}

test('関門A: setupWidget で読む節は map 型だけ（object 型の節は設定が届かない）', () => {
  for (const file of widgetFiles()) {
    const code = readFileSync(file.path, 'utf8');
    for (const m of code.matchAll(/setupWidget\(\s*'([A-Za-z0-9_]+)'/g)) {
      const section = SCHEMA[m[1]];
      assert.ok(section, `${file.label}: setupWidget('${m[1]}') に対応する節が SCHEMA に無い`);
      assert.equal(section.kind, 'map', `${file.label}: '${m[1]}' は ${section.kind} 型。setupWidget は map 型専用で、object 型の節では設定が初期値のまま動く。object 型は loadConfig から節そのものを読む形にすること`);
    }
  }
});

test('関門A: 画面のある節には、実物の画面ファイルがある', () => {
  for (const [name, section] of Object.entries(SCHEMA)) {
    if (!section.page) continue;
    const asFolder = join(WIDGETS_DIR, section.page, 'index.html');
    const asFile = join(WIDGETS_DIR, `${section.page}.html`);
    assert.ok(existsSync(asFolder) || existsSync(asFile), `${name}: 画面 '${section.page}' のファイルが無い`);
  }
});

test('関門B: お知らせは全件、版数・日付・種別・題・本文が揃っている', () => {
  const announcements = JSON.parse(readFileSync(new URL('../src/announcements.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(announcements.length > 0, 'お知らせが1件以上ある');
  for (const e of announcements) {
    assert.match(e.version ?? '', /^\d+\.\d+\.\d+$/, `版数の形が違う: ${e.title}`);
    assert.match(e.date ?? '', /^\d{4}-\d{2}-\d{2}$/, `日付の形が違う: ${e.title}`);
    assert.ok(['new', 'add', 'fix'].includes(e.type), `種別が無い／違う（表示で黙って落ちる）: ${e.title}`);
    assert.ok(String(e.title ?? '').length > 0 && String(e.body ?? '').length > 0, `題か本文が空: ${e.version}`);
  }
  assert.equal(announcements[0].version, pkg.version, '一番新しいお知らせの版数が package.json の版数と一致する（版数を上げたらお知らせも足すこと）');
});

test('関門C: ウィジェットのコードに、許可していない外部の宛先は無い', () => {
  const ALLOWED_HOSTS = new Set(['www.w3.org']); // SVG の名前空間だけ
  for (const file of widgetFiles()) {
    const code = readFileSync(file.path, 'utf8');
    for (const m of code.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
      assert.ok(ALLOWED_HOSTS.has(m[1]), `${file.label}: 外部の宛先 ${m[1]} を読んでいる。外部 CDN・フォントは使わない（自前に置く）`);
    }
    assert.doesNotMatch(code, /(?:src|href)\s*=\s*["']\/\//, `${file.label}: プロトコル相対の外部読み込みがある`);
  }
});
