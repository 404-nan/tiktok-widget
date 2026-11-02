// カード docs/cards/live-no-widget.md の完成条件 AC-1〜5・8 を確かめる受け入れテスト。AC-6 は npm test 全体、AC-7 は目で見るので書かない。
// AC-1・5 は実物の server.js を hosted で一時ポートに起こし、本物の WebSocket と実ブラウザで確かめる。
// AC-2〜4 は実ブラウザでダッシュボードを開き、/api/status の返事と時計だけを差し替える(配信中の状態を作る口が実サーバーに無いため)。
// playwright が無い環境では飛ばさず失敗にする。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startHostedServer } from '../helpers/guard-harness.js';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLE = '配信画面にライコネが出ていません';
const BODY = '配信ソフトに URL を入れると出ます。わざと使っていないなら、閉じてかまいません';

const roots = [];
const children = [];
const sockets = [];
after(() => {
  for (const s of sockets) s.terminate();
  for (const c of children) c.kill();
  for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

async function loadPlaywright() {
  try { return (await import(PLAYWRIGHT)).chromium; } catch (e) { assert.fail(`playwright が使えません(skip にせず失敗にする): ${e.message}`); }
}

// ---------- 実サーバー(hosted)。AC-1・5 ----------
const TENANT = { id: 'aaa', name: 'A', key: 'a'.repeat(24), obsKey: 'b'.repeat(24), enabled: true, widgets: ['alerts', 'chats', 'wins'], access: {} };

async function bootHosted() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-livenowidget-'));
  roots.push(dir);
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(dir, 'config.yaml');
  fs.writeFileSync(configPath, '');
  fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({ tenants: [TENANT], global: { access: {} } }));
  const server = await startHostedServer({ env: { TW_CONFIG: configPath, TW_DATA: dataDir, TW_ENV: 'dev', TW_RESUME_CONNECT: '0', TW_ADMIN_TOKEN: 'admin-token-for-test' } });
  children.push(server.child);
  const base = await server.ready;
  const status = async () => (await fetch(`${base}/t/${TENANT.key}/api/status`)).json();
  const openWs = (query = '') => new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/t/${TENANT.obsKey}/ws${query}`);
    sockets.push(ws);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
  // 値が want になるまで最大 timeoutMs 待つ
  const waitConnected = async (want, timeoutMs = 3000) => {
    const end = Date.now() + timeoutMs;
    let last;
    while (Date.now() < end) {
      last = (await status()).widgetConnected;
      if (last === want) return last;
      await sleep(100);
    }
    return last;
  };
  return { base, status, openWs, waitConnected };
}

test('AC-1 /api/status に widgetConnected(真偽値)があり、obs 役の接続があるときだけ true になる', async () => {
  const s = await bootHosted();
  const before = await s.status();
  assert.strictEqual(before.widgetConnected, false, '何もつながっていないときは false');
  const obs = await s.openWs();
  assert.strictEqual(await s.waitConnected(true), true, 'obs 役がつながったら true');
  obs.close();
  assert.strictEqual(await s.waitConnected(false), false, '切れたら false にもどる');
});

test('AC-5 preview=1 の接続だけでは widgetConnected は true にならない(obs が別にいれば true)', async () => {
  const s = await bootHosted();
  const preview = await s.openWs('?preview=1');
  await sleep(500);
  assert.strictEqual((await s.status()).widgetConnected, false);
  const obs = await s.openWs();
  assert.strictEqual(await s.waitConnected(true), true);
  obs.close();
  assert.strictEqual(await s.waitConnected(false), false, 'preview が残っていても obs が切れたら false');
  preview.close();
});

test('AC-5 見本(preview=1・preview=live)の配信画面をブラウザで開いているだけでは false、見本でない配信画面を開くと true', { timeout: 120_000 }, async () => {
  const s = await bootHosted();
  const chromium = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const url = (q) => `${s.base}/t/${TENANT.obsKey}/widgets/all.html${q}`;
    for (const q of ['?preview=1', '?preview=live']) {
      const page = await browser.newPage();
      await page.goto(url(q), { waitUntil: 'load', timeout: 30_000 });
      await sleep(4000);
      assert.strictEqual((await s.status()).widgetConnected, false, `${q} を開いているだけなのに true になっています`);
      await page.close();
    }
    // 対照: 見本でない配信画面は、つながって true になる(ブラウザがつなぐ状況が作れている確認)
    const real = await browser.newPage();
    await real.goto(url(''), { waitUntil: 'load', timeout: 30_000 });
    assert.strictEqual(await s.waitConnected(true, 10_000), true, '見本でない配信画面を開いても true になりません');
    await real.close();
  } finally {
    await browser.close();
  }
});

// ---------- ダッシュボードのホーム。AC-2〜4 ----------
// 返事は実サーバーのものを元に、status.mode・startedAt・widgetConnected だけ差し替える。WebSocket は黙らせ、読み取りだけで状態を決める
async function openHome(state) {
  const chromium = await loadPlaywright();
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.install();
  await page.routeWebSocket(/\/ws(\?|$)/, () => {});
  await page.route('**/api/status', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.status = { ...body.status, mode: state.mode, startedAt: state.startedAt };
    body.widgetConnected = state.widgetConnected;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  // 時計を進め、5秒ごとの読み取りが返事を反映する分の実時間も待つ
  const advance = async (sec) => {
    for (let left = sec; left > 0; left -= 5) {
      await page.clock.runFor(Math.min(5, left) * 1000);
      await page.waitForTimeout(150);
    }
  };
  // 文が出ているか。題と本文の両方がそろい、ボタンが「入れ方を見る」「閉じる」の2つあるものだけを「出ている」とする
  const banner = () => page.locator('*', { has: page.getByText(TITLE), hasText: '閉じる' }).last();
  const shown = async () => (await page.getByText(TITLE).count()) > 0 && (await page.getByText(TITLE).first().isVisible());
  const start = (patch) => { Object.assign(state, { startedAt: Date.now(), ...patch }); };
  const close = async () => { await server.stop?.(); await browser.close(); };
  return { page, advance, banner, shown, start, close };
}

const newState = (over = {}) => ({ mode: 'idle', startedAt: null, widgetConnected: false, ...over });

test('AC-2 live になって60秒たっても widgetConnected が false なら、ホームの一番上に文とボタン2つが出る', { timeout: 180_000 }, async () => {
  const state = newState();
  const h = await openHome(state);
  try {
    h.start({ mode: 'live' });
    await h.advance(70);
    assert.ok(await h.shown(), `60秒たったのに「${TITLE}」が出ていません`);
    const box = h.banner();
    const text = await box.innerText();
    assert.ok(text.includes(TITLE), '題の文');
    assert.ok(text.includes(BODY), `本文の文: ${BODY}`);
    assert.equal(await box.getByRole('button', { name: '入れ方を見る' }).count(), 1, '「入れ方を見る」ボタンが1つ');
    assert.equal(await box.getByRole('button', { name: '閉じる' }).count(), 1, '「閉じる」ボタンが1つ');
    // 一番上: 準備の一覧(「配信ソフトに入れる」の行)より上にある
    const top = (await box.boundingBox()).y;
    const row = await h.page.getByText('配信ソフトに入れる', { exact: true }).first().boundingBox();
    if (row) assert.ok(top < row.y, `文がホームの一番上にありません(文 y=${top}, 準備の一覧 y=${row.y})`);
    // 「入れ方を見る」は goTo('obs') = 配信ソフトの入れ方の画面へ行く
    await box.getByRole('button', { name: '入れ方を見る' }).click();
    await h.page.waitForTimeout(500);
    assert.ok(!(await h.shown()), '押したら入れ方の画面へ移り、ホームの文は見えなくなる');
  } finally { await h.close(); }
});

test('AC-3 60秒より前・live 以外・つながっているときは出ない。出ているときにつながったら5秒以内に消える', { timeout: 300_000 }, async () => {
  const state = newState();
  const h = await openHome(state);
  try {
    h.start({ mode: 'live' });
    await h.advance(50);
    assert.ok(!(await h.shown()), '60秒より前に出ています');

    for (const mode of ['demo', 'idle', 'ended']) {
      h.start({ mode });
      await h.advance(70);
      assert.ok(!(await h.shown()), `mode=${mode} なのに出ています`);
    }

    h.start({ mode: 'live', widgetConnected: true });
    await h.advance(70);
    assert.ok(!(await h.shown()), 'widgetConnected が true なのに出ています');

    h.start({ mode: 'live', widgetConnected: false });
    await h.advance(70);
    assert.ok(await h.shown(), '前提: 60秒たったので出るはず');
    state.widgetConnected = true;
    await h.advance(5);
    assert.ok(!(await h.shown()), 'つながったのに、次の読み取り(5秒以内)で消えていません');
  } finally { await h.close(); }
});

test('AC-4 「閉じる」を押すとその配信のあいだは出ず(読み込み直しても)、次の配信ではまた出る', { timeout: 300_000 }, async () => {
  const state = newState();
  const h = await openHome(state);
  try {
    h.start({ mode: 'live' });
    await h.advance(70);
    assert.ok(await h.shown(), '前提: 出ているはず');
    await h.banner().getByRole('button', { name: '閉じる' }).click();
    await h.page.waitForTimeout(200);
    assert.ok(!(await h.shown()), '押した直後に消えていません');
    await h.advance(30);
    assert.ok(!(await h.shown()), '閉じたあと、同じ配信のうちに出ています');

    await h.page.reload({ waitUntil: 'domcontentloaded' });
    await h.page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await h.advance(70);
    assert.ok(!(await h.shown()), '読み込み直したら、同じ配信なのにまた出ています');

    h.start({ mode: 'ended' });
    await h.advance(10);
    await new Promise((r) => setTimeout(r, 5)); // startedAt が前の配信と同じ値にならないように
    h.start({ mode: 'live' });
    await h.advance(70);
    assert.ok(await h.shown(), '次の配信では、また出るはず');
  } finally { await h.close(); }
});

// ---------- AC-8 ----------
test('AC-8 README.md と public/dashboard/README.md に、この機能のことが書いてある', () => {
  const pat = /widgetConnected|ライコネが出ていません/;
  assert.match(fs.readFileSync(`${root}README.md`, 'utf8'), pat, 'README.md の機能の一覧');
  assert.match(fs.readFileSync(`${root}public/dashboard/README.md`, 'utf8'), pat, 'public/dashboard/README.md');
});
