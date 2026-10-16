// 画面テストの前に、使い捨てのデータ(.dev/visual)と決まった乱数で開発サーバーを起動する
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDev } from '../../scripts/dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup() {
  fs.rmSync(path.join(root, '.dev', 'visual'), { recursive: true, force: true });
  const dev = await startDev({ name: 'visual', quiet: true, seed: 20261016 });
  process.env.TW_VISUAL_URL = dev.url;
  return async () => { await dev.stop(); };
}
