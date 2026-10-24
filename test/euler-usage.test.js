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
