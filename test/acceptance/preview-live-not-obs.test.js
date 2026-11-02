// docs/cards/preview-live-not-obs.md の完成条件(AC-1〜AC-5)を確かめる受け入れテスト。
// 見本の URL(preview=1 / preview=live)でウィジェットが開く WebSocket と、待機の目印・見本の中身を実ブラウザで見る。
// AC-4 は hosted の実サーバーを一時ポートに起こし、OBS 用の鍵で gacha.html?preview=live を開いて準備の印(widgetAt)を見る。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startLocalServer, delay } from '../../scripts/perf/lib/process.mjs';
import { startHostedServer } from '../helpers/guard-harness.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const widgetsDir = path.join(root, 'public', 'widgets');
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';

let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const requireBrowser = () => assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);

const read = (file) => fs.readFileSync(file, 'utf8');
const rel = (file) => path.relative(widgetsDir, file).split(path.sep).join('/');
const listFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? listFiles(full) : [full];
});

// public/widgets の中で /ws を開くファイルを自動で集め、実際に開けるページへ対応づける。
// 新しいウィジェットが増えても、この一覧を手で直さなくても落ちる形にする。
function widgetPages() {
  const files = listFiles(widgetsDir).filter((file) => /\.(js|html)$/.test(file));
  const htmlPages = files.filter((file) => file.endsWith('.html'));
  const opensWs = files.filter((file) => !/obs-bridge\.js$/.test(file) && read(file).includes('/ws'));
  const pages = new Map();
  for (const file of opensWs) {
    const owners = file.endsWith('.html')
      ? [file]
      : htmlPages.filter((page) => path.basename(page, '.html') === path.basename(file, '.js') || read(page).includes(path.basename(file)));
    const owner = owners.find((page) => path.basename(page) !== 'all.html') ?? owners[0];
    assert.ok(owner, `${rel(file)} を開くウィジェットのページが見つかりません`);
    if (!pages.has(owner)) pages.set(owner, []);
    pages.get(owner).push(file);
  }
  assert.ok(pages.size > 10, 'WebSocket を開くウィジェットが十分に見つかりません');
  return [...pages.entries()].map(([page, covered]) => ({ page, covered }));
}

async function withLocalBrowser(run) {
  requireBrowser();
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    return await run({ server, browser });
  } finally {
    await browser.close();
    await server.stop();
  }
}

// 本物の WebSocket にはつながず、開こうとした URL だけを記録する。
async function installSocketRecorder(page) {
  await page.addInitScript(() => {
    window.__twWsUrls = [];
    class RecordingWebSocket {
      constructor(url) {
        this.url = String(url);
        this.readyState = 1;
        window.__twWsUrls.push(this.url);
        setTimeout(() => { try { this.onopen?.({}); } catch {} }, 0);
      }
      send() {}
      close() { this.readyState = 3; }
      addEventListener(type, fn) {
        if (type === 'open') setTimeout(() => { try { fn({}); } catch {} }, 0);
      }
      removeEventListener() {}
    }
    RecordingWebSocket.CONNECTING = 0;
    RecordingWebSocket.OPEN = 1;
    RecordingWebSocket.CLOSING = 2;
    RecordingWebSocket.CLOSED = 3;
    window.WebSocket = RecordingWebSocket;
  });
}

