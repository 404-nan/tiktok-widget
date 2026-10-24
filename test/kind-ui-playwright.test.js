// kind-ui-3 の画面を、PC・スマホとライト・ダークで実際に歩いて確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';

const enabled = Boolean(process.env.KIND_UI_PLAYWRIGHT);
const baseUrl = process.env.KIND_UI_URL || 'https://dev.lul.works/dashboard/';
const forbidden = ['Euler', 'API', 'MCP', 'テナント', 'トークン', 'YAML', 'JSON'];

test('AC-1〜AC-8: ダッシュボードをPC・スマホ、ライト・ダークで歩ける', { skip: !enabled, timeout: 120_000 }, async () => {
  const { chromium } = await import('/home/lul/ruu-work/tw/node_modules/playwright/index.mjs');
  for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    await page.addInitScript((nextTheme) => localStorage.setItem('tw:theme', JSON.stringify(nextTheme)), theme);
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.locator('#cards').waitFor({ state: 'visible', timeout: 60_000 });
      const text = await page.locator('body').innerText();
      for (const word of forbidden) assert.doesNotMatch(text, new RegExp(word));
      const geometry = await page.evaluate(() => {
        const side = document.querySelector('.side')?.getBoundingClientRect();
        const main = document.querySelector('.shell-main')?.getBoundingClientRect();
        return { side, main };
      });
      assert.ok(geometry.side && geometry.main, 'サイドバーと中身がありません');
      assert.ok(geometry.main.width >= (width === 390 ? 340 : 600), `${width}pxで本文が細すぎます`);
      if (width >= 900) assert.ok(geometry.main.left >= geometry.side.right, `${width}pxで中身がサイドバーに重なっています`);
      else {
        assert.ok(geometry.side.right <= 0, 'スマホのサイドバーが最初から開いています');
        await page.locator('#mobileMenuBtn').click();
        await page.locator('#side.is-open').waitFor({ state: 'visible' });
        await page.locator('.side-settings').evaluate((element) => element.click());
        await page.locator('#settingsView').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#advancedConnection').getAttribute('open'), null);
        await page.locator('#mobileMenuBtn').click();
        await page.locator('#mobileMenuBackdrop').click();
        await page.locator('#side.is-open').waitFor({ state: 'hidden' });
      }
      await page.screenshot({ path: `/tmp/kind-ui-3-${theme}-${width}.png`, fullPage: true });
    } finally {
      await browser.close();
    }
  }
});
