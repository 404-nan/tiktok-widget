// 初見・常連の記録、テスト送信、公開ウィジェットの完成条件を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../../src/hub.js';
import { VisitorLog } from '../../src/visitors.js';
import { SCHEMA } from '../../src/schema.js';
import { makeEvent } from '../../src/demo.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-visitors-'));
const config = (overrides = {}) => ({
  showFirst: true,
  showReturning: true,
  showRegular: true,
  regularVisits: 3,
  firstText: 'はじめまして！ゆっくりしていってね',
  returningText: 'また来てくれてありがとう',
  regularText: '{visits}回目の来場、いつもありがとう',
  duration: 4,
  maxQueue: 5,
  avatars: true,
  keepDays: 90,
  ...overrides,
});
const user = (id, name = '花子') => ({ id, name, avatar: 'https://example.invalid/avatar.png' });
const event = (kind, id = 'u-1', name = '花子', extra = {}) => ({ kind, user: user(id, name), ...extra });

function liveHub(visitors = config()) {
  const hub = new Hub();
  hub.config = { visitors: visitors.default ? visitors : { default: visitors } };
  hub.status = { mode: 'live', username: '配信者', message: '' };
  return hub;
}

test('VisitorLog は配信ごとに一度だけ迎え、配信をまたぐと回数を増やす', () => {
  const dir = temp();
  let now = Date.parse('2026-10-19T12:00:00Z');
  const hub = liveHub();
  const sent = [];
  hub.broadcast = (message) => sent.push(message);
  const log = new VisitorLog(hub, { dir, now: () => now });
  hub.emit('status', hub.status, { mode: 'idle' });
  hub.emit('event', event('chat'));
  hub.emit('event', event('gift'));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].visitor, { user: { name: '花子', avatar: 'https://example.invalid/avatar.png' }, visits: 1, first: true });
  assert.deepEqual(log.snapshot().stream, { first: 1, returning: 0, regular: 0 });

  now += 60_000;
  hub.status = { ...hub.status, mode: 'connecting' };
  hub.emit('status', hub.status, { mode: 'live' });
  hub.emit('event', event('follow'));
  assert.equal(sent.length, 1);
  hub.status = { ...hub.status, mode: 'live' };
  hub.emit('status', hub.status, { mode: 'connecting' });
  hub.emit('event', event('share'));
  assert.equal(sent.length, 1);

  hub.status = { ...hub.status, mode: 'idle' };
  hub.emit('status', hub.status, { mode: 'live' });
  now += 86_400_000;
  hub.status = { ...hub.status, mode: 'live' };
  hub.emit('status', hub.status, { mode: 'idle' });
  hub.emit('event', event('like'));
  assert.equal(sent.at(-1).visitor.visits, 2);
  assert.deepEqual(log.snapshot().stream, { first: 0, returning: 1, regular: 0 });
  log.close();
});

test('テスト送信と demo_ は記録せず、testEvent は画面だけに配る', () => {
  const dir = temp();
  const hub = liveHub();
  const sent = [];
  hub.broadcast = (message) => sent.push(message);
  const log = new VisitorLog(hub, { dir, now: () => Date.parse('2026-10-19T12:00:00Z') });
  hub.emit('testEvent', { ...event('member', 'demo_hana'), test: true, testVisits: 7 });
  hub.emit('event', { ...event('chat', 'demo_hana'), test: true });
  assert.equal(sent.at(-1).visitor.visits, 7);
  assert.equal(fs.existsSync(path.join(dir, 'visitors.json')), false);
  assert.equal(log.snapshot().stored, 0);
  log.close();
});

test('保存は HMAC の番号だけで、壊れた秘密鍵では停止する', () => {
  const dir = temp();
  const hub = liveHub();
  const log = new VisitorLog(hub, { dir, now: () => Date.parse('2026-10-19T12:00:00Z') });
  hub.emit('event', event('member', 'real-user', '保存しない名前'));
  log.flush();
  const key = fs.readFileSync(path.join(dir, 'visitors.key'));
  const saved = fs.readFileSync(path.join(dir, 'visitors.json'), 'utf8');
  assert.equal(key.length, 64);
  assert.equal(key.toString('utf8').length, 64);
  assert.doesNotMatch(saved, /real-user|保存しない名前|avatar/);
  log.close();

  fs.writeFileSync(path.join(dir, 'visitors.key'), '壊れた鍵');
  const brokenHub = liveHub();
  const broken = new VisitorLog(brokenHub, { dir, now: () => Date.now() });
  brokenHub.emit('event', event('member', 'another-user'));
  assert.equal(broken.snapshot().stored, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'visitors.json'), 'utf8')).people !== undefined, true);
  broken.close();
});

