import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { defaultsFor } from '../src/schema.js';
import { parseText } from '../src/config.js';
import { DEFAULT_WIDGETS } from '../src/tenants.js';
import { FEATURES, OBS_ALLOWED } from '../src/runtime.js';
import { SlotEngine, rollSlot } from '../src/slot.js';

const config = defaultsFor('slots');

test('役表の重みどおりに結果を引く', () => {
  const counts = { lose: 0, small: 0, big: 0, jackpot: 0 };
  for (let i = 0; i < 50000; i++) counts[rollSlot(config).payout.tier]++;
  assert.ok(Math.abs(counts.lose / 50000 - 0.70) < 0.025, JSON.stringify(counts));
  assert.ok(Math.abs(counts.small / 50000 - 0.20) < 0.02, JSON.stringify(counts));
  assert.ok(Math.abs(counts.big / 50000 - 0.09) < 0.015, JSON.stringify(counts));
  assert.ok(Math.abs(counts.jackpot / 50000 - 0.01) < 0.008, JSON.stringify(counts));
});

test('演出率を変えても、先に決めた役の並びは変わらない', () => {
  const values = [100, 900000, 200000, 700000, 400000, 800000, 300000, 600000];
  const sequence = () => {
    let i = 0;
    return () => values[i++ % values.length];
  };
  const low = [];
  const high = [];
  const noFx = { ...config, revivalRate: 0, nearMissRate: 0 };
  const allFx = { ...config, revivalRate: 100, nearMissRate: 100 };
  const lowRandom = sequence();
  const highRandom = sequence();
  for (let i = 0; i < 200; i++) {
    low.push(rollSlot(noFx, lowRandom).tier);
    high.push(rollSlot(allFx, highRandom).tier);
  }
  assert.deepEqual(high, low);
});

test('待ち行列に上限はなく、投げた分は捨てない', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const slot = new SlotEngine(hub, { randomInt: () => 0 });
  slot.setConfig({ ...config, reelStopMs: 10000 });
  slot.start({ id: 'first' });
  for (let i = 0; i < 100; i++) slot.start({ id: i });
  assert.equal(slot.snapshot().pending, 100);
  slot.close();
});

test('slots が無い古い設定でも正規化できる', () => {
  const out = parseText('gacha:\n  enabled: true\n');
  assert.deepEqual(out.errors, []);
  assert.equal(out.config.slots.revivalRate, 20);
});

test('既存テナントの既定 widgets に slots を追加せず、OBS からはスロット状態を読める', () => {
  assert.equal(DEFAULT_WIDGETS.includes('slots'), false);
  assert.equal(FEATURES.slots.pages.includes('slot.html'), true);
  assert.equal(OBS_ALLOWED.some((rule) => rule.test('/api/slot')), true);
  const all = fs.readFileSync(new URL('../public/widgets/all.html', import.meta.url), 'utf8');
  assert.match(all, /me\.widgets\?\.includes\(section\)/);
  assert.match(all, /const objects = new Set\(\['slots'\]\)/);
});

test('結果は必要な開示項目を持つ', () => {
  const out = rollSlot(config, () => 0);
  assert.deepEqual(Object.keys(out).sort(), ['nearMiss', 'payout', 'reach', 'revival', 'symbols', 'tier'].sort());
  assert.equal(out.symbols.length, 3);
});
