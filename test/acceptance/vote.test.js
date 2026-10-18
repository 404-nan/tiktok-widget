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
import { runActions } from '../../src/actions.js';
import { createRuntime } from '../../src/runtime.js';

const tmpDirs = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-vote-'));
  tmpDirs.push(dir);
  return dir;
};
process.once('exit', () => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const baseVote = (extra = {}) => ({
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
});

function fakeClient() {
  const sent = [];
  return { readyState: 1, sent, send: (text) => sent.push(JSON.parse(text)), on() {} };
}

function chat(hub, text, id, name = id, test = false) {
  hub.publish({ kind: 'chat', text, user: { id, name }, ...(test ? { test: true } : {}) });
}

function setupVote(config = {}, onResult = null) {
  const hub = new Hub();
  const client = fakeClient();
  hub.addClient(client);
  const engine = new VoteEngine(hub, { onResult });
  engine.setConfig({ default: baseVote(config) });
  return { hub, client, engine };
}

function listenRuntime(runtime) {
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

test('AC-1: votes の設定を検証し、壊れた値を保存しない', () => {
  const tooFew = normalize({ votes: { default: { options: ['A'] } } });
  const tooMany = normalize({ votes: { default: { options: Array.from({ length: 10 }, (_, i) => String(i)) } } });
  const negative = normalize({ votes: { default: { durationSeconds: -1 } } });
  const badActions = normalize({ votes: { default: { resultActions: [{ type: '知らない動作' }] } } });
  for (const result of [tooFew, tooMany, negative, badActions]) {
    assert.ok(result.errors.length, `設定エラーになっていません: ${JSON.stringify(result)}`);
    assert.ok(result.errors.some((message) => /[ぁ-んァ-ヶ一-龠]/u.test(message)), result.errors.join('\n'));
  }
});

test('AC-2: 番号だけを1人1票で数え、全角数字にも対応する', () => {
  const { hub, engine } = setupVote();
  engine.start('default');
  chat(hub, '1', 'u1', '一人目');
  chat(hub, '2', 'u2', '二人目');
  chat(hub, '２', 'u3', '三人目');
  chat(hub, '3', 'u4', '四人目');
  chat(hub, '2', 'u2', '二人目');
  for (const text of ['1番', '11', '0', '4']) chat(hub, text, `invalid-${text}`);
  assert.deepEqual(engine.snapshot().default.counts, [1, 2, 1]);
  assert.equal(engine.snapshot().default.total, 4);
});

test('AC-3: open 以外は数えず、状態エラーを日本語で返す', () => {
  const { hub, engine } = setupVote();
  assert.throws(() => engine.close('default'), /受付中/);
  assert.throws(() => engine.result('default'), /受付中/);
  engine.start('default');
  assert.throws(() => engine.start('default'), /もう始まっています/);
  engine.close('default');
  chat(hub, '1', 'u1');
  assert.equal(engine.snapshot().default.total, 0);
  assert.throws(() => engine.close('default'), /受付中/);
});

test('AC-4: 勝者・同票・0票を計算し、結果の動作は1回だけ実行する', () => {
  const actions = [];
  const { hub, engine } = setupVote({ resultActions: [{ type: 'timer.add', seconds: 10 }, { type: 'wins.add', n: 1 }] }, (payload) => {
    actions.push(runActions(payload.actions, {
      timer: { apply: () => { throw new Error('タイマー停止中'); } },
      wins: { apply: () => '動いた' },
      bus: { emit() {} },
    }, { source: 'vote', voteId: payload.id }));
  });
  engine.start('default');
  chat(hub, '1', 'u1');
  chat(hub, '1', 'u2');
  chat(hub, '2', 'u3');
  const winner = engine.result('default');
  assert.deepEqual(winner.winners, [1]);
  assert.equal(winner.tie, false);
  assert.deepEqual(winner.percent, [66.7, 33.3, 0]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0].ok, false);
  assert.equal(actions[0][1].ok, true);
  assert.deepEqual(engine.result('default'), winner);
  assert.equal(actions.length, 1);

  engine.reset('default');
  engine.start('default');
  chat(hub, '1', 'u4');
  chat(hub, '2', 'u5');
  const tie = engine.result('default');
  assert.deepEqual(tie.winners, [1, 2]);
  assert.equal(tie.tie, true);
  assert.deepEqual(tie.percent, [50, 50, 0]);

  engine.reset('default');
  engine.start('default');
  const zero = engine.result('default');
  assert.deepEqual(zero.winners, []);
  assert.equal(zero.tie, false);
  assert.deepEqual(zero.percent, [0, 0, 0]);
});

test('AC-5: 時間で締まり、autoReveal と reset がタイマーに反映される', async () => {
  const { engine } = setupVote({ durationSeconds: 0.03, autoReveal: true });
  engine.start('default');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(engine.snapshot().default.phase, 'result');
  engine.reset('default');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(engine.snapshot().default.phase, 'idle');
});

test('AC-6: 配信中のテストコメントは数えず、接続開始時に準備中のテスト集計を消す', () => {
  const { hub, engine } = setupVote();
  engine.start('default');
  chat(hub, '1', 'before-live', '準備中', true);
  assert.equal(engine.snapshot().default.total, 1);
  hub.setStatus({ mode: 'live' });
  assert.equal(engine.snapshot().default.phase, 'idle');

  engine.start('default');
  hub.publish({ kind: 'chat', text: '1', user: { id: 'during-live', name: '配信中' }, test: true });
  assert.equal(engine.snapshot().default.total, 0);
  hub.publish({ kind: 'chat', text: '1', user: { id: 'real', name: '本物' } });
  assert.equal(engine.snapshot().default.total, 1);
});

test('AC-7: 投票の状態と投票通知にユーザー ID を出さない', () => {
  const marker = '投票者ID_MARKER';
  const { hub, client, engine } = setupVote({ showNames: true });
  engine.start('default');
  chat(hub, '1', marker, '表示してよい名前');
  engine.result('default');
  const serialized = JSON.stringify({ snapshot: engine.snapshot(), messages: client.sent.filter((message) => message.type === 'vote') });
  assert.equal(serialized.includes(marker), false);
  assert.equal(serialized.includes('表示してよい名前'), true);
  assert.ok(client.sent.some((message) => message.type === 'vote' && Array.isArray(message.vote.recent)));
});

test('AC-8: HTTP の投票操作と /api/control が同じ状態遷移をする', async () => {
  const dir = tempDir();
  const configPath = path.join(dir, 'config.yaml');
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const store = createStore(configPath);
  store.replaceText('votes:\n  default:\n    options: [A, B, C]\n    durationSeconds: 0\n');
  const runtime = createRuntime({ id: 'local', store, dataDir, mediaDirs: [dir] });
  const live = await listenRuntime(runtime);
  try {
    for (const action of ['start', 'close', 'result', 'reset']) {
      const result = await requestJson(live.base, `/api/vote/default/${action}`);
      assert.equal(result.response.status, 200, `${action}: ${JSON.stringify(result.body)}`);
    }
    const control = await requestJson(live.base, '/api/control', {
      method: 'POST',
      body: JSON.stringify({ target: 'vote', action: 'start', data: { id: 'default' } }),
    });
    assert.equal(control.response.status, 200, JSON.stringify(control.body));
    const status = await requestJson(live.base, '/api/vote');
    assert.equal(status.body.default.phase, 'open');
    const bad = await requestJson(live.base, '/api/vote/default/知らない動作');
    assert.equal(bad.response.status, 400);
    assert.match(bad.body.error, /動作|action|操作/);
  } finally {
    await runtime.close();
    live.server.closeAllConnections?.();
    await new Promise((resolve) => live.server.close(resolve));
  }
});

test('AC-9: AI 操作 API に vote の read / operate を追加できる形になっている', async () => {
  const { AI_ROUTES } = await import('../../src/ai-api.js');
  assert.ok(AI_ROUTES.some((route) => route.method === 'POST' && route.path === '/vote' && route.tool === 'vote'));
});

test('AC-10: votes feature を使えないときはエンジンが動かない', () => {
  const hub = new Hub();
  const engine = new VoteEngine(hub);
  engine.setConfig({ default: baseVote() });
  engine.setEnabled(false);
  assert.throws(() => engine.start('default'), /使えません|利用できません/);
  assert.equal(engine.snapshot().default, undefined);
});
