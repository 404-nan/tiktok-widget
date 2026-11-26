// public/ の静的ファイルが no-cache で配られ、ETag による 304 が残ることを実サーバーで確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http, { createServer } from 'node:http';

const repoRoot = path.resolve(import.meta.dirname, '..');
const ENV_STRIP = ['TW_HOSTED', 'TW_CONFIG', 'TW_DATA', 'TW_ENV', 'PORT', 'HOST', 'TIKTOK_USERNAME', 'TW_VAULT', 'TW_ADMIN_TOKEN'];

function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(base) {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server.js が起動しませんでした');
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 2_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (!exited) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

async function startServer({ hosted }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), hosted ? 'tw-cache-hosted-' : 'tw-cache-local-'));
  const dataDir = path.join(tempRoot, 'data');
  const configPath = path.join(tempRoot, 'config.yaml');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath, '');
  const tenant = { id: 'cachetest', name: 'キャッシュ確認', key: 'a'.repeat(24), obsKey: 'b'.repeat(24), enabled: true, widgets: [], access: {} };
  if (hosted) fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({ tenants: [tenant], global: { access: {} } }));

  const port = await unusedPort();
  const env = { ...process.env };
  for (const key of ENV_STRIP) delete env[key];
  Object.assign(env, {
    PORT: String(port),
    HOST: '127.0.0.1',
    TW_CONFIG: configPath,
    TW_DATA: dataDir,
    TW_RENTAL_AUTOCONNECT: '0',
    TW_RESUME_CONNECT: '0',
    TW_ADMIN_TOKEN: 'cache-test-admin-token',
  });
  if (hosted) env.TW_HOSTED = '1';

  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(base);
  } catch (error) {
    await stopChild(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(`${error.message}\n${stderr}`);
  }
  return {
    base,
    tenant,
    async close() {
      await stopChild(child);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

async function expectNoCache(base, paths) {
  for (const urlPath of paths) {
    const response = await fetch(`${base}${urlPath}`);
    await response.arrayBuffer();
    assert.equal(response.status, 200, urlPath);
    assert.equal(response.headers.get('cache-control'), 'no-cache', urlPath);
  }
}

function getRaw(base, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}${urlPath}`, { headers }, (res) => {
      res.resume();
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.once('error', reject);
  });
}

async function expectRevalidated(base, urlPath) {
  // Node の fetch は確認用の cache-control も自動で足すため、条件付き応答だけを見るときは生の HTTP を使う。
  const first = await getRaw(base, urlPath);
  assert.equal(first.status, 200, urlPath);
  const etag = first.headers.etag;
  assert.ok(etag, `${urlPath} に ETag がある`);

  const second = await getRaw(base, urlPath, { 'If-None-Match': etag });
  assert.equal(second.status, 304, urlPath);
}

test('1人用の公開ファイルは no-cache で配り、ETag の 304 が残る', async () => {
  const server = await startServer({ hosted: false });
  try {
    await expectNoCache(server.base, [
      '/widgets/counter.html',
      '/widgets/lib/overlay.js',
      '/widgets/lib/overlay.css',
      '/widgets/img/boss-1.png',
      '/dashboard/app.js',
      '/admin/admin.js',
      '/monitor/index.html',
      '/history/history.js',
      '/help/index.html',
      '/widgets/gift-alert/styles.json',
    ]);
    await expectRevalidated(server.base, '/widgets/lib/overlay.js');

    const vendor = await fetch(`${server.base}/vendor/fonts/zen-kaku-gothic-new/japanese-400.css`);
    await vendor.arrayBuffer();
    assert.equal(vendor.status, 200);
    assert.match(vendor.headers.get('cache-control') ?? '', /max-age=604800/);
  } finally {
    await server.close();
  }
});

test('配信者ごとの公開ファイルは no-cache で配り、ETag の 304 が残る', async () => {
  const server = await startServer({ hosted: true });
  try {
    const obs = `/t/${server.tenant.obsKey}`;
    const owner = `/t/${server.tenant.key}`;
    await expectNoCache(server.base, [
      `${obs}/widgets/counter.html`,
      `${obs}/widgets/lib/overlay.js`,
      `${obs}/widgets/lib/overlay.css`,
      `${obs}/widgets/img/boss-1.png`,
      `${owner}/dashboard/app.js`,
      `${owner}/admin/admin.js`,
      '/dashboard/app.js',
      '/admin/admin.js',
    ]);
    await expectRevalidated(server.base, `${obs}/widgets/lib/overlay.js`);

    const locked = await fetch(`${server.base}${obs}/widgets/cutin.html`);
    const lockedBody = await locked.text();
    assert.equal(locked.status, 200);
    assert.equal(locked.headers.get('cache-control'), 'no-cache');
    assert.equal(lockedBody, fs.readFileSync(path.join(repoRoot, 'public', 'widgets', 'locked.html'), 'utf8'));

    const vendor = await fetch(`${server.base}/vendor/fonts/zen-kaku-gothic-new/japanese-400.css`);
    await vendor.arrayBuffer();
    assert.equal(vendor.status, 200);
    assert.match(vendor.headers.get('cache-control') ?? '', /max-age=604800/);
  } finally {
    await server.close();
  }
});
