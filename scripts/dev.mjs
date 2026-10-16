// 開発サーバーを、空いているポートと使い捨てのデータ（.dev/）で起動する。
// 本物の config.yaml・data/ には触らない。作業場所を並べて同時に動かしても取り合わない。
//   npm run dev            … 起動（Ctrl+C で止める）
//   npm run dev -- --demo  … デモのイベントを流しながら起動
// ほかのスクリプトからは startDev() で使う（npm run shot、Playwright）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** .dev/<name>/ に config.yaml（見本から）と data/ を用意して、そのパスを返す */
export function prepareDevData(name = 'default') {
  const dir = path.join(root, '.dev', name);
  const data = path.join(dir, 'data');
  const config = path.join(dir, 'config.yaml');
  fs.mkdirSync(data, { recursive: true });
  if (!fs.existsSync(config)) fs.copyFileSync(path.join(root, 'config.example.yaml'), config);
  return { dir, data, config };
}

async function waitHealthy(url, child, ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (child.exitCode != null) throw new Error(`開発サーバーが終了しました（code ${child.exitCode}）`);
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('開発サーバーが起動しませんでした');
}

/** 開発サーバーを起動して { url, port, stop } を返す */
export async function startDev({ demo = false, name = 'default', quiet = false, seed = null } = {}) {
  const port = await freePort();
  const { data, config } = prepareDevData(name);
  const env = { ...process.env, TW_DEV: '1', PORT: String(port), HOST: '127.0.0.1', TW_DATA: data, TW_CONFIG: config };
  delete env.TW_HOSTED;
  delete env.TW_VAULT;
  delete env.TIKTOK_USERNAME;
  const args = [];
  if (seed != null) {
    env.TW_SEED = String(seed);
    args.push('--import', path.join(root, 'scripts/seed-random.mjs'));
  }
  args.push(path.join(root, 'server.js'));
  if (demo) args.push('--demo');
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: quiet ? 'ignore' : 'inherit' });
  const url = `http://127.0.0.1:${port}`;
  const stop = () => new Promise((resolve) => {
    if (child.exitCode != null) return resolve();
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });
  try {
    await waitHealthy(url, child);
  } catch (err) {
    await stop();
    throw err;
  }
  return { url, port, stop };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dev = await startDev({ demo: process.argv.includes('--demo') });
  console.log(`\n  開発サーバー ${dev.url}/dashboard/  （データ: .dev/default、止めるときは Ctrl+C）\n`);
  const bye = async () => { await dev.stop(); process.exit(0); };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}
