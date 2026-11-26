// 「直した印」には再発防止テストが必ずあることを機械で見張る。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkErrorFixes } from '../src/error-fixes.js';

const root = path.resolve(import.meta.dirname, '..');
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function writeFixture({ entry, testText = '' }) {
  const dir = tmp('tw-error-fixes-');
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'error-fixes.json'), JSON.stringify({ fixes: entry == null ? [] : [entry] }, null, 2));
  fs.writeFileSync(path.join(dir, 'test', 'guard.test.js'), testText);
  return dir;
}

test('リポジトリの docs/error-fixes.json は全部、必要な欄と実在する再発防止テストを持つ', () => {
  assert.deepEqual(checkErrorFixes({ root }), []);
});

test('検査は、欄が足りない直した印を落とす', () => {
  const dir = writeFixture({ entry: { fingerprint: 'abc123def456', summary: '直した', fixedIn: 'commit', fixedAt: '2026-11-27' } });
  const errors = checkErrorFixes({ root: dir });
  assert.ok(errors.some((line) => line.includes('test.file')));
  assert.ok(errors.some((line) => line.includes('test.name')));
});

test('検査は、テストファイルが無い直した印を落とす', () => {
  const dir = writeFixture({
    entry: { fingerprint: 'abc123def456', summary: '直した', fixedIn: 'commit', fixedAt: '2026-11-27', test: { file: 'test/missing.test.js', name: '守る' } },
  });
  assert.ok(checkErrorFixes({ root: dir }).some((line) => line.includes('test/missing.test.js')));
});

test('検査は、同じ名前のテストがファイルに無い直した印を落とし、あるものは通す', () => {
  const entry = { fingerprint: 'abc123def456', summary: '直した', fixedIn: 'commit', fixedAt: '2026-11-27', test: { file: 'test/guard.test.js', name: '同じ失敗を二度出さない' } };
  const missing = writeFixture({ entry, testText: "test('別のテスト', () => {});\n" });
  assert.ok(checkErrorFixes({ root: missing }).some((line) => line.includes('同じ失敗を二度出さない')));
  const valid = writeFixture({ entry, testText: "test('同じ失敗を二度出さない', () => {});\n" });
  assert.deepEqual(checkErrorFixes({ root: valid }), []);
});
