// 配信中の使用部品：enabled が false の部品だけが「使っていない」。
// 既定で有効な部品や、判定できない部品は使用中側に倒す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inUseWidgets, collectWidgetUsage } from '../src/widget-usage.js';

test('誰も配信していなければ、使っている部品はない', () => {
  assert.equal(inUseWidgets([]).size, 0);
  assert.equal(inUseWidgets([null]).size, 0);
});

test('設定が空なら、画面のある部品は全部使用中とみなす（保守側）', () => {
  const used = inUseWidgets([{}]);
  assert.ok(used.has('omikuji'));
  assert.ok(used.has('chat'));
  assert.ok(used.has('gacha'));
  assert.ok(used.has('puchun')); // page が puchun/puchun でも先頭の名前で数える
});

test('enabled が false の部品だけが外れる', () => {
  const used = inUseWidgets([{ omikuji: { enabled: false } }]);
  assert.equal(used.has('omikuji'), false);
  assert.ok(used.has('chat'));
});

test('配信中の人のうち1人でも使っていれば使用中', () => {
  const used = inUseWidgets([{ chats: { enabled: false } }, {}]);
  assert.ok(used.has('chat'));
});

test('collectWidgetUsage は配信中の分だけを数える', () => {
  const live = { isLive: () => true, getConfig: () => ({ omikuji: { enabled: false } }) };
  const idle = { isLive: () => false, getConfig: () => ({}) };
  const tenants = { liveRuntimes: () => [live] };
  const fromTenants = collectWidgetUsage({ tenants });
  assert.equal(fromTenants.live, 1);
  assert.equal(fromTenants.inUse.includes('omikuji'), false);
  const fromLocal = collectWidgetUsage({ local: live });
  assert.equal(fromLocal.live, 1);
  const nobody = collectWidgetUsage({ local: idle, tenants: { liveRuntimes: () => [] } });
  assert.equal(nobody.live, 0);
  assert.equal(nobody.inUse.length, 0);
});
