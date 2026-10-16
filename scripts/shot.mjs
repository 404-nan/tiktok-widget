// デモモードで開発サーバーを起動し、ウィジェットを撮って artifacts/shots/ に保存する(git に入れない)。
//   npm run shot -- cutin            … 縦(1080x1920)と横(1920x1080)の2枚
//   npm run shot -- slot --wait 6000 … 撮るまでの時間(ms、既定 3000)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startDev } from './dev.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const waitIdx = args.indexOf('--wait');
const wait = waitIdx >= 0 ? Number(args[waitIdx + 1]) : 3000;
const page = name && (name.endsWith('.html') ? name : `${name}.html`);
if (!page || !fs.existsSync(path.join(root, 'public/widgets', page))) {
  const list = fs.readdirSync(path.join(root, 'public/widgets')).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
  console.error(`使い方: npm run shot -- <widget名>\nwidget名: ${list.join(' ')}`);
  process.exit(2);
}

const dev = await startDev({ demo: true, name: 'shot', quiet: true });
const browser = await chromium.launch();
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const outDir = path.join(root, 'artifacts', 'shots');
fs.mkdirSync(outDir, { recursive: true });
try {
  for (const [label, viewport] of [['tate', { width: 1080, height: 1920 }], ['yoko', { width: 1920, height: 1080 }]]) {
    const p = await browser.newPage({ viewport });
    await p.goto(`${dev.url}/widgets/${page}`);
    await p.waitForTimeout(wait);
    const out = path.join(outDir, `${page.replace(/\.html$/, '')}-${label}-${stamp}.png`);
    await p.screenshot({ path: out, omitBackground: true });
    console.log(path.relative(root, out));
    await p.close();
  }
} finally {
  await browser.close();
  await dev.stop();
}
