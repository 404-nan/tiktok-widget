// scripts/health-watch.sh の通知と限定つき自動復帰を、一時サーバーと偽コマンドで確かめる。
// 本物の systemctl・127.0.0.1:3939・~/backups へは行かないように、HOME と PATH を隔離する。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const watchScript = path.join(root, 'scripts', 'health-watch.sh');

function shq(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`${name} が PATH にありません`);
}

async function writeExecutable(file, text) {
  await fs.writeFile(file, text);
  await fs.chmod(file, 0o755);
}

async function readLines(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.trimEnd() ? text.trimEnd().split('\n') : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function runWatch(env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [watchScript], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('health-watch.sh が時間内に終わりませんでした'));
    }, 12000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function makeHarness(t, { notifyFails = false, restartHeals = false } = {}) {
  // この機械では並行するテストが /tmp の使用量制限を埋めることがあるので、ホームのキャッシュへ置く。
  const tmpParent = path.join(os.homedir(), '.cache', 'tiktok-widget-tests');
  await fs.mkdir(tmpParent, { recursive: true });
  const dir = await fs.mkdtemp(path.join(tmpParent, 'health-watch-'));
  const homeDir = path.join(dir, 'home');
  const stateDir = path.join(dir, 'state');
  const incidentsDir = path.join(stateDir, 'incidents');
  const appDir = path.join(dir, 'app');
  const binDir = path.join(dir, 'bin');
  const modeFile = path.join(dir, 'mode');
  const notifyLog = path.join(dir, 'notify.log');
  const restartLog = path.join(dir, 'restart.log');
  const restartSawIncident = path.join(dir, 'restart-saw-incident');
  const stubLog = path.join(dir, 'stub.log');
  const stateFile = path.join(stateDir, 'health-watch.state');
  const opsStatusFile = path.join(stateDir, 'ops-status.json');
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(incidentsDir, { recursive: true });
  await fs.mkdir(appDir, { recursive: true });
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({ version: '0.0.0-test' }));
  await fs.writeFile(modeFile, 'down\n');

  const realCurl = findOnPath('curl');
  // 実装が環境変数を見ないで本番の既定 URL へ行こうとした時は、ネットワークへ出さずに失敗させる。
  await writeExecutable(path.join(binDir, 'curl'), `#!/bin/sh
blocked=0
for arg in "$@"; do
  case "$arg" in
    http://127.0.0.1:3939/*|http://localhost:3939/*) blocked=1 ;;
  esac
done
if [ "$blocked" = 1 ]; then
  exit 7
fi
exec ${shq(realCurl)} "$@"
`);

  const notifyScript = path.join(binDir, 'notify');
  await writeExecutable(notifyScript, `#!/bin/sh
last=
for arg in "$@"; do
  last=$arg
done
printf '%s\\n' "$last" >> ${shq(notifyLog)}
exit ${notifyFails ? 1 : 0}
`);

  const restartScript = path.join(binDir, 'restart-app');
  await writeExecutable(restartScript, `#!/bin/sh
printf 'restart\\n' >> ${shq(restartLog)}
if [ -d ${shq(incidentsDir)} ] && [ -n "$(ls -A ${shq(incidentsDir)} 2>/dev/null)" ]; then
  printf 'yes\\n' > ${shq(restartSawIncident)}
fi
if [ ${restartHeals ? 1 : 0} -eq 1 ]; then
  printf 'ok\\n' > ${shq(modeFile)}
fi
exit 0
`);

  for (const name of ['systemctl', 'journalctl', 'ss']) {
    await writeExecutable(path.join(binDir, name), `#!/bin/sh
printf '${name} %s\\n' "$*" >> ${shq(stubLog)}
exit 0
`);
  }

  const server = http.createServer((req, res) => {
    let mode = 'down';
    try {
      mode = readFileSync(modeFile, 'utf8').trim();
    } catch {
      // ファイルが無い時も落ちた扱いにする。
    }
    if (req.url !== '/healthz') {
      res.writeHead(404);
      res.end();
      return;
    }
    if (mode === 'ok') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"live":0}');
      return;
    }
    // 落ちている時は status を返さず、本物の無応答に近い形で切る。
    req.socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function run({ now = 1700000000, autorestart = '', notifyCommand = `${notifyScript} --emergency`, restartWait = '0', extraEnv = {} } = {}) {
    const env = {
      ...process.env,
      ...extraEnv,
      HOME: homeDir,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      TW_HEALTHZ_URL: `http://127.0.0.1:${port}/healthz`,
      TW_HEALTH_STATE_DIR: stateDir,
      TW_APP_DIR: appDir,
      TW_HEALTH_NOTIFY_CMD: notifyCommand,
      TW_HEALTH_AUTORESTART: autorestart,
      TW_RESTART_CMD: restartScript,
      TW_HEALTH_NOW: String(now),
      TW_HEALTH_RESTART_WAIT_SECONDS: String(restartWait),
    };
    return runWatch(env);
  }

  async function state() {
    const text = await fs.readFile(stateFile, 'utf8');
    const out = {};
    for (const line of text.trimEnd().split('\n')) {
      if (!line) continue;
      const at = line.indexOf('=');
      out[line.slice(0, at)] = line.slice(at + 1);
    }
    return out;
  }

  async function incidents() {
    try {
      return (await fs.readdir(incidentsDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  return {
    dir,
    stateDir,
    incidentsDir,
    stateFile,
    opsStatusFile,
    notifyLog,
    restartLog,
    restartSawIncident,
    stubLog,
    run,
    state,
    incidents,
    setMode: (mode) => fs.writeFile(modeFile, `${mode}\n`),
  };
}

test('元気な間は何回回しても知らせも再起動もしない', async (t) => {
  const h = await makeHarness(t);
  await h.setMode('ok');
  for (const now of [1700000000, 1700000120, 1700000240]) {
    const result = await h.run({ now });
    assert.equal(result.code, 0, result.stderr);
  }
  assert.deepEqual(await readLines(h.notifyLog), []);
  assert.deepEqual(await readLines(h.restartLog), []);
  const state = await h.state();
  assert.equal(state.count, '0');
  assert.equal(state.reported, '');
});

test('応答が無い1〜2回目は知らせず、3回目に1回だけ知らせて診断を残す', async (t) => {
  const h = await makeHarness(t);
  const first = 1700000000;
  for (const now of [first, first + 120]) {
    const result = await h.run({ now });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(await readLines(h.notifyLog), []);
  }

  const third = await h.run({ now: first + 240 });
  assert.equal(third.code, 0, third.stderr);
  const notes = await readLines(h.notifyLog);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /^ライコネが応答していません（6 分）。診断を残しました: /);

  const incidents = await h.incidents();
  assert.equal(incidents.length, 1);
  assert.ok(notes[0].endsWith(incidents[0]));
  for (const name of ['INCIDENT.txt', 'git.txt', 'service.txt', 'journal.txt', 'connections.txt', 'healthz.txt']) {
    assert.ok(existsSync(path.join(h.incidentsDir, incidents[0], name)), `${name} がありません`);
  }

  const state = await h.state();
  assert.equal(state.count, '3');
  assert.equal(state.down_since, String(first));
  assert.equal(state.down_notified, '1');
  assert.ok(state.reported);

  const fourth = await h.run({ now: first + 360 });
  assert.equal(fourth.code, 0, fourth.stderr);
  assert.deepEqual(await readLines(h.notifyLog), notes);
  assert.equal((await h.incidents()).length, 1);
});

test('応答が戻ると戻りましたを1回だけ知らせる', async (t) => {
  const h = await makeHarness(t);
  const first = 1700000000;
  for (const now of [first, first + 120, first + 240]) {
    const result = await h.run({ now });
    assert.equal(result.code, 0, result.stderr);
  }

  await h.setMode('ok');
  const recovered = await h.run({ now: first + 360 });
  assert.equal(recovered.code, 0, recovered.stderr);
  const notes = await readLines(h.notifyLog);
  assert.equal(notes.length, 2);
  assert.match(notes[0], /^ライコネが応答していません/);
  assert.equal(notes[1], 'ライコネが戻りました（落ちていた時間: 約 6 分）');

  const state = await h.state();
  assert.equal(state.count, '0');
  assert.equal(state.reported, '');
  assert.equal(state.down_since, '');
  assert.equal(state.down_notified, '');

  const again = await h.run({ now: first + 480 });
  assert.equal(again.code, 0, again.stderr);
  assert.deepEqual(await readLines(h.notifyLog), notes);
});

test('自動復帰の変数が空なら再起動の命令は1回も呼ばれない', async (t) => {
  const h = await makeHarness(t);
  const first = 1700000000;
  for (const now of [first, first + 120, first + 240, first + 360]) {
    const result = await h.run({ now });
    assert.equal(result.code, 0, result.stderr);
  }
  assert.deepEqual(await readLines(h.restartLog), []);
});

test('自動復帰が1なら3回目に1回再起動し、結果と復帰を知らせる', async (t) => {
  const h = await makeHarness(t, { restartHeals: true });
  const first = 1700000000;
  for (const now of [first, first + 120]) {
    const result = await h.run({ now, autorestart: '1' });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(await readLines(h.restartLog), []);
  }

  const third = await h.run({ now: first + 240, autorestart: '1' });
  assert.equal(third.code, 0, third.stderr);
  assert.deepEqual(await readLines(h.restartLog), ['restart']);
  assert.equal(await fs.readFile(h.restartSawIncident, 'utf8'), 'yes\n');

  const notes = await readLines(h.notifyLog);
  assert.equal(notes.length, 3);
  assert.match(notes[0], /^ライコネが応答していません/);
  assert.equal(notes[1], '自動で再起動しました。結果: 戻りました');
  assert.equal(notes[2], 'ライコネが戻りました（落ちていた時間: 約 6 分）');

  const state = await h.state();
  assert.equal(state.count, '0');
  assert.equal(state.reported, '');
  assert.equal(state.last_restart_at, String(first + 240));

  const again = await h.run({ now: first + 360, autorestart: '1' });
  assert.equal(again.code, 0, again.stderr);
  assert.deepEqual(await readLines(h.restartLog), ['restart']);
  assert.equal((await readLines(h.notifyLog)).length, 3);
});

test('自動復帰は同じ障害で1回だけで、失敗の知らせも繰り返さない', async (t) => {
  const h = await makeHarness(t);
  const first = 1700000000;
  for (const now of [first, first + 120, first + 240]) {
    const result = await h.run({ now, autorestart: '1' });
    assert.equal(result.code, 0, result.stderr);
  }
  assert.deepEqual(await readLines(h.restartLog), ['restart']);
  const notesAfterRestart = await readLines(h.notifyLog);
  assert.equal(notesAfterRestart.length, 2);
  assert.equal(notesAfterRestart[1], '自動で再起動しました。結果: 戻りませんでした');

  for (const now of [first + 360, first + 1139]) {
    const result = await h.run({ now, autorestart: '1' });
    assert.equal(result.code, 0, result.stderr);
  }
  assert.deepEqual(await readLines(h.restartLog), ['restart']);
  assert.deepEqual(await readLines(h.notifyLog), notesAfterRestart);

  const afterCooldown = await h.run({ now: first + 1141, autorestart: '1' });
  assert.equal(afterCooldown.code, 0, afterCooldown.stderr);
  assert.deepEqual(await readLines(h.restartLog), ['restart']);
  assert.deepEqual(await readLines(h.notifyLog), notesAfterRestart);

  const state = await h.state();
  assert.equal(state.last_restart_at, String(first + 240));
  assert.equal(state.restart_attempted, '1');
  assert.equal(state.restart_notified, '1');
  assert.ok(Number(state.count) > 3);
});

test('自動復帰の15分の間隔は、直った後の次の障害にも効く', async (t) => {
  const h = await makeHarness(t, { restartHeals: true });
  const first = 1700000000;
  for (const now of [first, first + 120, first + 240]) {
    const result = await h.run({ now, autorestart: '1' });
    assert.equal(result.code, 0, result.stderr);
  }
  assert.deepEqual(await readLines(h.restartLog), ['restart']);

  await h.setMode('down');
  for (const now of [first + 360, first + 480, first + 600]) {
    const result = await h.run({ now, autorestart: '1' });
    assert.equal(result.code, 0, result.stderr);
  }
  assert.deepEqual(await readLines(h.restartLog), ['restart']);

  const afterCooldown = await h.run({ now: first + 1140, autorestart: '1' });
  assert.equal(afterCooldown.code, 0, afterCooldown.stderr);
  assert.deepEqual(await readLines(h.restartLog), ['restart', 'restart']);
  const state = await h.state();
  assert.equal(state.count, '0');
  assert.equal(state.last_restart_at, String(first + 1140));
});

test('healthz が 200 を返している時は自動復帰が1でも再起動しない', async (t) => {
  const h = await makeHarness(t);
  await h.setMode('ok');
  for (const now of [1700000000, 1700000120, 1700000240]) {
    const result = await h.run({ now, autorestart: '1' });
    assert.equal(result.code, 0, result.stderr);
  }
  assert.deepEqual(await readLines(h.restartLog), []);
  assert.deepEqual(await readLines(h.notifyLog), []);
});

test('知らせの命令が失敗しても見張りが最後まで動き状態ファイルが書かれる', async (t) => {
  const h = await makeHarness(t, { notifyFails: true });
  const first = 1700000000;
  for (const now of [first, first + 120, first + 240]) {
    const result = await h.run({ now });
    assert.equal(result.code, 0, result.stderr);
  }
  const state = await h.state();
  assert.equal(state.count, '3');
  assert.ok(state.reported);
  assert.equal((await h.incidents()).length, 1);
  assert.ok(existsSync(h.opsStatusFile));
});

test('前の形の状態ファイルを読める', async (t) => {
  const h = await makeHarness(t);
  await fs.writeFile(h.stateFile, 'count=2\nreported=\n');
  const result = await h.run({ now: 1700000000 });
  assert.equal(result.code, 0, result.stderr);
  const state = await h.state();
  assert.equal(state.count, '3');
  assert.equal(state.down_notified, '1');
  assert.equal((await readLines(h.notifyLog)).length, 1);
  assert.equal((await h.incidents()).length, 1);
});

test('ops-status.json が今までと同じ形で書かれる', async (t) => {
  const h = await makeHarness(t);
  await h.setMode('ok');
  const result = await h.run({ now: 1700000000 });
  assert.equal(result.code, 0, result.stderr);
  const status = JSON.parse(await fs.readFile(h.opsStatusFile, 'utf8'));
  assert.deepEqual(Object.keys(status).sort(), ['head', 'incidents', 'lastDeploy', 'live', 'ok', 'ts', 'version']);
  assert.equal(status.ok, true);
  assert.equal(status.live, 0);
  assert.equal(status.version, '0.0.0-test');
  assert.equal(status.lastDeploy, null);
  assert.equal(status.incidents, 0);
  assert.equal(typeof status.ts, 'string');
  assert.equal(typeof status.head, 'string');
});
