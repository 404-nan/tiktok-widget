// クイズ（src/quiz.js）の単体テスト。出題・正解判定・制限時間・問題集・支払いの口を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { Hub } from '../src/hub.js';
import { QuizEngine, normalizeAnswer, parseQuestionLine } from '../src/quiz.js';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';

const baseQuiz = (extra = {}) => ({
  title: 'クイズ',
  source: 'single',
  question: '日本でいちばん高い山は？',
  answer: '富士山',
  choices: [],
  questions: [],
  seconds: 0,
  rewardPoints: 100,
  showAnswer: true,
  sound: true,
  volume: 0.3,
  color: 'accent',
  ...extra,
});

function setup(config = {}, onWin = null) {
  const hub = new Hub();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  const engine = new QuizEngine(hub, { onWin });
  engine.setConfig({ default: baseQuiz(config) });
  return { hub, engine, sent };
}

const chat = (hub, text, { id = 'u1', name = 'さくら', test = false } = {}) =>
  hub.emit('event', { kind: 'chat', text, user: { id, name }, ...(test ? { test: true } : {}) });

test('出題すると受付中になり、答えは公開状態に出ない', () => {
  const { engine } = setup();
  const state = engine.start('default');
  assert.equal(state.phase, 'open');
  assert.equal(state.question, '日本でいちばん高い山は？');
  assert.equal(state.answer, null);
});

test('答えの文と一致した最初の人が正解になり、支払いの口が1回だけ呼ばれる', () => {
  const wins = [];
  const { hub, engine } = setup({}, (win) => wins.push(win));
  engine.start('default');
  chat(hub, '北岳', { id: 'u2', name: 'たろう' });
  assert.equal(engine.snapshot().default.phase, 'open');
  chat(hub, ' 富士山 ', { id: 'u1', name: 'さくら' });
  const state = engine.snapshot().default;
  assert.equal(state.phase, 'result');
  assert.equal(state.reason, 'win');
  assert.equal(state.winner.name, 'さくら');
  assert.equal(state.answer, '富士山');
  assert.equal(wins.length, 1);
  assert.equal(wins[0].points, 100);
  assert.equal(wins[0].test, false);
  // 結果のあとの正解コメントでは二重に払わない
  chat(hub, '富士山', { id: 'u3', name: 'みどり' });
  assert.equal(wins.length, 1);
});

test('全角・半角と大文字小文字は区別しない', () => {
  assert.equal(normalizeAnswer(' Ｆｕｊｉ '), 'fuji');
  const { hub, engine } = setup({ question: 'ABCは？', answer: 'abc', choices: [] });
  engine.start('default');
  chat(hub, 'ＡＢＣ');
  assert.equal(engine.snapshot().default.reason, 'win');
});

test('選択肢があるときは番号でも答えられる', () => {
  const { hub, engine } = setup({ choices: ['北岳', '富士山', '奥穂高岳'] });
  engine.start('default');
  chat(hub, '1', { id: 'u2' });
  assert.equal(engine.snapshot().default.phase, 'open');
  chat(hub, '２', { id: 'u3' });
  const state = engine.snapshot().default;
  assert.equal(state.phase, 'result');
  assert.equal(state.winner.name, 'さくら');
});

test('選択肢と答えが合っていない問題は出題できない', () => {
  const { engine } = setup({ choices: ['北岳', '奥穂高岳'] });
  assert.throws(() => engine.start('default'), /選択肢のどれか/);
});

test('テスト送信の正解では支払いの口に test が付く', () => {
  const wins = [];
  const { hub, engine } = setup({}, (win) => wins.push(win));
  engine.start('default');
  chat(hub, '富士山', { test: true });
  assert.equal(wins.length, 1);
  assert.equal(wins[0].test, true);
});

test('制限時間が過ぎると時間切れの結果になる', async () => {
  const { engine } = setup({ seconds: 0.05 });
  engine.start('default');
  await new Promise((r) => setTimeout(r, 90));
  const state = engine.snapshot().default;
  assert.equal(state.phase, 'result');
  assert.equal(state.reason, 'timeout');
  assert.equal(state.winner, null);
});

