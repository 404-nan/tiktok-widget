import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DrawResults } from '../src/draw-results.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'draw-results-test-'));
}

test('add した順と逆順（新しい順）で list が返る', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'results.jsonl');
  const dr = new DrawResults(file);
  dr.add({ kind: 'a', user: 'u1', result: 'r1' });
  dr.add({ kind: 'a', user: 'u2', result: 'r2' });
  dr.add({ kind: 'a', user: 'u3', result: 'r3' });
  const list = dr.list();
  assert.equal(list.length, 3);
  assert.equal(list[0].user, 'u3');
  assert.equal(list[1].user, 'u2');
  assert.equal(list[2].user, 'u1');
});

test('kind で絞れる', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'results.jsonl');
  const dr = new DrawResults(file);
  dr.add({ kind: 'a', user: 'u1', result: 'r1' });
  dr.add({ kind: 'b', user: 'u2', result: 'r2' });
  dr.add({ kind: 'a', user: 'u3', result: 'r3' });
  const aList = dr.list('a');
  assert.equal(aList.length, 2);
  assert.deepEqual(aList.map((e) => e.user), ['u3', 'u1']);
  const bList = dr.list('b');
  assert.equal(bList.length, 1);
  assert.equal(bList[0].user, 'u2');
});

test('limit で件数が制限される', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'results.jsonl');
  const dr = new DrawResults(file);
  for (let i = 0; i < 10; i++) {
    dr.add({ kind: 'a', user: `u${i}`, result: `r${i}` });
  }
  const list = dr.list(undefined, 4);
  assert.equal(list.length, 4);
  assert.deepEqual(list.map((e) => e.user), ['u9', 'u8', 'u7', 'u6']);
});

test('keep を超えたら古いものが落ちる', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'results.jsonl');
  const dr = new DrawResults(file, { keep: 3 });
  dr.add({ kind: 'a', user: 'u1', result: 'r1' });
  dr.add({ kind: 'a', user: 'u2', result: 'r2' });
  dr.add({ kind: 'a', user: 'u3', result: 'r3' });
  dr.add({ kind: 'a', user: 'u4', result: 'r4' });
  const list = dr.list();
  assert.equal(list.length, 3);
  assert.equal(list[0].user, 'u4');
  assert.equal(list[1].user, 'u3');
  assert.equal(list[2].user, 'u2');
});

test('新しいインスタンスを作ると、保存済みの内容が読み戻せる', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'results.jsonl');
  const dr1 = new DrawResults(file);
  dr1.add({ kind: 'a', user: 'u1', result: 'r1' });
  dr1.add({ kind: 'a', user: 'u2', result: 'r2' });
  const dr2 = new DrawResults(file);
  const list = dr2.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].user, 'u2');
  assert.equal(list[1].user, 'u1');
});

test('ファイルに壊れた行が混ざっていても読み戻せる', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'results.jsonl');
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ ts: 1, kind: 'a', user: 'u1', result: 'r1' }),
      'not-json-line',
      JSON.stringify({ ts: 2, kind: 'a', user: 'u2', result: 'r2' }),
      '',
    ].join('\n')
  );
  const dr = new DrawResults(file);
  const list = dr.list();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((e) => e.user), ['u2', 'u1']);
});

test('ファイルが無い状態から始められる', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'no-such-results.jsonl');
  const dr = new DrawResults(file);
  assert.deepEqual(dr.list(), []);
  dr.add({ kind: 'a', user: 'u1', result: 'r1' });
  assert.equal(dr.list().length, 1);
});

test('add した行に ts（数値）が付いている', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'results.jsonl');
  const dr = new DrawResults(file);
  const before = Date.now();
  dr.add({ kind: 'a', user: 'u1', result: 'r1' });
  const after = Date.now();
  const list = dr.list();
  assert.equal(list.length, 1);
  assert.equal(typeof list[0].ts, 'number');
  assert.ok(list[0].ts >= before && list[0].ts <= after);
});
