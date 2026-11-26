// 実際の server.js を起動し、公開用の /healthz ルートが healthz 判定と起動時の版情報を返すことを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { PRODUCT_VERSION } from '../src/version.js';

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

async function waitForHealth(port) {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server.js の /healthz が起動しませんでした');
}

async function withServer(extraEnv, check) {
  const port = await unusedPort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-healthz-server-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TW_DATA: dataDir, TW_RENTAL_AUTOCONNECT: '0', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const body = await waitForHealth(port);
    await check(body);
  } finally {
    child.kill();
    // 起動に失敗して既に終わっている子は 'exit' が二度と来ない。待ち続けるとテスト全体が止まる（2026-11-22 の事故）
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('実際の server.js の /healthz は live・版・コミットを返し、名前を返さない', async () => {
  await withServer({}, async (body) => {
    assert.equal(body.ok, true);
    assert.equal(body.live, 0);
    assert.equal(body.version, PRODUCT_VERSION);
    assert.match(body.commit, /^[0-9a-f]{40}$/);
    assert.equal(JSON.stringify(body).includes('username'), false);
  });
});

test('TW_COMMIT は起動したサーバーの /healthz の commit になる', async () => {
  const commit = 'abcdef0123456789abcdef0123456789abcdef01';
  await withServer({ TW_COMMIT: commit }, async (body) => {
    assert.equal(body.commit, commit);
  });
});
