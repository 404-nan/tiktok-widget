// テスト実行の前読み込みが、子プロセスで mkdtemp された一時フォルダだけを終了時に消すことを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const preload = path.join(root, 'test/helpers/tmp-cleanup.mjs');

function writeFixture(file) {
  fs.writeFileSync(file, `
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('make temporary directories', async () => {
  const syncDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
  const promiseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'promise-'));
  const callbackDir = await new Promise((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), 'callback-'), (error, dir) => error ? reject(error) : resolve(dir));
  });
  fs.writeFileSync(process.env.TMP_CLEANUP_MANIFEST, JSON.stringify([syncDir, promiseDir, callbackDir]));
});
`);
}

function runChild({ keep = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-cleanup-test-'));
  try {
    const tmp = path.join(base, 'tmp');
    fs.mkdirSync(tmp);
    const foreign = path.join(tmp, 'foreign-manual');
    fs.mkdirSync(foreign);
    const manifest = path.join(base, 'manifest.json');
    const fixture = path.join(base, 'fixture.test.js');
    writeFixture(fixture);
    const env = { ...process.env, TMPDIR: tmp, TMP_CLEANUP_MANIFEST: manifest };
    // node --test の子から別の node --test を起こすとき、内側の実行だと誤認されないようにする
    delete env.NODE_TEST_CONTEXT;
    if (keep) env.TW_KEEP_TEST_TMP = '1';
    else delete env.TW_KEEP_TEST_TMP;
    const run = spawnSync(process.execPath, ['--import', preload, '--test', fixture], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const made = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    assert.equal(made.length, 3);
    return { base, made, foreign };
  } catch (error) {
    fs.rmSync(base, { recursive: true, force: true });
    throw error;
  }
}

test('前読み込みは、子プロセスで mkdtemp されたフォルダを終了時に消す', () => {
  const result = runChild();
  try {
    for (const dir of result.made) assert.equal(fs.existsSync(dir), false, `${dir} が残っています`);
    assert.equal(fs.existsSync(result.foreign), true, '前読み込みが作っていないフォルダまで消えています');
  } finally {
    fs.rmSync(result.base, { recursive: true, force: true });
  }
});

test('TW_KEEP_TEST_TMP=1 のときは残し、あとで調べられる', () => {
  const result = runChild({ keep: true });
  try {
    for (const dir of result.made) assert.equal(fs.existsSync(dir), true, `${dir} が残っていません`);
    assert.equal(fs.existsSync(result.foreign), true);
  } finally {
    fs.rmSync(result.base, { recursive: true, force: true });
  }
});

test('mkdtemp は前読み込みが捕まえられる default import 経由だけを使う', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.test\.(js|mjs)$/.test(name)) files.push(full);
    }
  };
  walk(path.join(root, 'test'));
  const bad = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const dynamicFs = /await\s+import\(\s*['"]node:fs['"]\s*\)/.test(source);
    const namespaceFs = /import\s+\*\s+as\s+\w+\s+from\s+['"]node:fs['"]/.test(source);
    const namedMkdtemp = /import\s*\{[^}]*\bmkdtemp(?:Sync)?\b[^}]*\}\s*from\s*['"]node:fs['"]/.test(source);
    if (dynamicFs || namespaceFs || namedMkdtemp) bad.push(path.relative(root, file));
  }
  // Node の組み込みモジュールは、名前つき・名前空間・動的 import だと本体の差し替えを通らない。
  assert.deepEqual(bad, []);
});
