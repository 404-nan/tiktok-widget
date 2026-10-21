// 本番から隔離した一時設定・一時データで、計測対象のサーバーを起動して閉じる。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

export async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function waitForHttp(url, timeoutMs = 15_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`サーバーが起動しませんでした: ${lastError?.message ?? 'タイムアウト'}`);
}

export async function startLocalServer(repoRoot) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-perf-server-'));
  const dataDir = path.join(tempRoot, 'data');
  const configPath = path.join(tempRoot, 'config.yaml');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'config.example.yaml'), configPath);
  const port = await findFreePort();
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', TW_ENV: 'dev', TW_CONFIG: configPath, TW_DATA: dataDir };
  for (const key of ['TIKTOK_USERNAME', 'TW_VAULT', 'TW_HOSTED', 'TW_SERVER', 'TW_AI_TOKEN']) delete env[key];

  const child = spawn(process.execPath, [path.join(repoRoot, 'server.js')], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${baseUrl}/healthz`);
  } catch (error) {
    await stopChild(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }

  return {
    baseUrl,
    port,
    pid: child.pid,
    dataDir,
    tempRoot,
    async stop() {
      await stopChild(child);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function processMemoryMB(pid) {
  if (!pid) return null;
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${Number(pid)}).WorkingSet64`], { encoding: 'utf8', windowsHide: true });
      const bytes = Number(String(result.stdout).trim());
      return Number.isFinite(bytes) && bytes > 0 ? bytes / 1024 / 1024 : null;
    }
    const text = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = text.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return match ? Number(match[1]) / 1024 : null;
  } catch {
    return null;
  }
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(2_000).then(() => { if (child.exitCode == null) child.kill(); }),
  ]);
}
