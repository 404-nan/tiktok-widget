// カード docs/cards/handover-message.md の AC-1〜5 を、本物のサーバーと実ブラウザで確かめる受け入れテスト。
// 一時のデータ・空いた番号で別サーバーを立てる。本番(3939)・開発(3940)は使わない。配信者の名前と数字は、この一時データだけのもの。
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
const BUTTON = '案内文をコピー';
const ADMIN_TOKEN = 'handover-message-test-token';
const STREAMER = 'テスト配信者';

// playwright が無い環境では飛ばさず、失敗にする
let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const e2e = (name, fn) => test(name, { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  await fn();
});

// 空の設定・空のデータで、サーバーを一時ポートに立てる
async function startServer() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'handover-message-'));
  const dataDir = path.join(tempRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(tempRoot, 'config.yaml');
  fs.writeFileSync(configPath, '');
  const port = await findFreePort();
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', TW_ENV: 'dev', TW_CONFIG: configPath, TW_DATA: dataDir, TW_ADMIN_TOKEN: ADMIN_TOKEN, TW_RESUME_CONNECT: '0' };
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

const adminApi = async (baseUrl, route, body) => {
  const res = await fetch(`${baseUrl}/admin/api${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  assert.ok(res.ok, `管理 API ${route} が失敗: ${JSON.stringify(json)}`);
  return json;
};

// 配信者を1人作り、管理画面にログインして、その行が見える状態の page を渡す
async function withAdmin(run) {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const { tenant } = await adminApi(server.baseUrl, '/tenants', { name: STREAMER });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.baseUrl }).catch(() => {});
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(`${server.baseUrl}/admin/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator('#tokenInput').fill(ADMIN_TOKEN);
    await page.locator('#loginForm').evaluate((form) => form.requestSubmit());
    const row = page.locator('#rows li', { hasText: STREAMER });
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await run({ page, row, browser, baseUrl: server.baseUrl, tenant });
  } finally {
    await browser.close();
    await server.stop();
  }
}

const buttons = (page) => page.getByRole('button', { name: BUTTON });
const pinPattern = (pin) => new RegExp(`(?<!\\d)${pin}(?!\\d)`);

// 配信者の行(押すと右に詳細が開く)から、案内文のボタンを押して、コピーされた文を返す
async function copyHandover(page, row) {
  if (!(await buttons(page).first().isVisible().catch(() => false))) await row.click();
  await buttons(page).first().waitFor({ state: 'visible', timeout: 10_000 });
  await buttons(page).first().click();
  await page.waitForFunction(() => document.getElementById('message')?.textContent?.includes('コピーしました'), null, { timeout: 5000 });
  return page.evaluate(() => navigator.clipboard.readText());
}

const currentTenant = async (baseUrl, id) => (await adminApi(baseUrl, '/tenants')).tenants.find((t) => t.id === id);

e2e('AC-1 配信者の行に「案内文をコピー」のボタンが1つあり、押すとコピーされ、コピーしたと画面に出る', async () => {
  await withAdmin(async ({ page, row }) => {
    await row.click();
    await buttons(page).first().waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal(await buttons(page).count(), 1, `「${BUTTON}」のボタンが1つではありません`);
    await page.evaluate(() => { document.getElementById('message').textContent = ''; });
    await buttons(page).first().click();
    await page.waitForFunction(() => /コピー/.test(document.getElementById('message')?.textContent ?? ''), null, { timeout: 5000 });
    const shown = await page.locator('#message').innerText();
    assert.match(shown, /コピーしました/, `コピーしたと画面に出ていません: ${shown}`);
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).length > 0, 'クリップボードが空です');
  });
});

