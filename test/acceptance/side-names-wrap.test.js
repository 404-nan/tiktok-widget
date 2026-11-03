// カード docs/cards/side-names-wrap.md の AC-1〜4 を、本物のサーバーと実ブラウザで確かめる受け入れテスト。
// AC-5(既存のテストが全部通る)は npm test そのものなので、ここには書かない。
// 空の設定・空のデータで別ポートに立てた一時サーバーを使う。本番(3939)・開発(3940)は使わない。
// 証拠の写真(artifacts/shots/)はレビュー役が見るので、ここでは撮らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findFreePort, waitForHttp } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
const SWITCH_NAME = '見本を出す';
// 切れていた名前(カードの「なぜ要るか」にある4つ)。文字そのものは変えない
const CUT_NAMES = ['パチンコ演', 'ダレ場の小', 'ステップア', 'ギフト別サ'];
// 幅390の下のタブ。今の見た目(空のデータで測った値)のまま
const TAB_LABELS = ['ホーム', 'ウィジェット', '記録', 'その他'];
const TAB_SIZE = { width: 95.5, height: 53.19, fontSize: '12px', fontWeight: '500' };

let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const e2e = (name, fn) => test(name, { timeout: 180_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  await fn();
});

async function startEmptyServer() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'side-names-wrap-'));
  const dataDir = path.join(tempRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(tempRoot, 'config.yaml');
  fs.writeFileSync(configPath, '');
  const port = await findFreePort();
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', TW_ENV: 'dev', TW_CONFIG: configPath, TW_DATA: dataDir };
  for (const key of ['TIKTOK_USERNAME', 'TW_VAULT', 'TW_HOSTED', 'TW_SERVER', 'TW_AI_TOKEN']) delete env[key];
  const child = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env, stdio: ['ignore', 'ignore', 'ignore'] });
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 3000); });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  };
  try { await waitForHttp(`${baseUrl}/healthz`); } catch (error) { await stop(); throw error; }
  return { baseUrl, stop };
}

// 全部のウィジェットを左の列に出す: 一覧の種類には空の1つを足す(object の種類は初めから出ている)
async function enableAllWidgets(baseUrl) {
  const { sections } = await (await fetch(`${baseUrl}/api/config/schema`)).json();
  for (const [name, section] of Object.entries(sections)) {
    if (section.kind === 'object' || ['theme', 'obs', 'minecraft'].includes(name)) continue;
    const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: [name, 'a'], value: {} }) });
    const body = await res.json().catch(() => ({}));
    assert.ok(res.ok && !body.errors?.length, `${name} を出せません: ${JSON.stringify(body.error ?? body.errors)}`);
  }
}

async function openHome(browser, baseUrl, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  return page;
}

// 「配信ソフトに入れる URL」の画面(ホームの準備カードの「入れ方を見る」から)
async function openUrlScreen(page) {
  await page.getByRole('button', { name: '入れ方を見る' }).first().click();
  await page.getByText('配信ソフトに入れる URL', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function withPage({ width, height = 900, allWidgets = false, url = false }, run) {
  const server = await startEmptyServer();
  const browser = await chromium.launch({ headless: true });
  try {
    if (allWidgets) await enableAllWidgets(server.baseUrl);
    const page = await openHome(browser, server.baseUrl, width, height);
    if (url) await openUrlScreen(page);
    await run(page);
  } finally {
    await browser.close();
    await server.stop();
  }
}

const horizontalOverflow = (page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));

e2e('AC-1 幅1280で全部のウィジェットを出すと、左の列の名前は切れず、折り返し、省略記号も使わない。名前の文字は変わらない', async () => {
  await withPage({ width: 1280, allWidgets: true }, async (page) => {
    const items = await page.locator('.side-item').evaluateAll((els) => els
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => {
        const span = el.lastElementChild; // 名前の span(先頭は絵)
        const style = getComputedStyle(span);
        return {
          text: span.textContent,
          fullName: el.dataset.name,
          scrollWidth: span.scrollWidth, clientWidth: span.clientWidth,
          scrollHeight: span.scrollHeight, clientHeight: span.clientHeight,
          whiteSpace: style.whiteSpace, textOverflow: style.textOverflow,
        };
      }));
    assert.ok(items.length > 20, `左の列の項目が少なすぎます: ${items.length}`);
    for (const name of CUT_NAMES) assert.ok(items.some((i) => i.text === name), `名前「${name}」が左の列にありません(文字が変わっています)`);
    for (const item of items) {
      assert.ok(item.scrollWidth <= item.clientWidth, `「${item.text}」が横に切れています: ${item.scrollWidth} > ${item.clientWidth}`);
      // 縦だけ1pxの丸めを許す(行の高さが小数のとき scrollHeight は切り上げ、clientHeight は切り捨てになる)。1行切れれば14px以上ずれる
      assert.ok(item.scrollHeight <= item.clientHeight + 1,`「${item.text}」が縦に切れています: ${item.scrollHeight} > ${item.clientHeight}`);
      assert.ok(!['nowrap', 'pre'].includes(item.whiteSpace), `「${item.text}」が折り返しません: white-space ${item.whiteSpace}`);
      assert.ok(!item.textOverflow.includes('ellipsis'), `「${item.text}」に省略記号を使っています`);
      assert.ok(!item.text.includes('…'), `「${item.text}」の文字に省略記号が入っています`);
    }
  });
});

