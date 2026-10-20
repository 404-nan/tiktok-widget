// 実際の server.js を起動し、公開用の /healthz ルートが healthz 判定につながることを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';

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

test('実際の server.js の /healthz は live を返し、名前を返さない', async () => {
  const port = await unusedPort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-healthz-server-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TW_DATA: dataDir, TW_RENTAL_AUTOCONNECT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const body = await waitForHealth(port);
    assert.deepEqual(body, { ok: true, live: 0 });
    assert.equal(JSON.stringify(body).includes('username'), false);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
