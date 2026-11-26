// エラー記録の JSONL 形式、伏せ字、まとめ、集計を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createErrorLog, scrub, fingerprintOf } from '../src/error-log.js';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const dayFile = (dir, date = '2026-11-27') => path.join(dir, `errors-${date}.jsonl`);
const readRows = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

test('決まった形の行を日本時間の日付ファイルに 0600 で書き、秘密を伏せる', () => {
  const dir = tmp('tw-error-log-');
  const now = () => Date.parse('2026-11-27T04:23:00.000Z');
  const log = createErrorLog({ dir, env: 'dev', version: '9.9.9', now });
  const err = new Error('ギフト一覧を取得できませんでした: token=abc123 /t/abcdef1234567890/ user@example.com');
  const row = log.record(err, {
    kind: 'tiktok.connect',
    where: { file: 'src/tiktok.js', fn: 'connect', line: 231 },
    context: { tenant: 't123abc', widget: 'omikuji', op: 'gifts.refresh', note: 'key=secret123' },
    cause: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
  });

  assert.equal(row.ts, '2026-11-27T04:23:00.000Z');
  assert.equal(row.service, 'raikone');
  assert.equal(row.env, 'dev');
  assert.equal(row.version, '9.9.9');
  assert.equal(row.level, 'error');
  assert.equal(row.kind, 'tiktok.connect');
  assert.deepEqual(row.where, { file: 'src/tiktok.js', fn: 'connect', line: 231 });
  assert.equal(row.context.tenant, 't123abc');
  assert.equal(row.context.widget, 'omikuji');
  assert.match(row.fingerprint, /^[0-9a-f]{12}$/);
  assert.ok(Array.isArray(row.stack));
  assert.ok(row.stack.length <= 8);

  const file = dayFile(dir);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const rows = readRows(file);
  assert.equal(rows.length, 1);
  const text = JSON.stringify(rows[0]);
  assert.equal(text.includes('abc123'), false);
  assert.equal(text.includes('abcdef1234567890'), false);
  assert.equal(text.includes('user@example.com'), false);
  assert.equal(text.includes('abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(text.includes('secret123'), false);
  assert.equal(rows[0].context.note, 'key=***');
});

test('where は渡した値を優先し、無ければ stack のこのリポジトリの一番上の行から取る', () => {
  const dir = tmp('tw-error-log-where-');
  const log = createErrorLog({ dir, now: () => 0 });
  const err = new Error('boom');
  err.stack = `Error: boom\n    at connect (${process.cwd()}/src/tiktok.js:231:13)\n    at refresh (${process.cwd()}/src/gifts.js:201:5)\n    at /home/other/node_modules/x.js:1:1`;
  const inferred = log.record(err, { kind: 'tiktok.connect' });
  assert.deepEqual(inferred.where, { file: 'src/tiktok.js', fn: 'connect', line: 231 });
  assert.deepEqual(inferred.stack[0], 'at connect (src/tiktok.js:231:13)');
  assert.deepEqual(inferred.stack[2], 'at <external>/x.js:1:1');

  const explicit = log.record(err, { kind: 'tiktok.connect', where: { file: 'src/custom.js', fn: 'custom', line: 7 } });
  assert.deepEqual(explicit.where, { file: 'src/custom.js', fn: 'custom', line: 7 });
});

test('fingerprint は数字や ID をならし、同じ種類を同じ鍵にする', () => {
  const where = { file: 'src/gifts.js', fn: 'refresh', line: 20 };
  const a = fingerprintOf({ service: 'raikone', kind: 'tiktok.connect', where, message: 'room 12345 gift 67890 で失敗' });
  const b = fingerprintOf({ service: 'raikone', kind: 'tiktok.connect', where, message: 'room 99999 gift 11111 で失敗' });
  const c = fingerprintOf({ service: 'raikone', kind: 'tiktok.event', where, message: 'room 12345 gift 67890 で失敗' });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{12}$/);
});

test('scrub は /t/<鍵>・key/token/sign/Authorization・長い英数字・メールを伏せる', () => {
  const input = 'GET /t/abcdef1234567890abcdef12/widgets/?token=tok123&key=key123&sign=sig123 mail a-b@example.com id abcdefghijklmnopqrstuvwxyz123456 Authorization: Bearer headervalue';
  const out = scrub(input);
  assert.equal(out.includes('abcdef1234567890abcdef12'), false);
  assert.equal(out.includes('tok123'), false);
  assert.equal(out.includes('key123'), false);
  assert.equal(out.includes('sig123'), false);
  assert.equal(out.includes('a-b@example.com'), false);
  assert.equal(out.includes('abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(out.includes('headervalue'), false);
  assert.match(out, /\/t\/\*\*\*\//);
});

test('同じ fingerprint は1分に1行までで、間の回数は次の行の repeat に入る', () => {
  const dir = tmp('tw-error-log-repeat-');
  let at = Date.parse('2026-11-27T04:23:00.000Z');
  const log = createErrorLog({ dir, now: () => at });
  const make = () => new Error('同じ失敗 12345');
  const opts = { kind: 'store.write', where: { file: 'src/points.js', fn: 'save', line: 349 } };
  assert.ok(log.record(make(), opts));
  assert.equal(log.record(make(), opts), null);
  assert.equal(log.record(make(), opts), null);
  at += 61_000;
  const next = log.record(make(), opts);
  assert.equal(next.repeat, 2);
  const rows = readRows(dayFile(dir));
  assert.equal(rows.length, 2);
  assert.equal(rows[1].repeat, 2);
});

test('groups は回数・配信者数・最初と最後・open/fixed/regressed を集計する', () => {
  const dir = tmp('tw-error-log-groups-');
  let at = Date.parse('2026-11-20T01:00:00.000Z');
  const log = createErrorLog({ dir, now: () => at });
  const where = { file: 'src/tiktok.js', fn: 'connect', line: 231 };
  const a1 = log.record(new Error('A 1'), { kind: 'tiktok.connect', where, context: { tenant: 'ta' } });
  at += 61_000;
  log.record(new Error('A 2'), { kind: 'tiktok.connect', where, context: { tenant: 'tb' } });
  at += 61_000;
  const a3 = log.record(new Error('A 3'), { kind: 'tiktok.connect', where, context: { tenant: 'ta' } });
  log.record(new Error('B'), { kind: 'store.read', where: { file: 'src/points.js', fn: 'load', line: 326 }, level: 'warn' });

  const groups = log.groups({
    sinceMs: 0,
    fixes: [{ fingerprint: a1.fingerprint, summary: '直した', fixedIn: 'test', fixedAt: '2026-11-19', test: { file: 'test/x.test.js', name: 'x' } }],
  });
  const a = groups.find((g) => g.fingerprint === a1.fingerprint);
  const b = groups.find((g) => g.kind === 'store.read');
  assert.equal(a.count, 3);
  assert.equal(a.tenants, 2);
  assert.equal(a.firstTs, a1.ts);
  assert.equal(a.lastTs, a3.ts);
  assert.equal(a.status, 'regressed');
  assert.equal(b.status, 'open');
  assert.equal(b.level, 'warn');

  const fixedGroups = log.groups({
    sinceMs: 0,
    fixes: [{ fingerprint: a1.fingerprint, summary: '直した', fixedIn: 'test', fixedAt: '2026-12-31', test: { file: 'test/x.test.js', name: 'x' } }],
  });
  assert.equal(fixedGroups.find((g) => g.fingerprint === a1.fingerprint).status, 'fixed');
});

test('recent は新しい順に返し、limit を効かせる', () => {
  const dir = tmp('tw-error-log-recent-');
  let at = Date.parse('2026-11-27T00:00:00.000Z');
  const log = createErrorLog({ dir, now: () => at });
  log.record(new Error('古い'), { kind: 'one', where: { file: 'src/a.js', fn: 'a', line: 1 } });
  at += 61_000;
  log.record(new Error('新しい'), { kind: 'two', where: { file: 'src/b.js', fn: 'b', line: 2 } });
  const rows = log.recent({ sinceMs: 0 });
  assert.equal(rows[0].message, '新しい');
  assert.equal(rows[1].message, '古い');
  assert.equal(log.recent({ sinceMs: 0, limit: 1 }).length, 1);
});

test('置き場に書けなくても record は例外を出さず、console.error に1行だけ残す', () => {
  const root = tmp('tw-error-log-blocked-');
  const blocker = path.join(root, 'file');
  fs.writeFileSync(blocker, 'x');
  const log = createErrorLog({ dir: path.join(blocker, 'errors'), now: () => 0 });
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try {
    assert.equal(log.record(new Error('書けない'), { kind: 'store.write' }), null);
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /error-log/);
});
