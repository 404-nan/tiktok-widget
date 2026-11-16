import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionDetails } from '../src/session-details.js';

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tw-details-'));
}

test('記録が配信単位のファイルに全部残り、新しい順に読める', () => {
  const dir = makeDir();
  const details = new SessionDetails(dir);
  details.start('s1');
  details.record({ ts: 1, kind: 'gift', user: { name: 'A' } });
  details.record({ ts: 2, kind: 'follow', user: { name: 'B' } });
  details.record({ ts: 3, kind: 'gift', user: { name: 'C' } });
  details.end();
  const { total, items } = details.read('s1');
  assert.equal(total, 3);
  assert.deepEqual(items.map((e) => e.ts), [3, 2, 1]);
  details.close();
});

test('種類で絞れる・ページ単位で取れる', () => {
  const dir = makeDir();
  const details = new SessionDetails(dir);
  details.start('s1');
  for (let i = 1; i <= 10; i++) details.record({ ts: i, kind: 'gift', user: { name: `u${i}` } });
  details.record({ ts: 11, kind: 'follow', user: { name: 'f1' } });
  details.end();
  const gifts = details.read('s1', { kind: 'gift', offset: 0, limit: 4 });
  assert.equal(gifts.total, 10);
  assert.deepEqual(gifts.items.map((e) => e.ts), [10, 9, 8, 7]);
  const rest = details.read('s1', { kind: 'gift', offset: 4, limit: 100 });
  assert.deepEqual(rest.items.map((e) => e.ts), [6, 5, 4, 3, 2, 1]);
  const follows = details.read('s1', { kind: 'follow' });
  assert.equal(follows.total, 1);
  details.close();
});

test('今の配信は、書き出し前の分も読み出しに含まれる', () => {
  const dir = makeDir();
  const details = new SessionDetails(dir);
  details.start('s1');
  details.record({ ts: 1, kind: 'gift', user: { name: 'A' } });
  // flush のタイマーを待たずに読む
  const { total, items } = details.read('s1');
  assert.equal(total, 1);
  assert.equal(items[0].user.name, 'A');
  details.close();
});

test('記録の無い配信は空で返る・配信が変わると前の配信に混ざらない', () => {
  const dir = makeDir();
  const details = new SessionDetails(dir);
  assert.deepEqual(details.read('nope'), { total: 0, items: [] });
  details.start('s1');
  details.record({ ts: 1, kind: 'gift', user: { name: 'A' } });
  details.start('s2');
  details.record({ ts: 2, kind: 'gift', user: { name: 'B' } });
  details.end();
  assert.equal(details.read('s1').total, 1);
  assert.equal(details.read('s1').items[0].user.name, 'A');
  assert.equal(details.read('s2').total, 1);
  details.close();
});

test('recordTo は、終わった配信のファイルへ直接書ける', () => {
  const dir = makeDir();
  const details = new SessionDetails(dir);
  details.start('s1');
  details.end();
  details.recordTo('s1', { ts: 9, kind: 'roulette', result: '歌う' });
  const { total, items } = details.read('s1');
  assert.equal(total, 1);
  assert.equal(items[0].result, '歌う');
  details.close();
});

test('書き込みに失敗しても、記録はキューに残って次に書ける', () => {
  const dir = makeDir();
  const details = new SessionDetails(dir);
  details.start('s1');
  details.record({ ts: 1, kind: 'gift', user: { name: 'A' } });
  // 書き込み先としてファイルが存在する場所を指定して、書き込みを失敗させる
  const badDir = path.join(dir, 'blocked');
  fs.writeFileSync(badDir, 'x');
  details.dir = badDir;
  details.flush();
  assert.equal(details.queue.length, 1, '失敗した分はキューに残る');
  details.dir = path.join(dir, 'ok');
  details.flush();
  assert.equal(details.queue.length, 0);
  assert.equal(details.read('s1').total, 1);
  details.close();
});
