// 効果ログの匿名化・まとめ書き・配信後レポートを確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EffectLog, actorDigest, makeEffectReport } from '../src/effect-log.js';

test('ギフトは匿名の送信者番号と回数だけを残す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-effect-'));
  const log = new EffectLog(dir, { secret: 'secret' });
  log.start('s1', 0);
  log.gift({ kind: 'gift', ts: 1, user: { id: 'user-1', name: '表示名' }, totalDiamonds: 10, gift: { id: 7, name: 'Rose', diamonds: 10, count: 1 } });
  log.gift({ kind: 'gift', ts: 2, user: { id: 'user-1', name: '表示名' }, totalDiamonds: 10, gift: { id: 7, name: 'Rose', diamonds: 10, count: 1 } });
  log.end(1000);
  const text = fs.readFileSync(path.join(dir, 's1.events.jsonl'), 'utf8');
  assert.match(text, new RegExp(actorDigest('secret', 'user-1')));
  assert.doesNotMatch(text, /user-1|表示名/);
  assert.match(text, /"ordinal":2/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 's1.report.json'))).durationMs, 1000);
});

test('演出ごとに前後のコインと倍率をまとめる', () => {
  const report = makeEffectReport([
    { kind: 'gift', ts: 60_000, coins: 10 },
    { kind: 'gift', ts: 120_000, coins: 20 },
    { kind: 'effect', type: 'roulette', ts: 120_000 },
    { kind: 'gift', ts: 120_001, coins: 30 },
  ], { startedAt: 0, endedAt: 180_000 });
  assert.equal(report.effects.roulette.count, 1);
  assert.equal(report.effects.roulette.samples[0].afterPerMinute, 25);
});

test('フォローとシェアも匿名で記録される', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-effect-'));
  const log = new EffectLog(dir, { secret: 'secret' });
  log.start('s1', 0);
  log.audience({ kind: 'follow', ts: 5, user: { id: 'user-9', name: '誰か' } });
  log.audience({ kind: 'share', ts: 6, user: { id: 'user-9', name: '誰か' } });
  log.audience({ kind: 'gift', ts: 7, user: { id: 'user-9', name: '誰か' } });
  log.end(1000);
  const lines = fs.readFileSync(path.join(dir, 's1.events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((e) => e.kind), ['follow', 'share'], 'ギフト以外は audience の対象だけが残る');
  assert.equal(lines[0].actor, actorDigest('secret', 'user-9'));
  assert.equal(lines[1].actor, actorDigest('secret', 'user-9'));
  assert.doesNotMatch(JSON.stringify(lines), /user-9|誰か/);
});

test('古い記録ファイルは、配信が終わっても消えない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-effect-'));
  const oldEvents = path.join(dir, 'old-session.events.jsonl');
  const oldReport = path.join(dir, 'old-session.report.json');
  fs.writeFileSync(oldEvents, '{"ts":1,"kind":"gift"}\n');
  fs.writeFileSync(oldReport, '{}');
  const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldEvents, longAgo, longAgo);
  fs.utimesSync(oldReport, longAgo, longAgo);
  const log = new EffectLog(dir, { secret: 'secret' });
  log.start('s2', 0);
  log.gift({ kind: 'gift', ts: 1, user: { id: 'u', name: 'n' }, totalDiamonds: 1, gift: { id: 1, name: 'Rose', diamonds: 1, count: 1 } });
  log.end(1000);
  assert.ok(fs.existsSync(oldEvents), '古いイベント記録が残る');
  assert.ok(fs.existsSync(oldReport), '古いレポートが残る');
});
