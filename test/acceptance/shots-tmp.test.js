// カード docs/cards/shots-tmp.md の AC-1〜4 を確かめる受け入れテスト(AC-5 の npm test 全部通るは全体の実行で確かめる)。
// テストを走らせても repo の中のファイルが変わらないこと。作業ツリーを一時の場所へ写し、そこで本物の npm test を走らせて git status を見る。
// 写した先でもこのテストが入っているので、入れ子の実行では環境変数 SHOTS_TMP_NESTED で自分を飛ばす(無限に呼び合わないため)。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;
const NESTED = process.env.SHOTS_TMP_NESTED === '1';
const nestedTest = (name, fn) => test(name, { timeout: 900_000, skip: NESTED && '入れ子の実行では自分を飛ばす' }, fn);

// node_modules は repo の外にある本物を使う(写さない)。見つからなければ失敗にする
function findNodeModules() {
  const candidates = [path.join(root, 'node_modules'), '/home/lul/tiktok-widget/node_modules'];
  return candidates.find((dir) => fs.existsSync(dir));
}

// 作業ツリー(未コミットの変更を含む)を一時の場所へ写し、コミットして「きれいなチェックアウト」にする
function cleanCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-tmp-copy-'));
  fs.cpSync(root, dir, { recursive: true, filter: (src) => !['node_modules', 'data', '.git'].includes(path.basename(src)) || src === root });
  const nodeModules = findNodeModules();
  assert.ok(nodeModules, 'node_modules が見つかりません');
  fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'));
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });
  // .git は写さず別の repo にする。作業場所の .git はファイルで、写すと本物の履歴にコミットが積まれる
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'copy');
  return { dir, git };
}

const cleanEnv = (extra = {}) => {
  const env = { ...process.env, SHOTS_TMP_NESTED: '1', ...extra };
  delete env.NODE_TEST_CONTEXT; // 入れ子の node --test が親のテストの一部にならないように
  if (!('SHOT_DIR' in extra)) delete env.SHOT_DIR;
  return env;
};

nestedTest('AC-1 SHOT_DIR を決めると写真はそこへ書かれ、repo の中の写真は変わらない', () => {
  const { dir, git } = cleanCopy();
  const shotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-tmp-out-'));
  const run = spawnSync('node', ['--test', 'test/acceptance/puchun-e2e.test.js'], { cwd: dir, env: cleanEnv({ SHOT_DIR: shotDir }), encoding: 'utf8' });
  assert.equal(run.status, 0, `puchun-e2e が通りません:\n${run.stdout}\n${run.stderr}`);
  const photos = fs.readdirSync(shotDir).filter((name) => name.endsWith('.png'));
  assert.ok(photos.length > 0, `SHOT_DIR(${shotDir}) に写真がありません`);
  assert.ok(photos.every((name) => fs.statSync(path.join(shotDir, name)).size > 0), 'SHOT_DIR の写真が空です');
  assert.equal(git('status', '--porcelain').trim(), '', 'SHOT_DIR を決めたのに repo の中が変わりました');
});

nestedTest('AC-1 SHOT_DIR が無いときも、写真は repo の外(os.tmpdir() の下)へ書かれる', () => {
  const { dir, git } = cleanCopy();
  const run = spawnSync('node', ['--test', 'test/acceptance/puchun-e2e.test.js'], { cwd: dir, env: cleanEnv(), encoding: 'utf8' });
  assert.equal(run.status, 0, `puchun-e2e が通りません:\n${run.stdout}\n${run.stderr}`);
  assert.equal(git('status', '--porcelain').trim(), '', 'SHOT_DIR が無いときに repo の中が変わりました');
});

test('AC-2 puchun-e2e は写真が空でないことの確かめを残している', () => {
  const source = fs.readFileSync(path.join(root, 'test/acceptance/puchun-e2e.test.js'), 'utf8');
  assert.match(source, /statSync\(SHOT\)\.size\s*>\s*0/, '写真が空でないことの assert が無くなっています');
  assert.match(source, /画面の写真が空です/);
});

nestedTest('AC-3 きれいなチェックアウトで npm test を走らせたあと、git status --porcelain が何も出さない', () => {
  const { dir, git } = cleanCopy();
  assert.equal(git('status', '--porcelain').trim(), '', '走らせる前からきれいではありません');
  // npm test の成否はここでは見ない(AC-5 で見る)。見るのは走らせたあとの repo の中だけ
  spawnSync('npm', ['test'], { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  assert.equal(git('status', '--porcelain').trim(), '', 'npm test のあとに repo の中のファイルが変わりました');
});

test('AC-4 test/acceptance/README.md の puchun-e2e の行は、repo の中の写真の場所を指していない', () => {
  const readme = fs.readFileSync(path.join(root, 'test/acceptance/README.md'), 'utf8');
  const line = readme.split('\n').find((candidate) => candidate.includes('`puchun-e2e.test.js`'));
  assert.ok(line, 'README に puchun-e2e の行がありません');
  assert.ok(!line.includes('artifacts/shots'), '写真の場所がまだ artifacts/shots のままです');
  assert.match(line, /SHOT_DIR/, '写真の場所の説明に SHOT_DIR がありません');
});