test('締める（finish）と正解者なしで結果になる', () => {
  const { engine } = setup();
  engine.start('default');
  const state = engine.finish('default');
  assert.equal(state.phase, 'result');
  assert.equal(state.reason, 'finish');
});

test('出題中の二重の出題はできない', () => {
  const { engine } = setup();
  engine.start('default');
  assert.throws(() => engine.start('default'), /もう出題中/);
});

test('問題集からは順に出て、最後まで行くと最初に戻る', () => {
  const { engine } = setup({
    source: 'set',
    questions: ['山は？|富士山', '川は？|信濃川|利根川|信濃川'],
  });
  assert.equal(engine.start('default').question, '山は？');
  engine.reset('default');
  const second = engine.start('default');
  assert.equal(second.question, '川は？');
  assert.deepEqual(second.choices, ['利根川', '信濃川']);
  engine.reset('default');
  assert.equal(engine.start('default').question, '山は？');
});

test('問題集の行の形が壊れていたら出題できない', () => {
  assert.throws(() => parseQuestionLine('答えだけ'), /答えを入れてください/);
  assert.throws(() => parseQuestionLine('|富士山'), /問題文を入れてください/);
  const { engine } = setup({ source: 'set', questions: [] });
  assert.throws(() => engine.start('default'), /問題集が空/);
});

test('リセットすると待機に戻り、問題集の進み具合は残る', () => {
  const { engine } = setup({ source: 'set', questions: ['山は？|富士山', '川は？|信濃川'] });
  engine.start('default');
  engine.reset('default');
  assert.equal(engine.snapshot().default.phase, 'idle');
  assert.equal(engine.start('default').question, '川は？');
});

test('HTTP で出題し、本物の正解コメントでポイントが払われ、テスト送信では払われない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-quiz-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const store = createStore(path.join(dir, 'config.yaml'));
  store.replaceText([
    'points:',
    '  commentPoints: 0',
    'quizzes:',
    '  default:',
    '    question: 日本でいちばん高い山は？',
    '    answer: 富士山',
    '    seconds: 0',
    '    rewardPoints: 100',
    '',
  ].join('\n'));
  const runtime = createRuntime({ id: 'local', store, dataDir, mediaDirs: [dir] });
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => (await fetch(`${base}${p}`)).json();
  try {
    const started = await (await fetch(`${base}/api/quiz/default/start`)).json();
    assert.equal(started.quiz.phase, 'open');
    assert.equal(started.quiz.answer, null);
    // テスト送信の正解ではポイントが増えない
    runtime.hub.publish({ kind: 'chat', text: '富士山', user: { id: 'test-user', name: 'テスト' }, test: true });
    let points = await get('/api/points');
    assert.equal(points.ranking.find((row) => row.userId === 'test-user'), undefined);
    // リセットして、本物の正解で 100 ポイント払われる
    await fetch(`${base}/api/quiz/default/reset`);
    await fetch(`${base}/api/quiz/default/start`);
    runtime.hub.publish({ kind: 'chat', text: '富士山', user: { id: 'real-user', name: 'さくら' } });
    const state = await get('/api/quiz');
    assert.equal(state.default.phase, 'result');
    assert.equal(state.default.winner.name, 'さくら');
    points = await get('/api/points');
    assert.equal(points.ranking.find((row) => row.userId === 'real-user')?.balance, 100);
    const bad = await fetch(`${base}/api/quiz/default/知らない動作`);
    assert.equal(bad.status, 400);
  } finally {
    await runtime.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('使えなくなったら出題中のクイズも止まる', () => {
  const { engine } = setup();
  engine.start('default');
  engine.setEnabled(false);
  assert.deepEqual(engine.snapshot(), {});
  assert.throws(() => engine.start('default'), /利用できません/);
});
