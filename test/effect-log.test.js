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
  log.gift({ kind: 'gift', ts: 1, user: { id: 'user-1', name: '表示名' }, gift: { id: 7, name: 'Rose' }, coins: 10 });
  log.gift({ kind: 'gift', ts: 2, user: { id: 'user-1', name: '表示名' }, gift: { id: 7, name: 'Rose' }, coins: 10 });
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
