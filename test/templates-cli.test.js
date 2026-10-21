// 配信テンプレートの CLI が開発サーバーだけを呼ぶことを確かめる。

import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { spawn } from 'node:child_process';

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['bin/tw.js', ...args], { cwd: process.cwd(), env: { ...process.env, ...env }, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('CLI の templates 一覧・preview・apply は HTTP API を呼ぶ', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/me') return res.end(JSON.stringify({ mode: 'local' }));
    if (req.url === '/api/templates') return res.end(JSON.stringify([{ id: 'bougai', name: '妨害マイクラ', desc: '説明' }]));
    res.end(JSON.stringify({ ok: true, rows: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const env = { TW_SERVER: `http://127.0.0.1:${server.address().port}`, TW_HOSTED: '' };
    assert.equal((await runCli(['templates'], env)).code, 0);
    assert.equal((await runCli(['templates', 'preview', 'bougai'], env)).code, 0);
    assert.equal((await runCli(['templates', 'apply', 'bougai'], env)).code, 0);
  } finally {
    server.close();
  }
});

test('CLI は hosted の送り先へテンプレート操作を送らない', async () => {
  let templateCalls = 0;
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/me') return res.end(JSON.stringify({ mode: 'tenant' }));
    templateCalls++;
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const out = await runCli(['templates', 'apply', 'bougai'], { TW_SERVER: `http://127.0.0.1:${server.address().port}`, TW_HOSTED: '' });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /マルチテナント/);
    assert.equal(templateCalls, 0);
  } finally {
    server.close();
  }
});
