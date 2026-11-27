// AI の共通の記憶へ載せる短い Markdown の書き出しを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildErrorDigest } from '../scripts/errors-digest.mjs';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function row({ ts, fingerprint, kind = 'tiktok.connect', message = '失敗', countTenant = 'ta', repeat = 0 }) {
  return {
    ts,
    service: 'raikone',
    env: 'prod',
    version: '1.4.1',
    level: 'error',
    kind,
    where: { file: 'src/tiktok.js', fn: 'connect', line: 231 },
    message,
    stack: [],
    context: { tenant: countTenant },
    fingerprint,
    ...(repeat ? { repeat } : {}),
  };
}

function writeLog(dir, rows) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'errors-2026-11-27.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

test('作り物の記録から、状態つきの短い Markdown を作る', () => {
  const dir = tmp('tw-errors-digest-');
  writeLog(dir, [
    row({ ts: '2026-11-27T01:00:00.000Z', fingerprint: 'aaaa11111111', message: 'まだの失敗\n続きの行' }),
    row({ ts: '2026-11-27T02:00:00.000Z', fingerprint: 'bbbb22222222', message: 'また出た失敗', repeat: 2, countTenant: 'tb' }),
  ]);
  const fixesFile = path.join(dir, 'fixes.json');
  fs.writeFileSync(fixesFile, JSON.stringify({ fixes: [
    { fingerprint: 'bbbb22222222', summary: '一度直した失敗', fixedIn: 'commit abc', fixedAt: '2026-11-26', test: { file: 'test/x.test.js', name: '守るテスト' } },
  ] }));
  const md = buildErrorDigest({ dir, days: 7, max: 20, now: Date.parse('2026-11-27T03:00:00.000Z'), fixesFile });
  assert.match(md, /^# エラーのまとめ/m);
  assert.match(md, /いま起きているエラー/);
  assert.match(md, /直したエラーと、守っているテスト/);
  assert.ok(md.indexOf('また出た失敗') < md.indexOf('まだの失敗'), 'regressed を先に出す');
  assert.match(md, /3回/);
  assert.match(md, /1人の配信者で/);
  assert.match(md, /まだの失敗 続きの行/);
  assert.equal(md.includes('まだの失敗\n続きの行'), false);
  assert.match(md, /一度直した失敗/);
  assert.match(md, /守るテスト/);
});

test('書き出しは60行までで、鍵らしい文字を出さない', () => {
  const dir = tmp('tw-errors-digest-max-');
  const rows = [];
  for (let i = 0; i < 80; i += 1) {
    rows.push(row({
      ts: `2026-11-27T01:${String(i % 60).padStart(2, '0')}:00.000Z`,
      fingerprint: `cccc${String(i).padStart(8, '0')}`.slice(0, 12),
      kind: `kind${i}`,
      message: `失敗${i} token=secret${i} /t/abcdef1234567890abcdef12/ user@example.com abcdefghijklmnopqrstuvwxyz123456`,
    }));
  }
  writeLog(dir, rows);
  const md = buildErrorDigest({ dir, days: 7, max: 80, now: Date.parse('2026-11-27T03:00:00.000Z'), fixesFile: path.join(dir, 'none.json') });
  assert.ok(md.trim().split('\n').length <= 60);
  assert.equal(md.includes('secret0'), false);
  assert.equal(md.includes('abcdef1234567890abcdef12'), false);
  assert.equal(md.includes('user@example.com'), false);
  assert.equal(md.includes('abcdefghijklmnopqrstuvwxyz123456'), false);
});
