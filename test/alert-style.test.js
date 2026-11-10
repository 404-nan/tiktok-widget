import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as cfg from '../src/config.js';
import { STANDARD_STYLE, resolveAlertStyle, validateStyleDef } from '../public/widgets/lib/alert-style.js';

const defs = JSON.parse(fs.readFileSync(new URL('../public/widgets/gift-alert/styles.json', import.meta.url), 'utf8'));

test('型を持たない既存の alerts 設定は、style に初期の型が入る以外は従来と完全一致', () => {
  const base = { alerts: { main: { minCoins: 5, duration: 3, rules: [{ gifts: ['Rose'], color: 'gold', text: 'ありがとう' }] } } };
  const without = cfg.normalize(base).config.alerts.main;
  const withStandard = cfg.normalize({ alerts: { main: { ...base.alerts.main, style: 'standard' } } }).config.alerts.main;
  assert.equal(without.style, 'standard', '型を持たなければ初期の型が入る');
  assert.deepEqual(without, withStandard, '初期の型を明示した物と完全一致');
});

test('型を切り替えても rules と個別の数値は保持される', () => {
  const rules = [{ gifts: ['Rose'], minCoins: 10, duration: 9, text: '特別' }];
  const got = cfg.normalize({ alerts: { main: { style: 'compact', minCoins: 7, duration: 2.5, bigCoins: 500, rules } } }).config.alerts.main;
  assert.equal(got.style, 'compact');
  assert.equal(got.minCoins, 7);
  assert.equal(got.duration, 2.5);
  assert.equal(got.bigCoins, 500);
  assert.deepEqual(got.rules, rules);
});

test('未知の型の番号は設定を壊さず保持され、表示側は標準の型へ寄せる', () => {
  const got = cfg.normalize({ alerts: { main: { style: 'まだ無い型' } } }).config.alerts.main;
  assert.equal(got.style, 'まだ無い型', '未知の番号でも読み込みは成功し、値は保持される');
  assert.equal(resolveAlertStyle(defs, 'まだ無い型').id, 'standard', '引く側は標準の型を返す');
});

test('型の定義はデータの追加だけで増やせ、形の検証と引きが通る', () => {
  assert.ok(Array.isArray(defs) && defs.length >= 2, '定義ファイルに2型以上ある');
  for (const def of defs) assert.deepEqual(validateStyleDef(def), [], `${def.id} の形が正しい`);
  const added = { ...defs[0], id: 'test-only', name: 'テスト用' };
  const extended = [...defs, added];
  assert.equal(resolveAlertStyle(extended, 'test-only').id, 'test-only', '足した型が引ける');
  assert.deepEqual(validateStyleDef(added), []);
  assert.ok(validateStyleDef({ id: 'x' }).length > 0, '欠けた定義は検証で弾く');
  assert.ok(validateStyleDef({ ...defs[0], motion: 'spin' }).length > 0, '無い出方は弾く');
});

test('標準の型の写し（alert-style.js）は定義ファイルの standard と一致する', () => {
  const standard = defs.find((d) => d.id === 'standard');
  assert.deepEqual(STANDARD_STYLE, standard, '定義ファイルと写しがずれたら直すこと');
});