async function openWidget(page, baseUrl, file, preview) {
  const query = preview ? `?preview=${preview}` : '';
  await page.goto(`${baseUrl}/widgets/${rel(file)}${query}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForFunction(() => window.__twWsUrls?.length > 0, { timeout: 2_000 }).catch(() => {});
  await delay(150);
  const urls = await page.evaluate(() => window.__twWsUrls ?? []);
  const bodyPreview = await page.evaluate(() => document.body.classList.contains('preview'));
  return {
    urls: urls.filter((raw) => {
      try { return new URL(raw).pathname.endsWith('/ws'); } catch { return false; }
    }),
    bodyPreview,
  };
}

test('AC-1 preview=1 と preview=live では、どのウィジェットも /ws?preview=1 でつなぐ', { timeout: 180_000 }, async () => {
  const entries = widgetPages();
  await withLocalBrowser(async ({ server, browser }) => {
    const page = await browser.newPage();
    await installSocketRecorder(page);
    const bad = [];
    const notConnected = [];
    try {
      for (const { page: file } of entries) {
        for (const preview of ['1', 'live']) {
          const { urls } = await openWidget(page, server.baseUrl, file, preview);
          // preview=1 は見本を出してつながないウィジェット(cheer など)がある。preview=live は本番と同じ見え方なので必ずつなぐ
          if (preview === 'live' && urls.length === 0) notConnected.push(rel(file));
          for (const raw of urls) {
            const actual = new URL(raw).searchParams.get('preview');
            if (actual !== '1') bad.push(`${rel(file)} preview=${preview}: ${raw}`);
          }
        }
      }
    } finally {
      await page.close();
    }
    assert.deepEqual(notConnected, [], 'preview=live なのに /ws を開いていないウィジェットがあります');
    assert.deepEqual(bad, [], 'preview=1 / preview=live なのに /ws?preview=1 でつないでいないウィジェットがあります');
  });
});

test('AC-2 preview の無い URL は今までどおり、ただの /ws でつなぐ', { timeout: 120_000 }, async () => {
  const entries = widgetPages();
  await withLocalBrowser(async ({ server, browser }) => {
    const page = await browser.newPage();
    await installSocketRecorder(page);
    const bad = [];
    const notConnected = [];
    try {
      for (const { page: file } of entries) {
        const { urls } = await openWidget(page, server.baseUrl, file, '');
        if (urls.length === 0) notConnected.push(rel(file));
        for (const raw of urls) {
          const url = new URL(raw);
          if (url.searchParams.has('preview')) bad.push(`${rel(file)}: ${raw}`);
        }
      }
    } finally {
      await page.close();
    }
    assert.deepEqual(notConnected, [], 'preview が無いのに /ws を開いていないウィジェットがあります');
    assert.deepEqual(bad, [], 'preview が無いのに preview を付けてつないでいるウィジェットがあります');
  });
});

test('AC-3 body.preview と投票の見本は preview=1 のときだけ出し、preview=live では出さない', { timeout: 180_000 }, async () => {
  const htmlPages = listFiles(widgetsDir).filter((file) => file.endsWith('.html'));
  await withLocalBrowser(async ({ server, browser }) => {
    const page = await browser.newPage();
    await installSocketRecorder(page);
    const shownAtLive = [];
    try {
      for (const file of htmlPages) {
        const { bodyPreview } = await openWidget(page, server.baseUrl, file, 'live');
        if (bodyPreview) shownAtLive.push(rel(file));
      }

      const gachaSample = await openWidget(page, server.baseUrl, path.join(widgetsDir, 'gacha.html'), '1');
      assert.equal(gachaSample.bodyPreview, true, 'preview=1 のときの待機の目印(body.preview)が出ていません');
    } finally {
      await page.close();
    }
    assert.deepEqual(shownAtLive, [], 'preview=live なのに待機の目印(body.preview)を出しているページがあります');

    const vote = await browser.newPage();
    try {
      await installSocketRecorder(vote);
      await vote.goto(`${server.baseUrl}/widgets/vote.html?preview=live`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await vote.waitForTimeout(250);
      const live = await vote.evaluate(() => ({ idle: document.querySelector('#vote')?.classList.contains('idle'), rows: document.querySelectorAll('#rows .row').length }));
      assert.equal(live.idle, true, 'preview=live なのに投票の見本を出しています');
      assert.equal(live.rows, 0, 'preview=live なのに投票の見本の行を出しています');

      await vote.goto(`${server.baseUrl}/widgets/vote.html?preview=1`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await vote.waitForTimeout(250);
      const sample = await vote.evaluate(() => ({ idle: document.querySelector('#vote')?.classList.contains('idle'), rows: document.querySelectorAll('#rows .row').length }));
      assert.equal(sample.idle, false, 'preview=1 なのに投票の見本が出ていません');
      assert.ok(sample.rows > 0, 'preview=1 なのに投票の見本の行が出ていません');
    } finally {
      await vote.close();
    }
  });
});

test('AC-4 実サーバーで gacha.html?preview=live を開いても配信ソフトの接続(widgetAt)が付かない', { timeout: 120_000 }, async () => {
  requireBrowser();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-preview-live-'));
  const dataDir = path.join(tempRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(tempRoot, 'config.yaml');
  fs.writeFileSync(configPath, '');
  const tenant = { id: 't1', name: '見本', key: 'o'.repeat(24), obsKey: 'b'.repeat(24), enabled: true, widgets: ['gacha', 'alerts', 'chats', 'goals'], access: {} };
  fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({ tenants: [tenant], global: { access: {} } }));
  const server = await startHostedServer({ env: { TW_CONFIG: configPath, TW_DATA: dataDir, TW_ENV: 'dev', TW_RESUME_CONNECT: '0' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const baseUrl = await server.ready;
    const page = await browser.newPage();
    const socket = page.waitForEvent('websocket', {
      timeout: 20_000,
      predicate: (ws) => {
        try { return new URL(ws.url()).pathname.endsWith('/ws'); } catch { return false; }
      },
    });
    await page.goto(`${baseUrl}/t/${tenant.obsKey}/widgets/gacha.html?preview=live`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await socket;
    // 見本の接続が obs として数えられると、server 側がすぐ preparation.json に widgetAt を書く
    let preparation = null;
    for (let i = 0; i < 30 && !preparation; i += 1) {
      try { preparation = JSON.parse(fs.readFileSync(path.join(dataDir, 'preparation.json'), 'utf8')); } catch {}
      if (!preparation) await delay(100);
    }
    assert.equal(preparation?.widgetAt ?? null, null, 'preview=live の見本が配信ソフトの接続(widgetAt)として数えられています');
    await page.close();
  } finally {
    await browser.close();
    server.child.kill();
    await new Promise((resolve) => server.child.once('exit', resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('AC-5 public/widgets/README.md の preview の説明に preview=live が入っている', () => {
  const readme = read(path.join(widgetsDir, 'README.md'));
  const line = readme.split('\n').find((text) => text.includes('/ws?preview=1'));
  assert.ok(line, 'WebSocket と preview の説明が見つかりません');
  assert.match(line, /preview=1/);
  assert.match(line, /preview=live/);
});
