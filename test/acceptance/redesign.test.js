// カード docs/cards/redesign.md の AC-1〜AC-8 を、ソースと実際のブラウザ(PC 1280・スマホ 390)で確かめる。
// AC-6 のうち既存の kind-ui テストと npm test は、それ自体が確かめるのでここでは繰り返さない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const read = (file) => fs.readFileSync(`${root}${file}`, 'utf8');
const BASELINE = '3c64ac4'; // カードを書いた時点のコミット。ここから「変えない」ものを比べる
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';

// ---- AC-2: 色は CSS 変数の2組(黄色・紙)だけ -------------------------------------------

const THEME_SELECTORS = {
  dark: [':root', 'html', '[data-theme=dark]', '[data-theme="dark"]', 'html[data-theme=dark]', 'html[data-theme="dark"]'],
  light: ['[data-theme=light]', '[data-theme="light"]', 'html[data-theme=light]', 'html[data-theme="light"]'],
};
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|hwb)\(\s*(?!var\()/i;

// style.css を { selector, prop, value } の並びにする(@media などの入れ子も辿る)
function declarations(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, 'url()');
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of clean) {
    if (ch === '{') { stack.push(buf.trim()); buf = ''; }
    else if (ch === '}') { pushDecl(buf); stack.pop(); buf = ''; }
    else if (ch === ';') { pushDecl(buf); buf = ''; }
    else buf += ch;
  }
  function pushDecl(text) {
    const i = text.indexOf(':');
    if (i < 0 || !stack.length) return;
    out.push({ selector: stack[stack.length - 1], prop: text.slice(0, i).trim(), value: text.slice(i + 1).trim() });
  }
  return out;
}
const selectorsOf = (selector) => selector.split(',').map((s) => s.trim());
const themeOf = (selector) => {
  const parts = selectorsOf(selector);
  for (const [name, list] of Object.entries(THEME_SELECTORS)) if (parts.every((p) => list.includes(p))) return name;
  return null;
};

test('AC-2: style.css の色は、黄色(ダーク)と紙(ライト)の変数の定義の中にしかない', () => {
  const colored = declarations(read('public/dashboard/style.css')).filter((d) => COLOR_LITERAL.test(d.value));
  const stray = colored.filter((d) => !d.prop.startsWith('--') || !themeOf(d.selector));
  assert.deepEqual(stray.slice(0, 10).map((d) => `${d.selector} { ${d.prop}: ${d.value} }`), [],
    `変数の定義の外に色の直書きが ${stray.length} 件あります`);
});

