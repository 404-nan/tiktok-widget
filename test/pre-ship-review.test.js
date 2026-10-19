// 本番前レビューで見つかった、画面とサーバーのつなぎ目を確認する。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('管理画面と配信画面のテンプレート名・構成が同じ', () => {
  const admin = read('public/admin/admin.js');
  const stage = read('public/dashboard/stage.js');
  assert.match(admin, /endurance:\s*'耐久・目標配信'/);
  assert.match(stage, /id: 'endurance',[\s\S]*name: '耐久・目標配信'/);
  assert.match(stage, /id: 'endurance',[\s\S]*sections: \['timers', 'goals', 'alerts', 'rankings', 'cutins'\]/);
});

test('テンプレート画面は読み込み・適用・元戻しの失敗を画面に出す', () => {
  const source = read('public/dashboard/templates.js');
  assert.match(source, /selected = item;[\s\S]*catch/);
  assert.match(source, /await api\('\/api\/templates\/apply'[\s\S]*catch/);
  assert.match(source, /await api\('\/api\/templates\/undo'[\s\S]*catch/);
  assert.match(source, /applied = true/);
});
