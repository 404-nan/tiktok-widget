import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { History } from '../src/history.js';

function withEnv(value, fn) {
  const before = process.env.TW_ENV;
  const beforePort = process.env.PORT;
  if (value === undefined) delete process.env.TW_ENV;
  else process.env.TW_ENV = value;
  if (value === 'dev') process.env.PORT = '3940';
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TW_ENV;
    else process.env.TW_ENV = before;
    if (value === 'dev') {
      if (beforePort === undefined) delete process.env.PORT;
      else process.env.PORT = beforePort;
    }
  }
}

test('開発環境の配信前テスト送信はデモ配信として記録する', () => {
  withEnv('dev', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
    const hub = new Hub();
    const history = new History(hub, dir);
    clearInterval(history.timer);

    hub.publish({ kind: 'follow', user: { id: 'demo_a', name: 'A' }, test: true });
    assert.equal(history.current?.demo, true);
    assert.equal(history.current.username, null);
    assert.equal(history.current.totals.follows, 1);

    hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { test: true } });
    assert.equal(history.current.toJSON().roulettes[0].spins, 1);
  });
});

test('開発環境でセッションがないときのテストルーレットはデモ配信を始める', () => {
  withEnv('dev', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
    const hub = new Hub();
    const history = new History(hub, dir);
    clearInterval(history.timer);

    hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { test: true } });
    assert.equal(history.current?.demo, true);
    assert.equal(history.current.toJSON().roulettes[0].results[0].label, '歌う');
  });
});

test('本番では配信前のテスト送信を記録しない', () => {
  withEnv(undefined, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
    const hub = new Hub();
    const history = new History(hub, dir);
    clearInterval(history.timer);

    hub.publish({ kind: 'follow', user: { id: 'demo_a', name: 'A' }, test: true });
    hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { test: true } });
    assert.equal(history.current, null);
    assert.deepEqual(history.list(), []);
  });
});
