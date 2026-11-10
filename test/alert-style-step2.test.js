import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 保存の往復は、本物の config.yaml を触らないよう一時ファイルで確かめる
process.env.TW_CONFIG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-style2-')), 'config.yaml');
const cfg = await import('../src/config.js');
const { previewTemplate } = await import('../src/templates.js');

test('段取り2: style は保存（setValue）→再読み込みで保持される', () => {
  fs.copyFileSync(cfg.EXAMPLE_PATH, cfg.CONFIG_PATH);
  const store = cfg.createStore(cfg.CONFIG_PATH);
  const result = store.setValue('alerts.default.style', 'compact');
  assert.equal(result.ok, true);
  // 画面の保存相当（PATCH /api/config が呼ぶのと同じ setValue）のあと、読み直しても残る
  const again = cfg.createStore(cfg.CONFIG_PATH);
  assert.equal(again.load().config.alerts.default.style, 'compact');
  const { config, errors } = cfg.load();
  assert.deepEqual(errors, []);
  assert.equal(config.alerts.default.style, 'compact');
});

test('段取り2: 配信テンプレートの適用差分に style が乗り、取り消しに必要な前値も残る', () => {
  const { config } = cfg.normalize({ alerts: { default: {} } });
  assert.equal(config.alerts.default.style, 'standard');
  const fixture = {
    id: 'test-style',
    name: '試験用',
    widgets: ['alerts'],
    changes: [{ path: 'alerts.default', op: 'merge', value: { style: 'compact' } }],
  };
  const preview = previewTemplate(fixture, { config, widgets: ['alerts'], tenant: false, entitled: () => true });
  const row = preview.rows.find((r) => r.section === 'alerts' && (r.kind === 'change' || r.kind === 'create'));
  assert.ok(row, 'alerts の差分が出る');
  assert.equal(row.before.style, 'standard', '取り消しで戻すための前値が残る');
  assert.equal(row.after.style, 'compact', '適用後の値に style が乗る');
});
