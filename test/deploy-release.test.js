// 本番投入と戻しの道具を、作り物の git リポジトリ・healthz・再起動命令で確かめる。
// 本物の systemctl や本番ポートへは行かず、全部一時ディレクトリの中で動かす。

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_NAMES = ['deploy-release.sh', 'rollback-release.sh', 'release-check.mjs'];

function tempDir(prefix = 'tw-deploy-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function git(repo, args, options = {}) {
  const run = spawnSync('git', ['-c', 'user.name=Deploy Test', '-c', 'user.email=deploy-test@example.invalid', ...args], {
    cwd: repo,
    encoding: 'utf8',
    ...options,
  });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
}

function copyScripts(repo) {
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  for (const name of SCRIPT_NAMES) {
    fs.copyFileSync(path.join(repoRoot, 'scripts', name), path.join(repo, 'scripts', name));
  }
}

function writeState(file, state) {
  fs.writeFileSync(file, JSON.stringify(state));
}

async function startHealthz(stateFile) {
  const server = createServer((req, res) => {
    if (req.url !== '/healthz') {
      res.writeHead(404).end();
      return;
    }
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, live: state.live ?? 0, version: state.version, commit: state.commit }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

function createFakeRepo() {
  const repo = tempDir();
  git(repo, ['init', '-q', '-b', 'main']);
  copyScripts(repo);
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'public'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'test'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'test', 'pass.test.js'), "import test from 'node:test';\nimport express from 'express';\ntest('pass', () => { if (typeof express !== 'function') throw new Error('express not found'); });\n");
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fake', version: '1.0.0', type: 'module', dependencies: { express: '^5.3.0' } }, null, 2));
  fs.copyFileSync(path.join(repoRoot, 'package-lock.json'), path.join(repo, 'package-lock.json'));
  fs.writeFileSync(path.join(repo, 'src', 'announcements.json'), '[]\n');
  fs.writeFileSync(path.join(repo, 'public', 'widget.txt'), 'base\n');
  fs.writeFileSync(path.join(repo, 'internal.txt'), 'base\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', 'base']);
  return { repo, base: git(repo, ['rev-parse', 'HEAD']) };
}

function addCommit(repo, branch, files, message = 'change') {
  git(repo, ['checkout', '-q', '-b', branch]);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), text);
  }
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', message]);
  const commit = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['checkout', '-q', 'main']);
  return commit;
}

function ledgerEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function worktreeCount(repo) {
  return git(repo, ['worktree', 'list', '--porcelain']).split('\n').filter((line) => line.startsWith('worktree ')).length;
}

function makeRestartCommand({ countFile, stateFile, state = null }) {
  const update = state ? `printf %s ${shellQuote(JSON.stringify(state))} > ${shellQuote(stateFile)}; ` : '';
  return `${update}printf x >> ${shellQuote(countFile)}`;
}

function runScript(repo, script, args, env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [path.join('scripts', script), ...args], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: process.env.PATH,
        TW_RELEASE_LEDGER: env.ledger,
        TW_HEALTHZ_URL: env.healthzUrl,
        TW_RESTART_CMD: env.restartCmd,
        TW_VERIFY_TIMEOUT: env.verifyTimeout ?? '3',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 20_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr: timedOut ? `${stderr}\nテストの時間切れ` : stderr });
    });
  });
}

async function setupHarness(initialState) {
  const dir = tempDir('tw-deploy-harness-');
  const stateFile = path.join(dir, 'state.json');
  const countFile = path.join(dir, 'restart-count');
  const ledger = path.join(dir, 'ledger.jsonl');
  writeState(stateFile, initialState);
  const health = await startHealthz(stateFile);
  return {
    dir,
    stateFile,
    countFile,
    ledger,
    healthzUrl: `http://127.0.0.1:${health.port}/healthz`,
    close: () => closeServer(health.server),
  };
}