test('保存期間、forget、設定なしを扱う', () => {
  const dir = temp();
  const now = Date.parse('2026-10-19T12:00:00Z');
  const hub = liveHub(config({ keepDays: 1 }));
  const log = new VisitorLog(hub, { dir, now: () => now });
  log.load({ version: 1, people: { old: { visits: 2, first: '2026-10-01', last: '2026-10-01', stream: 1 } } });
  assert.equal(log.snapshot().stored, 0);
  hub.emit('event', event('member'));
  log.flush();
  assert.equal(log.forget(), true);
  assert.equal(log.snapshot().stored, 0);
  assert.equal(fs.existsSync(path.join(dir, 'visitors.key')), false);
  log.close();

  const emptyDir = temp();
  const emptyHub = new Hub();
  emptyHub.config = {};
  const empty = new VisitorLog(emptyHub, { dir: emptyDir });
  emptyHub.status = { mode: 'live' };
  emptyHub.emit('event', event('member'));
  assert.equal(fs.existsSync(path.join(emptyDir, 'visitors.json')), false);
  assert.equal(fs.existsSync(path.join(emptyDir, 'visitors.key')), false);
  empty.close();
});

test('実際の visitors map から最小の regularVisits と keepDays を使う', () => {
  const dir = temp();
  let now = Date.parse('2026-10-19T12:00:00Z');
  const hub = liveHub({
    default: config({ regularVisits: 5, keepDays: 30 }),
    short: config({ regularVisits: 2, keepDays: 7 }),
  });
  const sent = [];
  hub.broadcast = (message) => sent.push(message);
  const log = new VisitorLog(hub, { dir, now: () => now });
  log.load({ version: 1, people: { old: { visits: 2, first: '2026-10-01', last: '2026-10-10', stream: 1 } } });
  assert.equal(log.snapshot().stored, 0, '最短の keepDays=7 で古い記録を消す');
  hub.emit('event', event('member', 'first'));
  hub.emit('status', { mode: 'idle' }, { mode: 'live' });
  now += 86_400_000;
  hub.emit('status', { mode: 'live' }, { mode: 'idle' });
  hub.emit('event', event('member', 'first'));
  assert.equal(sent.at(-1).visitor.visits, 2);
  assert.equal(log.snapshot().stream.regular, 1, '最小の regularVisits=2 を使う');
  log.close();
});

test('設定変更で未保存の来場を失わず、配信前のテスト送信も表示する', () => {
  const dir = temp();
  const hub = liveHub();
  const sent = [];
  hub.broadcast = (message) => sent.push(message);
  const log = new VisitorLog(hub, { dir, now: () => Date.parse('2026-10-19T12:00:00Z') });
  hub.emit('event', event('member', 'real-user'));
  hub.setConfig({ visitors: { default: config({ keepDays: 1 }) } });
  assert.equal(log.snapshot().stored, 1, '未保存の来場を設定変更で失わない');
  hub.status = { mode: 'idle' };
  hub.publish({ ...event('member', 'preview-user'), test: true, testVisits: 4 });
  assert.equal(sent.at(-1).type, 'visitor');
  assert.equal(sent.at(-1).visitor.visits, 4);
  assert.equal(sent.at(-1).visitor.test, true);
  assert.equal(log.snapshot().stored, 1, '配信前テストは記録しない');
  log.close();
});

test('再起動して同じ配信の印を読み込んだ場合は二重に数えない', () => {
  const dir = temp();
  const now = Date.parse('2026-10-19T12:00:00Z');
  const hub = liveHub();
  const first = new VisitorLog(hub, { dir, now: () => now });
  hub.emit('event', event('member', 'same-stream'));
  first.flush();
  first.close();
  const restartedHub = liveHub();
  restartedHub.status = { mode: 'live', username: '配信者', message: '' };
  const restarted = new VisitorLog(restartedHub, { dir, now: () => now });
  restartedHub.emit('event', event('member', 'same-stream'));
  assert.equal(restarted.snapshot().stream.first, 0, '同じ配信では再起動後に再通知しない');
  assert.equal(restarted.snapshot().stored, 1);
  restarted.close();
});

test('設定、member テストイベント、公開ウィジェットの契約がある', () => {
  assert.deepEqual(SCHEMA.visitors.size({}), [760, 160]);
  assert.equal(SCHEMA.visitors.fields.regularVisits.default, 3);
  assert.equal(makeEvent('member', { user: user('demo_hana', '花子'), visits: 8 }).kind, 'member');
  assert.equal(makeEvent('member', { user: user('demo_hana', '花子'), visits: 8 }).testVisits, 8);
  assert.match(fs.readFileSync('public/widgets/visitors.js', 'utf8'), /XMLHttpRequest/);
  assert.match(fs.readFileSync('public/widgets/visitors.js', 'utf8'), /WebSocket/);
  assert.match(fs.readFileSync('public/widgets/visitors.html', 'utf8'), /clip-path/);
  assert.doesNotMatch(fs.readFileSync('public/widgets/visitors.js', 'utf8'), /=>|\b(let|const)\b/);
});
