// 性能改善の受け入れ条件。Chrome がある環境では画面要素が連打後に増え続けないことを確認する。

import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

test('AC-3: Chrome があるときだけ、ウィジェットの後片付け計測を実行する', { skip: !hasChrome() }, async (t) => {
  const result = spawnSync(process.execPath, ['scripts/perf/widgets.mjs', '--quick', '--only', 'gift-alert'], { encoding: 'utf8' });
  if (result.status === 2) return t.skip('Chrome が見つかりません');
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
});

function hasChrome() {
  const executable = process.env.PERF_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  return fs.existsSync(executable);
}