test('配信中なら deploy は何も変えず止まり、台帳に started を書かない', async () => {
  const { repo, base } = createFakeRepo();
  const candidate = addCommit(repo, 'candidate-live', { 'internal.txt': 'new\n' });
  const harness = await setupHarness({ live: 1, version: '1.0.0', commit: base });
  try {
    const run = await runScript(repo, 'deploy-release.sh', ['candidate-live'], {
      ...harness,
      restartCmd: makeRestartCommand({ countFile: harness.countFile, stateFile: harness.stateFile, state: { live: 0, version: '1.0.0', commit: candidate } }),
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout + run.stderr, /配信中/);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), base);
    assert.deepEqual(ledgerEvents(harness.ledger), []);
    assert.equal(fs.existsSync(harness.countFile), false);
    assert.equal(worktreeCount(repo), 1);
  } finally {
    await harness.close();
    fs.rmSync(harness.dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('関門で落ちるブランチは早送りされず、台帳は started から failed になる', async () => {
  const { repo, base } = createFakeRepo();
  addCommit(repo, 'candidate-gate-fail', { 'public/widget.txt': 'changed without version\n' });
  const harness = await setupHarness({ live: 0, version: '1.0.0', commit: base });
  try {
    const run = await runScript(repo, 'deploy-release.sh', ['candidate-gate-fail'], {
      ...harness,
      restartCmd: makeRestartCommand({ countFile: harness.countFile, stateFile: harness.stateFile }),
    });
    assert.notEqual(run.status, 0);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), base);
    const events = ledgerEvents(harness.ledger);
    assert.deepEqual(events.map((row) => row.event), ['started', 'failed']);
    assert.equal(events[0].deployId, events[1].deployId);
    assert.equal(events[1].stage, 'gates');
    assert.equal(fs.existsSync(harness.countFile), false);
    assert.equal(worktreeCount(repo), 1);
  } finally {
    await harness.close();
    fs.rmSync(harness.dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('うまくいく deploy は started gates-passed activated verified の順で同じ deployId を残す', async () => {
  const { repo, base } = createFakeRepo();
  const candidate = addCommit(repo, 'candidate-ok', { 'internal.txt': 'new\n' });
  const harness = await setupHarness({ live: 0, version: '1.0.0', commit: base });
  try {
    const restartCmd = makeRestartCommand({
      countFile: harness.countFile,
      stateFile: harness.stateFile,
      state: { live: 0, version: '1.0.0', commit: candidate },
    });
    const run = await runScript(repo, 'deploy-release.sh', ['candidate-ok'], { ...harness, restartCmd });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), candidate);
    const events = ledgerEvents(harness.ledger);
    assert.deepEqual(events.map((row) => row.event), ['started', 'gates-passed', 'activated', 'verified']);
    assert.equal(events[1].tests, 'skipped');
    assert.ok(events.every((row) => row.deployId === events[0].deployId));
    assert.equal(events[0].from, base);
    assert.equal(events[0].to, candidate);
    assert.equal(events[3].version, '1.0.0');
    assert.equal(events[3].commit, candidate);
    assert.equal(fs.readFileSync(harness.countFile, 'utf8'), 'x');
    assert.equal(worktreeCount(repo), 1);
  } finally {
    await harness.close();
    fs.rmSync(harness.dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('--with-tests を付けると全体テストつきの関門を通る', async () => {
  const { repo, base } = createFakeRepo();
  const candidate = addCommit(repo, 'candidate-with-tests', { 'internal.txt': 'new\n' });
  const harness = await setupHarness({ live: 0, version: '1.0.0', commit: base });
  try {
    const restartCmd = makeRestartCommand({
      countFile: harness.countFile,
      stateFile: harness.stateFile,
      state: { live: 0, version: '1.0.0', commit: candidate },
    });
    const run = await runScript(repo, 'deploy-release.sh', ['--with-tests', 'candidate-with-tests'], { ...harness, restartCmd });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const events = ledgerEvents(harness.ledger);
    assert.deepEqual(events.map((row) => row.event), ['started', 'gates-passed', 'activated', 'verified']);
    assert.equal(events[1].tests, 'full');
  } finally {
    await harness.close();
    fs.rmSync(harness.dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('再起動後も古い commit を返すときは failed で止まり、自動では戻さず戻しの命令を出す', async () => {
  const { repo, base } = createFakeRepo();
  const candidate = addCommit(repo, 'candidate-stale', { 'internal.txt': 'new\n' });
  const harness = await setupHarness({ live: 0, version: '1.0.0', commit: base });
  try {
    const run = await runScript(repo, 'deploy-release.sh', ['candidate-stale'], {
      ...harness,
      restartCmd: makeRestartCommand({ countFile: harness.countFile, stateFile: harness.stateFile }),
      verifyTimeout: '2',
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout + run.stderr, /rollback-release\.sh/);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), candidate);
    const events = ledgerEvents(harness.ledger);
    assert.deepEqual(events.map((row) => row.event), ['started', 'gates-passed', 'activated', 'failed']);
    assert.equal(events[3].stage, 'verify');
    assert.equal(fs.readFileSync(harness.countFile, 'utf8'), 'x');
    assert.equal(worktreeCount(repo), 1);
  } finally {
    await harness.close();
    fs.rmSync(harness.dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('rollback は最後が failed の投入を無視し、その前の verified の from へ戻る', async () => {
  const { repo, base } = createFakeRepo();
  const second = addCommit(repo, 'second', { 'internal.txt': 'second\n' });
  git(repo, ['merge', '--ff-only', '-q', 'second']);
  const third = addCommit(repo, 'third', { 'internal.txt': 'third\n' });
  git(repo, ['merge', '--ff-only', '-q', 'third']);
  const failedTo = addCommit(repo, 'not-deployed', { 'internal.txt': 'not deployed\n' });

  const harness = await setupHarness({ live: 0, version: '1.0.0', commit: third });
  try {
    fs.writeFileSync(harness.ledger, [
      { ts: 't1', deployId: 'd1', event: 'started', from: base, to: second },
      { ts: 't2', deployId: 'd1', event: 'verified', version: '1.0.0', commit: second },
      { ts: 't3', deployId: 'd2', event: 'started', from: second, to: third },
      { ts: 't4', deployId: 'd2', event: 'verified', version: '1.0.0', commit: third },
      { ts: 't5', deployId: 'd3', event: 'started', from: third, to: failedTo },
      { ts: 't6', deployId: 'd3', event: 'failed', stage: 'verify' },
    ].map((row) => JSON.stringify(row)).join('\n') + '\n');
    const restartCmd = makeRestartCommand({
      countFile: harness.countFile,
      stateFile: harness.stateFile,
      state: { live: 0, version: '1.0.0', commit: second },
    });
    const run = await runScript(repo, 'rollback-release.sh', [], { ...harness, restartCmd });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), second);
    const events = ledgerEvents(harness.ledger);
    assert.equal(events.at(-1).event, 'rolled-back');
    assert.equal(events.at(-1).to, second);
  } finally {
    await harness.close();
    fs.rmSync(harness.dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('rollback は event の無い前の形の台帳を確かめ済みの投入として読む', async () => {
  const { repo, base } = createFakeRepo();
  const second = addCommit(repo, 'legacy-second', { 'internal.txt': 'second\n' });
  git(repo, ['merge', '--ff-only', '-q', 'legacy-second']);
  const harness = await setupHarness({ live: 0, version: '1.0.0', commit: second });
  try {
    fs.writeFileSync(harness.ledger, JSON.stringify({ ts: 't1', from: base, to: second, version: '1.0.0', branch: 'legacy-second' }) + '\n');
    const restartCmd = makeRestartCommand({
      countFile: harness.countFile,
      stateFile: harness.stateFile,
      state: { live: 0, version: '1.0.0', commit: base },
    });
    const run = await runScript(repo, 'rollback-release.sh', [], { ...harness, restartCmd });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), base);
    assert.equal(ledgerEvents(harness.ledger).at(-1).event, 'rolled-back');
    assert.equal(ledgerEvents(harness.ledger).at(-1).to, base);
  } finally {
    await harness.close();
    fs.rmSync(harness.dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