e2e('AC-2 コピーした文に、短い URL(/d/<短いID>)と4桁の数字が入り、/t/<鍵>/ の URL は入らない', async () => {
  await withAdmin(async ({ page, row, baseUrl, tenant }) => {
    const copied = await copyHandover(page, row);
    const t = await currentTenant(baseUrl, tenant.id);
    assert.ok(copied.includes(`${baseUrl}/d/${t.shortId}`), `短い URL が入っていません:\n${copied}`);
    assert.match(copied, pinPattern(t.pin), `4桁の数字が入っていません:\n${copied}`);
    assert.ok(!/\/t\//.test(copied), `/t/<鍵>/ の URL が入っています:\n${copied}`);
    for (const u of [t.urls.dashboard, t.urls.obs]) assert.ok(!copied.includes(u.match(/\/t\/([^/]+)\//)[1]), '鍵が入っています');
  });
});

e2e('AC-3 8行以内で、①URLを開いて数字 ②出すものを選ぶ ③配信ソフトにURL ④ためす の順に分かり、禁句を使わない', async () => {
  await withAdmin(async ({ page, row, baseUrl, tenant }) => {
    const copied = await copyHandover(page, row);
    const t = await currentTenant(baseUrl, tenant.id);
    const lines = copied.trim().split(/\r?\n/);
    assert.ok(lines.length <= 8, `${lines.length} 行あります(8行以内):\n${copied}`);
    for (const word of ['テナント', 'ウィジェット', 'トークン']) assert.ok(!copied.includes(word), `「${word}」を使っています:\n${copied}`);
    const at = (pattern) => lines.findIndex((line) => pattern.test(line));
    const open = at(new RegExp(`/d/${t.shortId}`));
    const choose = at(/選/);
    const obs = at(/配信ソフト/);
    const tryIt = at(/ため(す|し)|試/);
    assert.ok(open >= 0, `①URL を開く行がありません:\n${copied}`);
    assert.ok(lines.slice(open, open + 2).some((line) => line.includes(t.pin)), `①数字を入れる案内が URL の行に続いていません:\n${copied}`);
    assert.ok(choose > open, `②出すものを選ぶ行が①のあとにありません:\n${copied}`);
    assert.ok(obs > choose, `③配信ソフトに URL を入れる行が②のあとにありません:\n${copied}`);
    assert.ok(tryIt > obs, `④ためす行が③のあとにありません:\n${copied}`);
  });
});

e2e('AC-4 数字を作り直したあとにコピーすると、新しい数字が入る', async () => {
  await withAdmin(async ({ page, row, baseUrl, tenant }) => {
    const before = await copyHandover(page, row);
    const oldPin = (await currentTenant(baseUrl, tenant.id)).pin;
    assert.match(before, pinPattern(oldPin));
    await page.getByRole('button', { name: '作り直す', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('message')?.textContent?.includes('作り直しました'), null, { timeout: 10_000 });
    const newPin = (await currentTenant(baseUrl, tenant.id)).pin;
    const after = await copyHandover(page, row);
    assert.match(after, pinPattern(newPin), `新しい数字 ${newPin} が入っていません:\n${after}`);
    if (newPin !== oldPin) assert.ok(!pinPattern(oldPin).test(after), '古い数字が残っています');
  });
});

e2e('AC-5 文の中の URL を開いて文の中の数字を入れると、その配信者のダッシュボードが開く', async () => {
  await withAdmin(async ({ page, row, browser, baseUrl, tenant }) => {
    const copied = await copyHandover(page, row);
    const url = copied.match(/https?:\/\/\S+\/d\/[A-Za-z0-9_-]+/)?.[0];
    assert.ok(url, `文の中に短い URL が見つかりません:\n${copied}`);
    const pin = copied.replace(url, '').match(/(?<!\d)\d{4}(?!\d)/)?.[0];
    assert.ok(pin, `文の中に4桁の数字が見つかりません:\n${copied}`);
    // 管理画面とは別の、何も覚えていない端末で開く
    const fresh = await browser.newContext();
    try {
      const guest = await fresh.newPage();
      await guest.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // 4桁入れると画面が自分で送るので、ボタンは押さない
      await guest.locator('#pin').fill(pin);
      const t = await currentTenant(baseUrl, tenant.id);
      await guest.waitForURL(t.urls.dashboard, { timeout: 30_000 });
    } finally {
      await fresh.close();
    }
  });
});
