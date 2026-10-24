// kind-ui-2 の画面上の文言と、サイドバーに隠れない配置をブラウザで確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';

const enabled = Boolean(process.env.KIND_UI_PLAYWRIGHT);
const baseUrl = process.env.KIND_UI_URL || 'https://dev.lul.works/dashboard/';

test('AC-1/AC-3: 画面の言葉とサイドバーとの重なり', { skip: !enabled, timeout: 60_000 }, async () => {
  const { chromium } = await import('/home/lul/ruu-work/tw/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.locator('#cards').waitFor({ state: 'visible' });
      const text = await page.locator('body').innerText();
      for (const word of ['Euler', 'API', 'MCP', 'テナント', 'トークン', 'YAML', '種類']) assert.doesNotMatch(text, new RegExp(word));
      const geometry = await page.evaluate(() => {
        const side = document.querySelector('.side')?.getBoundingClientRect();
        const main = document.querySelector('.shell-main')?.getBoundingClientRect();
        return { side, main };
      });
      assert.ok(geometry.side && geometry.main, 'サイドバーと中身がありません');
      assert.ok(geometry.main.left >= geometry.side.right, `${width}pxで中身がサイドバーに重なっています`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
