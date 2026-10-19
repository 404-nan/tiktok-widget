// Chrome headless で実際のウィジェットを動かし、DOM と AudioContext の計測値を確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromePath } from '../../scripts/perf/lib/chrome.mjs';

test('AC-3: Chrome がある環境では DOM と AudioContext の後片付けを実測する', { skip: !hasChrome() }, async (t) => {
  const output = path.join(process.cwd(), `.perf-cleanup-${process.pid}.json`);
  const result = spawnSync(process.execPath, ['scripts/perf/widgets.mjs', '--quick', '--only', 'gift-alert', '--json', output], { encoding: 'utf8' });
  if (result.status === 2) return t.skip('Chrome が見つかりません');
  try {
    if (result.status !== 0 && result.status !== 1) throw new Error(result.stdout + result.stderr);
    const row = JSON.parse(fs.readFileSync(output, 'utf8')).rows[0];
    assert.ok(Number.isFinite(row.domStart));
    assert.ok(Number.isFinite(row.domEnd));
    assert.ok(Number.isFinite(row.audioContexts));
  } finally {
    if (fs.existsSync(output)) fs.rmSync(output, { force: true });
  }
});

function hasChrome() {
  return fs.existsSync(chromePath());
}
