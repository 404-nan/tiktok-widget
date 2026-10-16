import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, checkCommand, protectedPath } from '../.claude/hooks/guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = '/work/tw';
const write = (file_path) => check({ tool_name: 'Write', tool_input: { file_path } }, cwd);
const edit = (file_path) => check({ tool_name: 'Edit', tool_input: { file_path } }, cwd);
const bash = (command) => checkCommand(command, cwd);

test('実データ(config.yaml、data/、*-data/)への書き込みを止める', () => {
  assert.ok(write('config.yaml'));
  assert.ok(write('/work/tw/config.yaml'));
  assert.ok(edit('data/tenants.json'));
  assert.ok(write('/home/lul/tiktok-widget-dev-data/config.yaml'));
  assert.ok(write('/home/lul/tiktok-widget-dev-data/data/boss.json'));
});

test('受け入れテストと見本画像の書き換えを止める', () => {
  assert.ok(write('test/acceptance/gacha-name.test.js'));
  assert.ok(edit('/work/tw/test/acceptance/x.test.js'));
  assert.ok(write('test/visual/widgets.spec.mjs-snapshots/cutin-tate.png'));
});

test('普通の作業は止めない', () => {
  for (const f of ['src/gacha.js', 'public/widgets/slot.js', 'test/gacha.test.js', 'test/visual/widgets.spec.mjs',
    'docs/cards/2026-10-16-x.md', '.dev/visual/config.yaml', '.dev/default/data/boss.json', 'src/data-utils.js', 'config.example.yaml']) {
    assert.equal(write(f), null, f);
  }
  for (const c of ['npm run check', 'npm run check:ui', 'git status', 'git commit -m "x"', 'cat config.yaml', 'grep -r data src',
    'git push -u origin dev/ai-dev-kit', 'git push origin HEAD:dev/x', 'rm -rf node_modules', 'rm -rf .dev/visual artifacts',
    'node --test test/env.test.js', 'ls data', 'echo hi > /tmp/x.txt']) {
    assert.equal(bash(c), null, c);
  }
});

test('シェルからの書き込みも止める', () => {
  assert.ok(bash('echo x > config.yaml'));
  assert.ok(bash("sed -i 's/a/b/' data/tenants.json"));
  assert.ok(bash('cp new.png test/visual/widgets.spec.mjs-snapshots/cutin-tate.png'));
  assert.ok(bash('rm test/acceptance/a.test.js'));
  assert.ok(bash('git checkout -- test/acceptance/a.test.js'));
  assert.ok(bash('cat x | tee data/ai.json'));
});

test('見本画像の更新と承認を止める', () => {
  assert.ok(bash('npx playwright test --update-snapshots'));
  assert.ok(bash('npm run check:ui -- --update-snapshots'));
  assert.ok(bash('npm run shot:approve -- --all'));
});

test('main・next・release への push と強制 push を止める', () => {
  assert.ok(bash('git push origin main'));
  assert.ok(bash('git push origin HEAD:main'));
  assert.ok(bash('git push origin dev/x:next'));
  assert.ok(bash('git push origin release/2026-10-b'));
  assert.ok(bash('git push --force origin dev/x'));
  assert.ok(bash('git push -f origin dev/x'));
  assert.ok(bash('git push --force-with-lease origin dev/x'));
  assert.ok(bash('git push origin +dev/x'));
  assert.ok(bash('git push --delete origin dev/x'));
  assert.ok(bash('git push --all origin'));
  assert.ok(bash('npm test && git push origin main'));
});

test('作業場所の外を消す rm -r を止める', () => {
  assert.ok(bash('rm -rf /'));
  assert.ok(bash('rm -rf ~/tiktok-widget'));
  assert.ok(bash('rm -rf ../other'));
  assert.ok(bash('rm -rf /home/lul/x'));
  assert.ok(bash('rm -rf .'));
  assert.ok(bash('rm -r "$HOME/x"'));
});

test('引数なしの git push は、今のブランチが main なら止める', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  assert.ok(checkCommand('git push', dir));
  execFileSync('git', ['-C', dir, 'checkout', '-q', '-b', 'dev/x']);
  assert.equal(checkCommand('git push', dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('フックとして動かすと、止めるときは終了コード 2、通すときは 0', () => {
  const run = (input) => spawnSync(process.execPath, [path.join(root, '.claude/hooks/guard.mjs')], { input: JSON.stringify(input), encoding: 'utf8' });
  const stop = run({ tool_name: 'Write', tool_input: { file_path: 'config.yaml' }, cwd: root });
  assert.equal(stop.status, 2);
  assert.match(stop.stderr, /config\.yaml/);
  const ok = run({ tool_name: 'Write', tool_input: { file_path: 'src/x.js' }, cwd: root });
  assert.equal(ok.status, 0);
  assert.equal(run({}).status, 0);
});

test('protectedPath は作業場所の外の .dev は守る側に倒す', () => {
  assert.ok(protectedPath('/other/.dev/config.yaml', cwd));
});
