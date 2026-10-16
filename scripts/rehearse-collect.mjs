// rehearse.sh から呼ぶ。起動中の 3941 / 3942 を読み、Chromium 103 で画面を開く。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const dataDir = process.argv[2];
const shotsDir = process.argv[3];
const outFile = process.argv[4];
const tenants = JSON.parse(fs.readFileSync(path.join(dataDir, 'tenants.json'), 'utf8')).tenants ?? [];

async function grab(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('json')) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, text, json };
}

function widgetNames(html) {
  const names = new Set();
  for (const block of html.matchAll(/const (?:map|fullMap) = \{([\s\S]*?)\};/g)) {
    for (const key of block[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)) names.add(key[1]);
  }
  return [...names].sort();
}

function schemaItems(json) {
  const sections = json?.sections ?? {};
  return Object.entries(sections).map(([id, section]) => ({
    id,
    title: section?.title ?? '',
    fields: Object.keys(section?.fields ?? {}).sort(),
  }));
}

function flatten(value, prefix, acc) {
  if (value == null || typeof value !== 'object') {
    acc.push([prefix, value]);
    return;
  }
  if (Array.isArray(value)) {
    acc.push([prefix, JSON.stringify(value)]);
    return;
  }
  const keys = Object.keys(value).sort();
  if (!keys.length) {
    acc.push([prefix, '{}']);
    return;
  }
  for (const key of keys) flatten(value[key], prefix ? `${prefix}.${key}` : key, acc);
}

function configRows(config) {
  const acc = [];
  flatten(config ?? {}, '', acc);
  return acc;
}

const rows = [];
for (const t of tenants) {
  const dash = `/t/${t.key}/dashboard/`;
  const all = `/t/${t.obsKey}/widgets/all.html`;
  const configUrl = `/t/${t.key}/api/config`;
  const schemaUrl = `/t/${t.key}/api/config/schema`;
  const side = {};
  for (const [label, port] of [['release', 3941], ['old', 3942]]) {
    const base = `http://127.0.0.1:${port}`;
    const dashboard = await grab(base + dash);
    const allPage = await grab(base + all);
    const config = await grab(base + configUrl);
    const schema = await grab(base + schemaUrl);
    side[label] = {
      dashboardStatus: dashboard.status,
      dashboardShell: dashboard.text.includes('id="side"'),
      schema: schemaItems(schema.json),
      config: config.json?.config ?? null,
      configStatus: config.status,
      allStatus: allPage.status,
      allWidgets: widgetNames(allPage.text),
      allLocked: allPage.text.includes('locked') && allPage.text.includes('<title>') && !allPage.text.includes('全部まとめて'),
    };
  }
  rows.push({ id: t.id, name: t.name, key: t.key, obsKey: t.obsKey, side });
}

fs.mkdirSync(shotsDir, { recursive: true });
const require = createRequire('/tmp/pptr103/package.json');
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  defaultViewport: { width: 1280, height: 800 },
});
const first = tenants[0];
const pages = [
  ['all', `http://127.0.0.1:3941/t/${first.obsKey}/widgets/all.html`, { width: 1080, height: 1920 }],
  ['roulette', `http://127.0.0.1:3941/t/${first.obsKey}/widgets/roulette.html`, { width: 600, height: 680 }],
  ['cutin', `http://127.0.0.1:3941/t/${first.obsKey}/widgets/cutin.html`, { width: 1080, height: 1920 }],
  ['dashboard', `http://127.0.0.1:3941/t/${first.key}/dashboard/`, { width: 1280, height: 800 }],
];
const chromium = [];
try {
  for (const [name, url, viewport] of pages) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    let status = 0;
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      status = res ? res.status() : 0;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      errors.push(`goto: ${err.message}`);
    }
    const file = path.join(shotsDir, `${name}.png`);
    await page.screenshot({ path: file });
    chromium.push({ name, url, status, errors, file: `shots/rehearsal/${name}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}

const version = (() => {
  try { return require('/tmp/pptr103/node_modules/puppeteer/package.json').version; } catch { return '14.4.1'; }
})();
fs.writeFileSync(outFile, JSON.stringify({ rows, chromium, puppeteer: version }, null, 2));
console.log(`collected ${rows.length} tenants, shots ${chromium.length}`);
