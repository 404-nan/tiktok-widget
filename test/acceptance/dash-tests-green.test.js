// カード docs/cards/dash-tests-green.md の AC-1〜3 を確かめる受け入れテスト。
// AC-4(画面を直したときの写真)は人が見る証拠なので、ここでは書かない。
// 直す前(カードのコミット db74db8)の6ファイルを物差しにして、テストを消す・skip する・待ち時間を伸ばすだけの「通し方」を見つける。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;
const BASE = 'db74db8';
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
const FILES = [
  'redesign.test.js',
  'active-label.test.js',
  'media-pick.test.js',
  'media-pick-round2.test.js',
  'media-pick-round3.test.js',
  'puchun-dash-fix.test.js',
].map((f) => `test/acceptance/${f}`);

const now = (f) => readFileSync(`${root}${f}`, 'utf8');
const before = (f) => execFileSync('git', ['show', `${BASE}:${f}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 24 });
// test('名前' / browserTest('名前' の名前を全部取る
const names = (src) => [...src.matchAll(/^\s*(?:browserTest|test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gm)].map((m) => m[2]);
const timeouts = (src) => [...src.matchAll(/timeout:\s*([\d_]+)/g)].map((m) => Number(m[1].replace(/_/g, '')));

// 子の node --test を走らせ、要約の数字を返す
function runTests(args) {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, NODE_TEST_CONTEXT: undefined, DASH_TESTS_GREEN_CHILD: '1' },
  });
  const num = (k) => Number((r.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? NaN);
  const failed = [...r.stdout.matchAll(/^\s*not ok \d+ - (.*)$/gm)].map((m) => m[1]);
  return { status: r.status, tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'), failed };
}

// ---- AC-1: 落ちていた13件が通る(ファイルごとに見る) ----

for (const file of FILES) {
  test(`AC-1 ${file} の全テストが通り、飛ばされたものが無い`, { timeout: 900_000 }, () => {
    const r = runTests([`${root}${file}`]);
    assert.deepEqual(r.failed, [], `落ちているテスト: ${r.failed.join(' / ')}`);
    assert.equal(r.status, 0);
    assert.ok(r.tests > 0, 'テストが1件も走っていません');
    assert.equal(r.skipped, 0, 'skip されたテストがあります(playwright が使えないと通ったことになりません)');
    assert.equal(r.pass, r.tests);
  });
}

// ---- AC-2: 消す・skip・待ち時間を伸ばすだけ、で通していない ----

test('AC-2 ブラウザの道具(playwright)が使えて、ブラウザのテストが飛ばされない', async () => {
  const { chromium } = await import(PLAYWRIGHT);
  assert.ok(chromium, 'playwright の chromium が読めません');
});

for (const file of FILES) {
  test(`AC-2 ${file} は、テストを消しておらず、skip / todo / only を足さず、待ち時間を伸ばしていない`, () => {
    const old = before(file);
    const cur = now(file);

    const missing = names(old).filter((n) => !names(cur).includes(n));
    // 名前を直した場合は件数で見る(消したのではなく言い換えただけの可能性があるため)
    assert.ok(
      names(cur).length >= names(old).length,
      `テストが減っています(${names(old).length}→${names(cur).length})。名前が見つからない: ${missing.join(' / ')}`,
    );

    const skipCount = (s) => (s.match(/\.(?:skip|todo|only)\(|\b(?:skip|todo|only)\s*:/g) ?? []).length;
    assert.ok(skipCount(cur) <= skipCount(old), `skip / todo / only が増えています(${skipCount(old)}→${skipCount(cur)})`);
    assert.doesNotMatch(cur, /\bxit\(|\bxdescribe\(|\bxtest\(/, 'x付きの無効化があります');

    const oldMax = Math.max(0, ...timeouts(old));
    const curMax = Math.max(0, ...timeouts(cur));
    assert.ok(curMax <= oldMax, `待ち時間の上限が伸びています(${oldMax}→${curMax})`);
    assert.ok(
      timeouts(cur).length >= timeouts(old).length || curMax <= oldMax,
      'timeout の指定が変わっています',
    );
  });
}

test('AC-2 直した後のファイルでも、画面の言葉を確かめる assert が残っている(中身を空にしていない)', () => {
  for (const file of FILES) {
    const count = (s) => (s.match(/\bassert(?:\.\w+)?\(/g) ?? []).length;
    assert.ok(count(now(file)) >= Math.floor(count(before(file)) * 0.8), `${file} の assert が大きく減っています`);
  }
});

// ---- AC-3: npm test が全部通る ----
// 自分自身を含めて走らせると無限に入れ子になるので、自分を除いた全テストを走らせる。

test('AC-3 このファイルを除く全テスト(npm test と同じ並び)が通る', { timeout: 3_000_000 }, (t) => {
  if (process.env.DASH_TESTS_GREEN_CHILD) return t.skip('入れ子の実行では走らせない');
  const self = 'dash-tests-green.test.js';
  const all = [];
  const walk = (dir) => {
    for (const e of readdirSync(`${root}${dir}`, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (/\.test\.js$/.test(e.name) && e.name !== self) all.push(`${root}${dir}/${e.name}`);
    }
  };
  walk('test');
  const r = runTests(all);
  assert.deepEqual(r.failed, [], `落ちているテスト: ${r.failed.join(' / ')}`);
  assert.equal(r.fail, 0);
  assert.equal(r.status, 0);
});
