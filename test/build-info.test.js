// 起動した時のコミットを .git ファイルから読む部品のテスト。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildInfo, readCommitFromGit } from '../src/build-info.js';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tw-build-info-'));
}

test('TW_COMMIT があればそれを使う', () => {
  const info = buildInfo({ env: { TW_COMMIT: `  ${COMMIT}  ` }, root: tempDir() });
  assert.equal(info.commit, COMMIT);
  assert.equal(typeof info.version, 'string');
  assert.notEqual(info.version, '');
});

test('.git が無い場所では落ちずに commit null を返す', () => {
  assert.equal(readCommitFromGit(tempDir()), null);
  assert.equal(buildInfo({ env: {}, root: tempDir() }).commit, null);
});

test('HEAD が指す refs ファイルからコミットを読む', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(root, '.git', 'refs', 'heads', 'main'), `${COMMIT}\n`);
  assert.equal(readCommitFromGit(root), COMMIT);
});

test('refs ファイルが無いときは packed-refs から読む', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(root, '.git', 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted\n${COMMIT} refs/heads/main\n`);
  assert.equal(readCommitFromGit(root), COMMIT);
});

test('worktree の .git ファイルから実際の gitdir と共通の refs をたどる', () => {
  const root = tempDir();
  const gitdir = path.join(tempDir(), 'gitdir');
  const common = path.join(tempDir(), 'common');
  fs.mkdirSync(gitdir, { recursive: true });
  fs.mkdirSync(path.join(common, 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git'), `gitdir: ${gitdir}\n`);
  fs.writeFileSync(path.join(gitdir, 'commondir'), `${common}\n`);
  fs.writeFileSync(path.join(gitdir, 'HEAD'), 'ref: refs/heads/work\n');
  fs.writeFileSync(path.join(common, 'refs', 'heads', 'work'), `${COMMIT}\n`);
  assert.equal(readCommitFromGit(root), COMMIT);
});

test('HEAD が直接コミットを指すときはその値を返す', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), `${COMMIT}\n`);
  assert.equal(readCommitFromGit(root), COMMIT);
});
