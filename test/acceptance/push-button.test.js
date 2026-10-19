// participation-push の完成条件を、設定・集計・操作入口・公開コードで受け入れる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import express from 'express';
import http from 'node:http';
import { normalize, createStore } from '../../src/config.js';
import { Hub } from '../../src/hub.js';
import { PushButtonEngine } from '../../src/push-button.js';
import { createRuntime } from '../../src/runtime.js';

const tempDirs = [];
const tempDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-push-')); tempDirs.push(dir); return dir; };
const pushConfig = (extra = {}) => ({ label: '押せ!', seconds: 5, keyword: '押', likesPerPush: 5, steps: [3, 10, 30, 100], blueActions: [], greenActions: [], redActions: [], goldActions: [], missText: '不発', sound: true, volume: 0.3, color: 'accent', ...extra });

test('AC-1: pushButtons の設定を検証し、日本語のエラーで保存しない', () => {
  const bad = normalize({ pushButtons: { default: { keyword: '', seconds: 61, steps: [10, 3, 30, 100] } } });
  assert.ok(bad.errors.length >= 3);
  assert.ok(bad.errors.every((e) => /[\u3040-\u30ff\u3400-\u9fff]/.test(e)));
  assert.equal(normalize({ pushButtons: { default: pushConfig() } }).errors.length, 0);
});

test('AC-2〜4: コメント・いいねを数え、段階と内訳を出す', () => {
  const hub = new Hub();
  const engine = new PushButtonEngine(hub);
  engine.setConfig({ default: pushConfig() });
  engine.start('default');
  for (const id of ['a', 'b', 'c', 'a']) hub.publish({ kind: 'chat', text: '押', user: { id, name: id } });
  hub.publish({ kind: 'chat', text: '押す', user: { id: 'd', name: 'd' } });
  hub.publish({ kind: 'like', count: 12, total: 0, user: { id: 'like' } });
  const result = engine.finish('default');
  assert.equal(result.pushes, 5);
  assert.equal(result.byComments, 3);
  assert.equal(result.byLikes, 2);
  assert.equal(result.tierName, 'blue');
  engine.reset('default');
  engine.setConfig({ default: pushConfig({ likesPerPush: 0 }) });
  engine.start('default');
  hub.publish({ kind: 'like', count: 99, total: 0, user: { id: 'like' } });
  assert.equal(engine.finish('default').pushes, 0);
  engine.start('default');
  assert.throws(() => engine.start('default'), /もう始まっています/);
});

test('AC-5〜8: 動作・タイマー・テスト送信・公開状態に ID を残さない', async () => {
  const hub = new Hub(); let spins = 0;
  const engine = new PushButtonEngine(hub, { onResult: ({ actions }) => actions.forEach((a) => { if (a.type === 'roulette.spin') spins += 1; }) });
  engine.setConfig({ default: pushConfig({ steps: [3, 10, 30, 100], redActions: [{ type: 'roulette.spin' }] }) });
  engine.start('default');
  hub.publish({ kind: 'chat', text: '押', user: { id: 'PUSH_SECRET_ID', name: '参加者' } });
  hub.publish({ kind: 'chat', text: '押', user: { id: 'PUSH_SECRET_ID_2', name: '参加者2' } });
  hub.publish({ kind: 'chat', text: '押', user: { id: 'PUSH_SECRET_ID_3', name: '参加者3' } });
  const state = engine.finish('default');
  engine.finish('default');
  assert.equal(state.tierName, 'blue');
  assert.equal(spins, 0);
  assert.doesNotMatch(JSON.stringify(engine.snapshot()), /PUSH_SECRET_ID/);
  assert.equal(engine.snapshot().default.recent[0], '参加者3');
  hub.setStatus({ mode: 'live' });
  engine.start('default');
  hub.publish({ kind: 'chat', text: '押', test: true, user: { id: 'LIVE_SECRET', name: '本番テスト' } });
  assert.equal(engine.snapshot().default.pushes, 0);
  hub.setStatus({ mode: 'idle' });
});

test('AC-9〜10: API と control は同じ遷移を使い、FEATURES に出る', async () => {
  const dir = tempDir();
  const store = createStore(path.join(dir, 'config.yaml'));
  store.replaceText('pushButtons:\n  default:\n    seconds: 5\n');
  const runtime = createRuntime({ id: 'local', store, dataDir: path.join(dir, 'data'), mediaDirs: [dir] });
  const app = express(); app.use(express.json()); app.use(runtime.router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/push-button/default/start`)).status, 200);
    assert.equal(runtime.performControl('push', 'finish', { id: 'default' }).status, 200);
    assert.equal((await fetch(`${base}/api/push-button/default/reset`)).status, 200);
    assert.equal(runtime.performControl('push', 'unknown', { id: 'default' }).status, 400);
  } finally { await runtime.close(); server.close(); }
});

test('AC-11〜12: 公開 JS は ES5・CDN なし、画面と一覧に出る', () => {
  const widget = fs.readFileSync('public/widgets/push-button.js', 'utf8');
  assert.doesNotMatch(widget, /https?:\/\//);
  const require = createRequire(import.meta.url); let acorn = null; try { acorn = require('acorn'); } catch {}
  if (acorn) assert.doesNotThrow(() => acorn.parse(widget, { ecmaVersion: 5, sourceType: 'script' }));
  else assert.doesNotMatch(widget, /=>|`|\?\.|\?\?|\b(?:let|const|class|import|export)\b/);
  assert.match(fs.readFileSync('public/widgets/push-button.html', 'utf8'), /押せ!|押/);
  assert.match(fs.readFileSync('public/dashboard/simple.js', 'utf8'), /pushButtons/);
  assert.match(fs.readFileSync('public/widgets/all.html', 'utf8'), /pushButtons/);
  assert.doesNotThrow(() => new vm.Script(widget));
});

test.after(() => { for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true }); });
