import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WIDGETS_TOOL = path.join(repoRoot, 'scripts', 'perf', 'widgets.mjs');
const CHROME = process.env.PERF_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-perf-ac-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const run = (args, env = {}) =>
  spawnSync(process.execPath, [WIDGETS_TOOL, ...args], { cwd: repoRoot, encoding: 'utf8', timeout: 180000, env: { ...process.env, ...env } });

test('AC-1 Chrome が見つからないときは日本語で理由を出して終了コード 2', () => {
  const r = run(['--quick', '--only', 'gift-alert'], { PERF_CHROME: path.join(tmp, 'no-such-chrome') });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout + r.stderr, /[\p{Script=Hiragana}\p{Script=Katakana}]/u);
});

test('AC-1 gift-alert を測って JSON に結果が入る', { skip: !fs.existsSync(CHROME) && 'Chrome が無い' }, () => {
  const jsonPath = path.join(tmp, 'widgets.json');
  const r = run(['--quick', '--only', 'gift-alert', '--json', jsonPath]);
  assert.ok([0, 1].includes(r.status), 'status=' + r.status + ' ' + r.stderr);
  assert.match(r.stdout, /gift-alert/);
  const text = fs.readFileSync(jsonPath, 'utf8');
  JSON.parse(text);
  assert.match(text, /gift-alert/);
});