test('AC-2: ダークとライトが同じ名前の変数を持ち、色は黄色と紙になっている', () => {
  const colored = declarations(read('public/dashboard/style.css')).filter((d) => d.prop.startsWith('--') && COLOR_LITERAL.test(d.value));
  const names = { dark: new Set(), light: new Set() };
  const values = { dark: '', light: '' };
  for (const d of colored) {
    const theme = themeOf(d.selector);
    if (!theme) continue;
    names[theme].add(d.prop);
    values[theme] += ` ${d.value.toLowerCase()}`;
  }
  assert.ok(names.dark.size > 0 && names.light.size > 0, 'ダークとライトの両方に色の変数が要ります');
  assert.deepEqual([...names.dark].sort(), [...names.light].sort(), 'ダークとライトで変数の名前がそろっていません');
  // 黄色は redesign-existing-projects の決まり(差し色の彩度は80%未満)で #FFE600 から少し落とした
  assert.match(values.dark, /#e5cf3f/, 'ダークの色が黄色ではありません');
  assert.match(values.light, /#f3f1ec/, 'ライトの色が紙(1c.html の paper)ではありません');
});

// ---- AC-7 / AC-8: 変えないもの、直すもの ---------------------------------------------------

const changedSinceBaseline = (...paths) => execFileSync('git', ['diff', '--name-only', BASELINE, '--', ...paths], { cwd: root, encoding: 'utf8' }).trim();

test('AC-7: 公開ウィジェット・設定ファイルの形(schema)・API は変わっていない', () => {
  assert.equal(changedSinceBaseline('src', 'public/widgets'), '');
});

test('AC-8: README(全体とダッシュボードのフォルダ)が直っている', () => {
  assert.notEqual(changedSinceBaseline('README.md'), '', 'README.md が直っていません');
  assert.notEqual(changedSinceBaseline('public/dashboard/README.md'), '', 'public/dashboard/README.md が直っていません');
  assert.doesNotMatch(read('public/dashboard/README.md'), /モニター・統計・設定/, '古い上のタブの説明が残っています');
});

// ---- AC-3 / AC-4: ソースの上での確認 --------------------------------------------------------

test('AC-3: 配信中に見る・配信の記録でダッシュボードの外へ移らない', () => {
  const sources = ['editor.js', 'app.js', 'common.js'].map((f) => read(`public/dashboard/${f}`)).join('\n');
  assert.doesNotMatch(sources, /location\.(?:href\s*=|assign\(|replace\()[^;\n]*\/(?:monitor|history)\//);
  assert.doesNotMatch(read('public/dashboard/index.html'), /id="tabs"|モニター・統計・設定/);
});

test('AC-4: 見え方の枠に切り替えがあり、配信画面ぜんぶは all.html を preview=1 で映す', () => {
  const source = ['editor.js', 'app.js', 'stage.js'].map((f) => read(`public/dashboard/${f}`)).join('\n') + read('public/dashboard/index.html');
  assert.match(source, /このウィジェットだけ/);
  assert.match(source, /配信画面ぜんぶ/);
  assert.match(source, /widgets\/all\.html/);
});

// ---- AC-1 / 3 / 4 / 5: 実際のブラウザで歩く ------------------------------------------------

let chromium = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch { /* 撮影の道具が無い環境では、ブラウザのテストだけ飛ばす */ }

async function withPage(width, height, run) {
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await run(page, server.baseUrl);
  } finally {
    await browser.close();
    await server.stop();
  }
}

// 見えている、指定の文字のものを順に返す(x, y, width, height つき)
async function visible(page, label) {
  const out = [];
  for (const locator of await page.getByText(label, { exact: typeof label === 'string' }).all()) {
    const box = await locator.boundingBox();
    if (box && box.width > 0 && box.height > 0) out.push({ locator, box });
  }
  return out;
}
const one = async (page, label, where, message) => {
  const found = (await visible(page, label)).find(({ box }) => where(box));
  assert.ok(found, message ?? `${label} が決まった場所に見つかりません`);
  return found;
};

const browserTest = (name, fn) => test(name, { skip: chromium ? false : 'playwright がありません', timeout: 180_000 }, fn);

browserTest('AC-1: PC 1280 で、左のアイコン列・上の帯・ウィジェットの画面が案1の組み立てになっている', async () => {
  await withPage(1280, 900, async (page) => {
    const inRail = (b) => b.x < 96 && b.width < 160;
    const home = await one(page, 'ホーム', inRail, '左の列に「ホーム」がありません');
    const guide = await one(page, '使い方', inRail, '左の列に「使い方」がありません');
    const settings = await one(page, '設定', inRail, '左の列に「設定」がありません');
    await one(page, 'その他', inRail, '左の列に「その他」がありません');
    assert.ok(guide.box.y > home.box.y + 300 && settings.box.y > guide.box.y, '使い方と設定が左の列のいちばん下に並んでいません');
    for (const label of ['配信中に見る', '配信の記録', 'ためしに動かす']) {
      await one(page, label, (b) => b.y < 72 && b.x > 72, `上の帯に「${label}」がありません`);
    }
    await (await one(page, /^ギフト/, inRail, '左の列にギフトのウィジェットがありません')).locator.click();
    const preview = await page.locator('#preview').boundingBox();
    assert.ok(preview, '見え方の枠(#preview)がありません');
    assert.ok(preview.x >= 72 && preview.width >= (1280 - 72) * 0.5, `見え方の枠が主役の大きさではありません(幅 ${preview.width})`);
    const tryPanel = await one(page, '配信ソフトに入れる', (b) => b.x > preview.x + preview.width * 0.6, '右に URL の欄がありません');
    assert.ok(tryPanel.box.y < preview.y + preview.height, 'URL の欄が見え方の枠の右ではなく下にあります');
    await one(page, 'どんなときに出す？', (b) => b.y > preview.y + preview.height - 1, '設定が見え方の枠の下にありません');
  });
});

browserTest('AC-3: 配信中に見る・配信の記録を開いても、左の列と上の帯が残り、URL の階層から出ない', async () => {
  await withPage(1280, 900, async (page, baseUrl) => {
    const start = new URL(page.url()).pathname;
    for (const label of ['配信中に見る', '配信の記録']) {
      await (await one(page, label, (b) => b.y < 72, `上の帯に「${label}」がありません`)).locator.click();
      await page.waitForTimeout(800);
      assert.equal(new URL(page.url()).pathname, start, `${label}でダッシュボードの外へ移りました`);
      assert.ok(page.url().startsWith(baseUrl));
      await one(page, 'ホーム', (b) => b.x < 96, `${label}で左の列が消えました`);
      await one(page, '配信中に見る', (b) => b.y < 72, `${label}で上の帯が消えました`);
    }
  });
});

browserTest('AC-4: 見え方の枠で「このウィジェットだけ / 配信画面ぜんぶ」を切り替えられる', async () => {
  await withPage(1280, 900, async (page) => {
    await (await one(page, /^ギフト/, (b) => b.x < 96)).locator.click();
    await (await one(page, '配信画面ぜんぶ', () => true)).locator.click();
    const all = page.locator('iframe[src*="all.html"]');
    await all.first().waitFor({ state: 'attached', timeout: 10_000 });
    assert.match(await all.first().getAttribute('src'), /[?&]preview=1\b/, 'preview=1 が付いていません');
    await (await one(page, 'このウィジェットだけ', () => true)).locator.click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('iframe[src*="all.html"]:visible').count(), 0, '「このウィジェットだけ」に戻っても配信画面ぜんぶが残っています');
  });
});

browserTest('AC-5: スマホ 390 で下のタブが出て、全部のタブが押せる', async () => {
  await withPage(390, 800, async (page) => {
    const bottom = (b) => b.y > 800 - 120;
    const labels = ['ホーム', 'ウィジェット', '配信中', '記録', 'その他'];
    for (const label of labels) {
      const tab = await one(page, label, bottom, `下のタブに「${label}」がありません`);
      assert.ok(tab.box.height >= 44, `「${label}」のタブが 44px より低いです(${tab.box.height})`);
    }
    for (const label of labels) {
      await (await one(page, label, bottom)).locator.click({ timeout: 5_000 }); // 幕がかぶっていると、ここで失敗する
      await page.waitForTimeout(400);
      for (const other of labels) await one(page, other, bottom, `「${label}」を押したあと、下のタブが消えました`);
    }
    await (await one(page, 'その他', bottom)).locator.click();
    await one(page, '使い方', () => true, '「その他」の中に使い方がありません');
    await one(page, '設定', (b) => b.y < 800 - 120, '「その他」の中に設定がありません');
  });
});
