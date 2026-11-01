// カード docs/cards/active-label.md の AC-1〜3 を確かめる受け入れテスト。
// AC-4(npm test が全部通る)は全体のテストで確かめるのでここでは書かない。
// AC-3 は実ブラウザで dev の画面を開く。playwright が無い環境では飛ばさず失敗にする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
const NEW_WORD = '配信ではこれが出る';
const OLD_WORD = '配信で使用中';

// ---- AC-1 ----

// 左の列(スマホは下のタブ「ウィジェット」で出る一覧)から、そのウィジェットを開く。ホームの「使っているもの」は 198d901 で無くなった
async function openFromMenu(page, title) {
  const tab = page.locator('.rk-tab', { hasText: 'ウィジェット' });
  if (await tab.isVisible()) await tab.click();
  const open = page.locator(`.side-item[data-name="${title}"]`);
  await open.waitFor({ state: 'visible', timeout: 15_000 });
  await open.click();
  await page.waitForTimeout(1200);
}

test('AC-1 editor.js の entry-active ラベルの文字が「配信ではこれが出る」で、つないでいることを言う言葉が無い', () => {
  const src = readFileSync(`${root}public/dashboard/editor.js`, 'utf8');
  const m = src.match(/className\s*=\s*'entry-active';\s*\n?\s*\w+\.textContent\s*=\s*'([^']*)'/);
  assert.ok(m, 'entry-active のラベルの文字が見つかりません');
  assert.equal(m[1], NEW_WORD);
  assert.ok(!/使用中|配信中/.test(m[1]), `ラベルに「使用中」「配信中」が残っています: ${m[1]}`);
});

// ---- AC-2 ----

test('AC-2 docs/words.md に「配信ではこれが出る|配信で使用中|…」の1行がある', () => {
  const lines = readFileSync(`${root}docs/words.md`, 'utf8').split('\n');
  const want = `${NEW_WORD}|${OLD_WORD}|配信につないでいなくても付くので、つないでいると読ませない`;
  const norm = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()).join('|');
  assert.ok(lines.some((l) => norm(l) === want), `words.md に次の1行がありません: ${want}`);
});

// ---- AC-3 ----

test('AC-3 配信につないでいない新しい配信者の、カットインのタブに「配信ではこれが出る」が1つだけ見え、「配信で使用中」がどこにも無い', { timeout: 180_000 }, async () => {
  let chromium;
  try { ({ chromium } = await import(PLAYWRIGHT)); } catch (e) { assert.fail(`playwright が使えません(skip にせず失敗にする): ${e.message}`); }
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await openFromMenu(page, 'カットイン');

    let visible = 0;
    for (const el of await page.getByText(NEW_WORD).all()) if (await el.isVisible()) visible += 1;
    assert.equal(visible, 1, `「${NEW_WORD}」が見えている数: ${visible}(1つのはず)`);
    assert.equal(await page.getByText(OLD_WORD).count(), 0, `「${OLD_WORD}」が画面に残っています`);
    assert.ok(!(await page.content()).includes(OLD_WORD), `「${OLD_WORD}」が画面のどこかに残っています`);
  } finally {
    await browser.close();
    await server.stop();
  }
});
