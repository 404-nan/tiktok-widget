import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JUDGE = path.join(repoRoot, 'scripts', 'perf', 'lib', 'judge.mjs');
const LIMITS = path.join(repoRoot, 'scripts', 'perf', 'limits.json');

// 判定関数は judge.mjs の judge(測った数字, 上限) → { ok, reasons[] }
const limits = { cpuPercent: 30, heapGrowthMB: 20, droppedFramePercent: 5 };
const good = { cpuPercent: 10, heapGrowthMB: 5, droppedFramePercent: 1 };

const load = async () => (await import(pathToFileURL(JUDGE).href)).judge;

test('AC-4 上限内の数字は「よし」', async () => {
  const r = (await load())(good, limits);
  assert.equal(r.ok, true);
  assert.deepEqual(r.reasons, []);
});

for (const [key, label] of [['cpuPercent', 'CPU'], ['heapGrowthMB', 'ヒープ'], ['droppedFramePercent', 'フレーム']]) {
  test('AC-4 ' + key + ' だけ超えたら「だめ」と理由つき', async () => {
    const r = (await load())({ ...good, [key]: limits[key] + 1 }, limits);
    assert.equal(r.ok, false);
    assert.equal(r.reasons.length, 1);
    assert.match(r.reasons[0], new RegExp(label));
  });
  test('AC-4 ' + key + ' がちょうど上限なら「よし」(上限以下は合格)', async () => {
    const r = (await load())({ ...good, [key]: limits[key] }, limits);
    assert.equal(r.ok, true);
  });
}

test('AC-4 複数超えたら理由も複数', async () => {
  const r = (await load())({ cpuPercent: 99, heapGrowthMB: 99, droppedFramePercent: 99 }, limits);
  assert.equal(r.ok, false);
  assert.equal(r.reasons.length, 3);
});

test('AC-3 limits.json に CPU・ヒープ増加・落ちたフレーム・サーバー送信バイトの上限がある', () => {
  const text = fs.readFileSync(LIMITS, 'utf8');
  const json = JSON.parse(text);
  assert.ok(Object.keys(json).length > 0);
  assert.match(text, /cpu/i);
  assert.match(text, /heap/i);
  assert.match(text, /drop|frame/i);
  assert.match(text, /byte/i);
});
