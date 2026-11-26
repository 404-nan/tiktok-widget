#!/usr/bin/env node
// 本番と同じ server.js を、開発専用の .dev 設定・データ・3940番で起動する。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const devDir = path.join(root, '.dev');
fs.mkdirSync(devDir, { recursive: true });
const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: process.env.TW_DEV_PORT || '3940',
  TW_ENV: 'dev',
  TW_CONFIG: path.join(devDir, 'config.yaml'),
  TW_DATA: path.join(devDir, 'data'),
};
console.log('tiktok-widget dev: http://127.0.0.1:3940/dashboard/ (.dev/ だけを使います)');
const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code ?? 0);
});
