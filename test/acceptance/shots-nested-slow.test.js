// カード docs/cards/shots-nested-slow.md の AC-3 を確かめる受け入れテスト(AC-1・2・4・5 は shots-tmp の実行・README・全体の npm test で確かめる)。
// 環境変数 SHOTS_TMP_FULL が無いとき、shots-tmp.test.js の AC-3(写しの中で npm test 全部を走らせる)が skip になること。
// 直す前は AC-3 が本当に全体を走らせ始めるので、時間切れで「skip にならなかった」と落ちる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;

test('AC-3 SHOTS_TMP_FULL が無いとき、shots-tmp の AC-3 は理由つきで skip になる', () => {
  const env = { ...process.env };
  // 親の node --test の一部にならないように。SHOTS_TMP_FULL と入れ子の目印は無い状態で走らせる
  for (const name of ['NODE_TEST_CONTEXT', 'SHOTS_TMP_FULL', 'SHOTS_TMP_NESTED', 'SHOT_DIR']) delete env[name];
  // AC-3 だけを選ぶ。skip されれば一瞬で終わる。走ってしまうと全体の npm test が始まるので 120 秒で打ち切る
  const run = spawnSync(
    'node',
    ['--test', '--test-reporter=tap', '--test-name-pattern=AC-3', 'test/acceptance/shots-tmp.test.js'],
    { cwd: root, env, encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL' }
  );
  const out = `${run.stdout}\n${run.stderr}`;
  assert.ok(!run.error, `shots-tmp の AC-3 が 120 秒で終わりません(skip になっていません): ${run.error && run.error.message}`);
  assert.equal(run.status, 0, `shots-tmp.test.js の実行が失敗しました:\n${out}`);
  const skipLine = out.split('\n').find((line) => /^\s*ok \d+ - AC-3/.test(line) && /# SKIP/i.test(line));
  assert.ok(skipLine, `AC-3 が skip になっていません:\n${out}`);
  const reason = skipLine.split(/# SKIP/i)[1].trim();
  assert.ok(reason.length > 0, 'skip の理由が出ていません');
});
