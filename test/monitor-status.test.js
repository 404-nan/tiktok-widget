import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Hub } from '../src/hub.js';
import { statusText } from '../public/dashboard/status-text.js';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('接続状態の表示文は mode ごとに決まり、LIVE はユーザー名付き', () => {
  const hub = new Hub();
  assert.equal(statusText(hub.status), '未接続');
  hub.setStatus({ mode: 'connecting', username: 'sakura' });
  assert.equal(statusText(hub.status), '接続中');
  hub.setStatus({ mode: 'live', username: 'sakura' });
  assert.equal(statusText(hub.status), 'LIVE · @sakura');
  hub.setStatus({ mode: 'demo' });
  assert.equal(statusText(hub.status), 'デモ');
  hub.setStatus({ mode: 'error', message: '切れた' });
  assert.equal(statusText(hub.status), 'エラー');
  hub.setStatus({ mode: 'ended', username: null });
  assert.equal(statusText(hub.status), '配信終了');
  assert.equal(statusText({ mode: 'unknown-mode' }), 'unknown-mode');
});

test('設定画面は WebSocket が無くても /api/status を5秒ごとに読んで接続状態を出す', () => {
  const src = read('../public/dashboard/app.js');
  assert.match(src, /setInterval\(\(\) => api\('\/api\/status'\)\.then\(\(s\) => s\.status && renderStatus\(s\.status\)\)/);
  assert.match(src, /api\('\/api\/status'\)[\s\S]{0,180}if \(status\) renderStatus\(status\)/);
  assert.match(src, /\$\('statusText'\)\.textContent = statusText\(status\)/);
  assert.match(src, /\$\('status'\)\.dataset\.mode = status\.mode/);
});

test('統計画面は /api/status を5秒ごとに読んで接続状態を出す', () => {
  const src = read('../public/history/history.js');
  assert.match(src, /const pollStatus = \(\) => api\('\/api\/status'\)\.then\(\(s\) => showStatus\(s\.status\)\)/);
  assert.match(src, /pollStatus\(\);\s*setInterval\(pollStatus, 5000\)/);
  assert.match(src, /\$\('status'\)\.dataset\.mode = status\.mode/);
  assert.match(src, /\$\('statusText'\)\.textContent = statusText\(status\)/);
});

test('モニターは /api/status の status を5秒ごとに接続状態へ出す', () => {
  const src = read('../public/monitor/monitor.js');
  assert.match(src, /async function syncSession\(\) \{[\s\S]*?api\('\/api\/status'\)[\s\S]*?renderStatus\(st\.status\)/);
  assert.match(src, /setInterval\(syncSession, 5000\)/);
  assert.match(src, /function renderStatus\(status\) \{\s*\$\('status'\)\.dataset\.mode = status\.mode;\s*\$\('statusText'\)\.textContent = statusText\(status\)/);
});
