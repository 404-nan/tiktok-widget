// 一時ホストの起動・復元・再起動・停止を、公開せずに確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const setup = path.resolve(import.meta.dirname, '../deploy/standby/setup.sh');
const manage = path.join(path.dirname(setup), 'standby.sh');

test('一時起動は初回だけ復元し、再実行・再起動・停止でデータを失わない', async (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'tw-standby-'));
  const app = path.join(root, 'source');
  const standby = path.join(root, 'standby');
  const bin = path.join(root, '.local', 'bin');
  const backup = path.join(root, 'backup.tar.gz');
  const run = (cmd, args, options) => execFileSync(cmd, args, { encoding: 'utf8', ...options });
  const read = (file) => fs.readFileSync(path.join(standby, file), 'utf8').trim();
  const listen = createServer();
  await new Promise((resolve) => listen.listen(0, '127.0.0.1', resolve));
  const port = String(listen.address().port);
  await new Promise((resolve) => listen.close(resolve));
  fs.mkdirSync(app);
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(root, 'backup', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backup', 'data', 'admin-token.txt'), 'restored-fixture\n');
  fs.writeFileSync(path.join(root, 'backup', 'config.yaml'), 'restored: true\n');
  run('tar', ['-czf', backup, '-C', path.join(root, 'backup'), 'data', 'config.yaml']);

  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/bash\nmkdir -p node_modules\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'cloudflared'), `#!/bin/bash
if [[ "$*" == 'tunnel --grace-period 5s run' ]]; then
  [[ -n $TUNNEL_TOKEN && -z $CF_API_TOKEN ]] || exit 98
  exec sleep 120
fi
[[ "$*" == "tunnel --grace-period 5s --url http://127.0.0.1:$PORT" ]] || exit 69
if [[ \${FIXTURE_STUBBORN:-} == 1 ]]; then
  trap '' TERM
  printf '%s\\n' "$$" > "$STANDBY_DIR/tunnel-child.pid"
fi
printf 'https://fixture.trycloudflare.com\\n'
exec sleep 120
`, { mode: 0o700 });
  const realCurl = run('sh', ['-c', 'command -v curl']).trim();
  fs.writeFileSync(path.join(bin, 'curl'), `#!/bin/bash
args=()
for arg in "$@"; do
  if [[ $arg == https://fixture.trycloudflare.com/healthz ]]; then
    arg="http://127.0.0.1:$PORT/healthz"
  elif [[ $arg == *fixture.invalid* ]]; then
    exit 66
  fi
  args+=("$arg")
done
if [[ " $* " == *" -K - "* ]]; then
  [[ -z \${DATA_URL:-} ]] || exit 67
  IFS= read -r config
  [[ $config == 'url = "https://fixture.invalid/backup.tar.gz?key=fixture"' ]] || exit 68
  exec /bin/cat "$FIXTURE_BACKUP"
fi
exec "${realCurl}" "\${args[@]}"
`, { mode: 0o700 });
  fs.mkdirSync(path.join(app, 'public/help'), { recursive: true });
  fs.writeFileSync(path.join(app, 'public/help/index.html'), 'fixture');
  fs.writeFileSync(path.join(app, 'server.js'), `
const { writeFileSync, readFileSync } = require('node:fs');
const { createServer } = require('node:http');
if (process.env.TW_HOSTED !== '1' || process.env.HOST !== '127.0.0.1') process.exit(1);
writeFileSync(process.env.TW_DATA + '/child.pid', String(process.pid));
createServer((req, res) => {
  if (req.url === '/fixture-data') return res.end(readFileSync(process.env.TW_DATA + '/admin-token.txt'));
  if (req.url.startsWith('/help/standby-')) return res.end(readFileSync('public' + req.url));
  res.end('ok');
}).listen(+process.env.PORT, process.env.HOST);
`);
  run('git', ['init', '-q', app]);
  run('git', ['-C', app, 'add', 'server.js', 'public']);
  run('git', ['-C', app, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  const env = {
    ...process.env,
    HOME: root, STANDBY_DIR: standby, PORT: port, TUNNEL_TOKEN: '',
    DATA_URL: '', DATA_TARBALL: '', FIXTURE_BACKUP: backup, FIXTURE_STUBBORN: '',
    REF: run('git', ['-C', app, 'rev-parse', 'HEAD']).trim(),
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.${app}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/404-nan/tiktok-widget.git',
  };
  const start = (data) => run('bash', ['-c', 'set -o pipefail; /bin/cat "$1" | bash', '_', setup],
    { env: { ...env, ...data }, timeout: 15_000 });
  const stop = (dir) => {
    const runner = path.join(dir, 'run.sh');
    if (fs.existsSync(runner)) run('bash', [runner, 'stop'], { env, timeout: 12_000 });
  };
  const remote = path.join(root, 'remote');
  const managed = path.join(root, 'managed');
  t.after(() => {
    stop(standby);
    stop(remote);
    stop(managed);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const output = start({ DATA_TARBALL: backup, FIXTURE_STUBBORN: '1' });
  assert.match(output, /公開 URL: https:\/\/fixture\.trycloudflare\.com/);
  assert.doesNotMatch(output, /restored-fixture/);
  assert.equal(read('url.txt'), 'https://fixture.trycloudflare.com');
  assert.equal(read('data/admin-token.txt'), 'restored-fixture');
  assert.equal(read('config.yaml'), 'restored: true');
  const supervisor = read('server.pid');
  const tunnel = read('tunnel.pid');
  assert.match(start({ DATA_TARBALL: path.join(root, 'not-used.tar.gz') }), /上書き|そのまま使います/);
  assert.equal(read('server.pid'), supervisor);
  assert.equal(read('tunnel.pid'), tunnel);

  const child = read('data/child.pid');
  process.kill(+child);
  for (let i = 0; i < 60 && read('data/child.pid') === child; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.notEqual(read('data/child.pid'), child);
  await t.test('停止に応じないトンネルを強制終了して本体も止める', async () => {
    const pid = read('tunnel-child.pid');
    stop(standby);
    const stat = `/proc/${pid}/stat`;
    if (fs.existsSync(stat)) assert.match(fs.readFileSync(stat, 'utf8'), /^\d+ \(.*\) Z /);
    await assert.rejects(fetch(`http://127.0.0.1:${port}/healthz`));
  });
  assert.equal(read('data/admin-token.txt'), 'restored-fixture');
  await t.test('バックアップの URL を curl の引数や環境に渡さない', () => {
    const url = 'https://fixture.invalid/backup.tar.gz?key=fixture';
    const output = start({ STANDBY_DIR: remote, DATA_URL: url });
    assert.match(output, /公開 URL:/);
    assert.ok(!output.includes(url));
    assert.equal(fs.readFileSync(path.join(remote, 'data', 'admin-token.txt'), 'utf8').trim(), 'restored-fixture');
  });
  stop(remote);
  await t.test('準備した版を同期データで起動し、再実行でも昇格後の更新を残す', async () => {
    const primary = '11111111-1111-1111-1111-111111111111';
    const target = '22222222-2222-2222-2222-222222222222';
    const state = path.join(root, 'dns-state');
    const stub = path.join(root, 'fetch-dns.mjs');
    fs.writeFileSync(stub, `
      import fs from 'node:fs';
      const fetchLocal = globalThis.fetch;
      const state = ${JSON.stringify(state)};
      globalThis.fetch = async (url, options) => {
        const { hostname, pathname } = new URL(url);
        let id = fs.existsSync(state) ? fs.readFileSync(state, 'utf8') : '${primary}';
        if (hostname === 'api.cloudflare.com') {
          if (options.method === 'PATCH') {
            if (process.env.FIXTURE_PATCH_FAIL === '1') return new Response('down', { status: 503 });
            id = JSON.parse(options.body).content.split('.')[0];
            fs.writeFileSync(state, id);
          }
          return Response.json({ success: true, result: {
            id: process.env.CF_DNS_RECORD_ID, type: 'CNAME', proxied: true, name: process.env.PUBLIC_HOST,
            content: id + '.cfargotunnel.com'
          } });
        }
        if (pathname === '/healthz') {
          if (id === '${target}') return Response.json({ ok: true, live: 0 });
          return new Response('down', { status: 530, headers: { 'cf-ray': 'fixture' } });
        }
        if (hostname === process.env.STANDBY_PROBE_HOST || id === '${target}') {
          return fetchLocal('http://127.0.0.1:' + process.env.PORT + pathname, options);
        }
        return new Response('not found', { status: 404 });
      };
    `);
    const vars = {
      ...env, STANDBY_DIR: managed, NODE_OPTIONS: `--import=${stub}`, PUBLIC_HOST: 'widget.example.test',
      STANDBY_PROBE_HOST: 'probe.example.test', CF_ZONE_ID: 'a'.repeat(32), CF_DNS_RECORD_ID: 'b'.repeat(32),
      PRIMARY_TUNNEL_ID: primary, STANDBY_TUNNEL_ID: target, CF_API_TOKEN: 'fixture-dns',
      TUNNEL_TOKEN: Buffer.from(JSON.stringify({ t: target })).toString('base64'),
    };
    const call = (...args) => run('bash', [manage, ...args], { env: vars, timeout: 15_000 });
    call('prepare');
    assert.equal(fs.existsSync(path.join(managed, 'server.pid')), false);
    const snapshot = path.join(managed, 'replica-a');
    fs.cpSync(path.join(root, 'backup'), snapshot, { recursive: true });
    fs.writeFileSync(path.join(snapshot, 'data/tenants.json'), '{"tenants":[{"id":"fixture"}]}\n');
    fs.writeFileSync(path.join(snapshot, 'stamp'), `${Math.floor(Date.now() / 1000)} ${env.REF}\n`);
    fs.symlinkSync('replica-a', path.join(managed, 'current'));
    const promoted = path.join(managed, 'promoted');
    assert.throws(() => run('bash', [manage, 'promote', '--primary-fenced'],
      { env: { ...vars, FIXTURE_PATCH_FAIL: '1' }, timeout: 15_000 }), /DNS 更新: HTTP 503/);
    const promotion = fs.readFileSync(promoted, 'utf8');
    fs.writeFileSync(promoted, promotion.replace(/ \d+\n$/, ' 1\n'));
    assert.throws(() => call('promote', '--primary-fenced'), /期限外/);
    assert.equal(fs.existsSync(state), false);
    fs.writeFileSync(promoted, promotion);
    assert.doesNotMatch(call('promote', '--primary-fenced'), /fixture-dns|restored-fixture/);
    assert.equal(fs.readFileSync(state, 'utf8'), target);
    const url = `http://127.0.0.1:${port}/fixture-data`;
    assert.equal(await (await fetch(url)).text(), 'restored-fixture\n');
    fs.writeFileSync(path.join(managed, 'data/admin-token.txt'), 'updated after promotion');
    fs.writeFileSync(promoted, promotion.replace(/ \d+\n$/, ' 1\n'));
    call('watch');
    call('promote', '--primary-fenced');
    assert.equal(await (await fetch(url)).text(), 'updated after promotion');
    assert.equal(fs.readFileSync(path.join(snapshot, 'data/admin-token.txt'), 'utf8'), 'restored-fixture\n');
  });
});
