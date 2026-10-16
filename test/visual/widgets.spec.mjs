// 主要ウィジェットの画面テスト。テスト送信(dev-trigger・simulate)でイベントを流し、決まった時刻で撮る。
// 見本画像が無いときは失敗にせず、撮った画像を artifacts/candidates/ に「候補」として出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = () => process.env.TW_VISUAL_URL;

async function post(request, route, body) {
  const res = await request.post(`${base()}${route}`, { data: body });
  expect(res.ok(), `${route} ${await res.text()}`).toBeTruthy();
}

const SEED_RANDOM = () => {
  let s = 20261016;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const gift = { kind: 'gift', user: 'テストさん', giftName: 'テストギフト', diamonds: 1000, count: 1 };

// 名前 / ページ / イベントを流す / 流してから撮るまでの時間(ms)
const CASES = [
  { name: 'cutin', page: 'cutin.html', fire: (r) => post(r, '/api/simulate', gift), wait: 1200 },
  { name: 'gacha', page: 'gacha.html', fire: (r) => post(r, '/api/dev/trigger', { target: 'gacha' }), wait: 1500 },
  { name: 'slot', page: 'slot.html', fire: (r) => post(r, '/api/dev/trigger', { target: 'slot' }), wait: 6000 },
  { name: 'boss', page: 'boss.html', fire: (r) => post(r, '/api/dev/trigger', { target: 'boss', action: 'damage', amount: 3000 }), wait: 1200 },
  { name: 'roulette', page: 'roulette.html', fire: (r) => post(r, '/api/control', { target: 'roulette', action: 'spin', data: { id: 'punishment' } }), wait: 1500 },
];

for (const c of CASES) {
  test(`${c.name} の画面`, async ({ page, request }, info) => {
    // 画面の中の乱数と時計を固定する(筆のかすれ、回転の止まる位置を毎回同じにする)
    await page.addInitScript(SEED_RANDOM);
    await page.clock.install({ time: new Date('2026-10-16T12:00:00+09:00') });
    await page.goto(`${base()}/widgets/${c.page}`);
    await page.waitForLoadState('networkidle');
    await page.clock.pauseAt(new Date('2026-10-16T12:00:05+09:00'));
    await c.fire(request);
    await page.waitForTimeout(500); // イベントが WebSocket で届くのを待つ(画面の時計は止まったまま)
    await page.clock.runFor(c.wait);
    const snap = info.snapshotPath(`${c.name}.png`);
    const opts = { animations: 'disabled', omitBackground: true, fullPage: false };
    if (fs.existsSync(snap)) {
      await expect(page).toHaveScreenshot(`${c.name}.png`, opts);
      return;
    }
    const out = path.join(root, 'artifacts', 'candidates', info.project.name, `${c.name}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ ...opts, path: out });
    info.annotations.push({ type: '候補', description: `見本が無いので候補を出しました: ${path.relative(root, out)}` });
  });
}
