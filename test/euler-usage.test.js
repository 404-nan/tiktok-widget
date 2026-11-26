import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EulerUsage } from '../src/euler-usage.js';

test('Euler の利用数を日付・配信者・種類ごとに保存する', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'euler-usage-'));
  try {
    const file = path.join(dir, 'euler-usage.json');
    const usage = new EulerUsage(file, { now: () => Date.parse('2026-10-24T12:00:00Z') });
    usage.record('@alice', 'connect');
    usage.record('alice', 'gifts');
    usage.record('alice', 'not-a-kind');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      '2026-10-24': { alice: { connect: 1, gifts: 1 } },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('互換記録を書けなくても、呼び出し側へ例外を返さない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'euler-usage-blocked-'));
  try {
    const blocked = path.join(dir, 'blocked');
    fs.writeFileSync(blocked, 'file');
    const usage = new EulerUsage(path.join(blocked, 'euler-usage.json'));
    assert.doesNotThrow(() => usage.record('alice', 'connect'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
