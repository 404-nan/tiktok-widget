import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeEffects } from '../src/effect-analysis.js';

test('効果ログを匿名の山・頻出・不足へ集計する', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-analysis-'));
  fs.writeFileSync(path.join(dir, 's.events.jsonl'), [
    { ts: 1000, kind: 'gift', coins: 10, actor: 'secret' },
    { ts: 61000, kind: 'effect', type: 'combo', actor: 'secret' },
    { ts: 62000, kind: 'gift', coins: 30, actor: 'secret' },
    { ts: 121000, kind: 'effect', type: 'combo' },
    { ts: 122000, kind: 'gift', coins: 40 },
  ].map(JSON.stringify).join('\n'));
  fs.writeFileSync(path.join(dir, 's.report.json'), JSON.stringify({ startedAt: 0, endedAt: 180000, durationMs: 180000, medianCoinsPerMinute: 30, effects: { combo: { count: 2, samples: [{ beforePerMinute: 10, afterPerMinute: 30, multiplier: 3 }] } } }));
  const result = analyzeEffects(dir, { sessionId: 's' });
  assert.equal(result.ok, true);
  assert.equal(result.peaks[0].coins, 40);
  assert.equal(result.frequentEffects[0].name, 'combo');
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test('片方が欠けた記録は推測せず不足理由を返す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-analysis-'));
  assert.equal(analyzeEffects(dir, { sessionId: 'missing' }).ok, false);
});
