import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('管理画面に API 使用量ページがあり、上限比と配信者別表を出す部品がある', () => {
  const index = fs.readFileSync('public/admin/index.html', 'utf8');
  const admin = fs.readFileSync('public/admin/admin.js', 'utf8');
  const usage = fs.readFileSync('public/admin/admin-usage.js', 'utf8');
  assert.match(index, /data-page="usage"[^>]*>API 使用量/);
  assert.match(admin, /admin-usage\.js/);
  assert.match(admin, /page === 'usage'/);
  assert.match(usage, /\/usage\/summary/);
  assert.match(usage, /\/usage\/tenants/);
  assert.match(usage, /\/usage\/timeseries/);
  assert.match(usage, /Euler 今日/);
  assert.match(usage, /上限/);
  assert.match(usage, /配信者別/);
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', 'public/admin/admin-usage.js'], { stdio: 'pipe' }));
});
