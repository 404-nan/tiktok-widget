// カード docs/cards/gift-coins-refresh.md の AC-1〜3 を確かめる受け入れテスト。
// AC-4(既存テスト全部)は npm test 全体の結果が証拠なので、ここでは書かない。ネットにはつながない。
// 「前の表」は表を更新するコミット b8f617b の親から読む。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;
const BEFORE = 'b8f617b^';
const now = (f) => JSON.parse(readFileSync(root + f, 'utf8'));
const before = (f) => JSON.parse(execFileSync('git', ['show', `${BEFORE}:${f}`], { cwd: root, encoding: 'utf8' }));

test('AC-1 コインの表は744件以上で、source の日付が 2026-11-03', () => {
  const t = now('src/gift-coins.json');
  assert.ok(Object.keys(t.coins).length >= 744);
  assert.match(t.source, /2026-11-03/);
});

test('AC-2 どの値も0以上の数で、既存の見本が変わっていない', () => {
  const { coins } = now('src/gift-coins.json');
  for (const [id, v] of Object.entries(coins)) {
    assert.ok(typeof v === 'number' && Number.isFinite(v) && v >= 0, `${id}: ${v}`);
  }
  assert.equal(coins['5655'], 1);
  assert.equal(coins['5269'], 1);
});

test('AC-3 名前の表は765件以上で、前の表の名前が消えていない', () => {
  const names = now('src/gift-names-ja.json').names;
  assert.ok(Object.keys(names).length >= 765);
  for (const id of Object.keys(before('src/gift-names-ja.json').names)) {
    assert.ok(id in names, `名前が消えた: ${id}`);
  }
});

test('AC-5 前の表の名前は英語も日本語も変わらない', () => {
  const names = now('src/gift-names-ja.json').names;
  for (const [id, pair] of Object.entries(before('src/gift-names-ja.json').names)) {
    assert.deepEqual(names[id], pair, id);
  }
});

test('AC-6 ブラウザ用の表は対応表から作り直してある', async () => {
  const { default: table } = await import(root + 'public/widgets/lib/gift-names-ja.js');
  for (const [id, pair] of Object.entries(now('src/gift-names-ja.json').names)) {
    if (pair[1]) assert.equal(table.byId[id], pair[1], id);
  }
});