e2e('AC-2 高さ720の窓でも、左の列の全部の項目と「使い方」「設定」にスクロールで届く', async () => {
  await withPage({ width: 1280, height: 720, allWidgets: true }, async (page) => {
    const count = await page.locator('.side-item').count();
    assert.ok(count > 20, `左の列の項目が少なすぎます: ${count}`);
    for (let i = 0; i < count; i += 1) {
      const item = page.locator('.side-item').nth(i);
      if (!(await item.isVisible())) continue;
      const label = (await item.locator(':scope > :last-child').textContent()) ?? `#${i}`;
      await item.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
      const box = await item.boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 720, `「${label}」にスクロールしても窓の中に入りません: y ${box.y}〜${box.y + box.height}`);
    }
    for (const name of ['使い方', '設定']) {
      const item = page.locator('.side-item', { hasText: name }).first();
      await item.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
      const box = await item.boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 720, `「${name}」にスクロールしても窓の中に入りません: y ${box.y}〜${box.y + box.height}`);
    }
  });
});

e2e('AC-3 幅390の URL の画面で、「見本を出す」のスイッチは幅44・高さ26。押すとオンになり、もう一度押すとオフに戻る', async () => {
  await withPage({ width: 390, url: true }, async (page) => {
    const sw = page.getByRole('checkbox', { name: SWITCH_NAME });
    await sw.waitFor({ state: 'visible', timeout: 15_000 });
    const box = await sw.boundingBox();
    assert.ok(Math.abs(box.width - 44) <= 1, `スイッチの幅が44ではありません: ${box.width}`);
    assert.ok(Math.abs(box.height - 26) <= 1, `スイッチの高さが26ではありません: ${box.height}`);
    assert.equal(await sw.isChecked(), false, '初めはオフのはずです');
    await sw.click();
    await page.waitForFunction((n) => document.querySelector(`input[aria-label="${n}"]`)?.checked === true, SWITCH_NAME, { timeout: 10_000 });
    await sw.click();
    await page.waitForFunction((n) => document.querySelector(`input[aria-label="${n}"]`)?.checked === false, SWITCH_NAME, { timeout: 10_000 });
    const after = await sw.boundingBox();
    assert.ok(Math.abs(after.width - 44) <= 1 && Math.abs(after.height - 26) <= 1, `押したあとに形が崩れています: ${after.width}x${after.height}`);
  });
});

for (const width of [390, 1280]) {
  e2e(`AC-4 幅${width}で、ホームも URL の画面も、ページが横にはみ出さない`, async () => {
    await withPage({ width, allWidgets: true }, async (page) => {
      let size = await horizontalOverflow(page);
      assert.ok(size.scroll <= size.inner, `ホームが横にはみ出しています: ${size.scroll} > ${size.inner}`);
      await openUrlScreen(page);
      size = await horizontalOverflow(page);
      assert.ok(size.scroll <= size.inner, `URL の画面が横にはみ出しています: ${size.scroll} > ${size.inner}`);
    });
  });
}

e2e('AC-4 幅390の下のタブの見た目と文字は今のまま', async () => {
  await withPage({ width: 390 }, async (page) => {
    const tabs = await page.locator('#rkTabs > *').evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { text: el.innerText.trim(), width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight };
    }));
    assert.deepEqual(tabs.map((t) => t.text), TAB_LABELS);
    for (const tab of tabs) {
      assert.ok(Math.abs(tab.width - TAB_SIZE.width) <= 1, `タブ「${tab.text}」の幅が変わりました: ${tab.width}`);
      assert.ok(Math.abs(tab.height - TAB_SIZE.height) <= 1, `タブ「${tab.text}」の高さが変わりました: ${tab.height}`);
      assert.equal(tab.fontSize, TAB_SIZE.fontSize, `タブ「${tab.text}」の文字の大きさが変わりました`);
      assert.equal(tab.fontWeight, TAB_SIZE.fontWeight, `タブ「${tab.text}」の文字の太さが変わりました`);
    }
  });
});
