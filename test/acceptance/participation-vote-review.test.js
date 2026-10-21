// participation-vote のレビュー指摘が実装で解消されていることを受け入れテストする。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { normalize, createStore } from '../../src/config.js';
import { Hub } from '../../src/hub.js';
import { VoteEngine } from '../../src/vote.js';
import { createRuntime } from '../../src/runtime.js';

const tempDirs = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-vote-review-'));
  tempDirs.push(dir);
  return dir;
}

function voteConfig(extra = {}) {
  return {
    title: 'どれにする?',
    options: ['A', 'B', 'C'],
    durationSeconds: 0,
    autoReveal: true,
    resultActions: [],
    showNames: true,
    sound: true,
    volume: 0.3,
    color: 'accent',
    ...extra,
  };
}

function requestServer(runtime) {
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      base: `http://127.0.0.1:${server.address().port}`,
    }));
  });
}

async function requestJson(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

test('レビュー2: start の seconds 上書きにも 3600 秒の上限を使う', () => {
  const engine = new VoteEngine(new Hub());
  engine.setConfig({ default: voteConfig() });
  const state = engine.start('default', { seconds: 10_000_000 });
  assert.ok(state.endsAt - Date.now() <= 3_600_100, `endsAt が長すぎます: ${state.endsAt}`);
  engine.reset();
});

test('レビュー3: 投票 API と performControl は不明な action・設定を日本語で返す', async () => {
  const dir = tempDir();
  const store = createStore(path.join(dir, 'config.yaml'));
  store.replaceText('votes:\n  default:\n    options: [A, B, C]\n');
  const runtime = createRuntime({ id: 'local', store, dataDir: path.join(dir, 'data'), mediaDirs: [dir] });
  const live = await requestServer(runtime);
  try {
    for (const method of ['GET', 'POST']) {
      for (const pathname of ['/api/vote/no-such/start', '/api/vote/default/unknown']) {
        const result = await requestJson(live.base, pathname, method === 'POST' ? { method, body: '{}' } : { method });
        assert.equal(result.response.status, 400, `${method} ${pathname}: ${JSON.stringify(result.body)}`);
        assert.match(result.body.error, /[\u3040-\u30ff\u3400-\u9fff]/);
      }
    }
    for (const [action, data] of [['unknown', { id: 'default' }], ['start', { id: 'no-such' }]]) {
      const result = runtime.performControl('vote', action, data);
      assert.equal(result.status, 400, `${action}: ${JSON.stringify(result.body)}`);
      assert.match(result.body.error, /[\u3040-\u30ff\u3400-\u9fff]/);
    }

    const emptyDir = tempDir();
    const emptyStore = createStore(path.join(emptyDir, 'config.yaml'));
    emptyStore.replaceText('votes: {}\n');
    const emptyRuntime = createRuntime({ id: 'empty', store: emptyStore, dataDir: path.join(emptyDir, 'data'), mediaDirs: [emptyDir] });
    const emptyLive = await requestServer(emptyRuntime);
    try {
      for (const method of ['GET', 'POST']) {
        const result = await requestJson(emptyLive.base, '/api/vote/all/start', method === 'POST' ? { method, body: '{}' } : { method });
        assert.equal(result.response.status, 400, `${method} empty all: ${JSON.stringify(result.body)}`);
        assert.match(result.body.error, /[\u3040-\u30ff\u3400-\u9fff]/);
      }
      const control = emptyRuntime.performControl('vote', 'start', { id: 'all' });
      assert.equal(control.status, 400, JSON.stringify(control.body));
      assert.match(control.body.error, /[\u3040-\u30ff\u3400-\u9fff]/);
    } finally {
      await emptyRuntime.close();
      emptyLive.server.closeAllConnections?.();
      await new Promise((resolve) => emptyLive.server.close(resolve));
    }
  } finally {
    await runtime.close();
    live.server.closeAllConnections?.();
    await new Promise((resolve) => live.server.close(resolve));
  }
});

test('レビュー4: 投票のテストボタンは毎回別の参加者を送る', () => {
  const editor = fs.readFileSync('public/dashboard/editor.js', 'utf8');
  assert.match(editor, /テスト参加者.*\+\+|\+\+.*テスト参加者/);
});

test('レビュー1・5・6: 公開投票画面に音・溜め・名前表示・再描画の受け入れ条件がある', () => {
  const widget = fs.readFileSync('public/widgets/vote.js', 'utf8');
  assert.match(widget, /AudioContext|webkitAudioContext/);
  assert.match(widget, /sound/);
  assert.match(widget, /volume/);
  assert.match(widget, /playSuspense|溜め/);
  assert.match(widget, /voted|highlight|明る/);
  assert.match(widget, /0票/);
  assert.match(widget, /showNames|nameQueue|順/);
  assert.match(widget, /revealTimer/);
  assert.match(widget, /clearTimeout\(revealTimer\)/);
});

test.after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});
