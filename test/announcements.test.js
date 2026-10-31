import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Tenants } from '../src/tenants.js';
import { ANNOUNCEMENT_TYPES, listAnnouncements, parseAnnouncements } from '../src/announcements.js';
import { PRODUCT_VERSION } from '../src/version.js';

// 製品のバージョン管理とお知らせのテスト。
// ルール本体は docs/VERSIONING.md: 正本は package.json、本番に出す変更には
// バージョンと同じ数字のお知らせが付いていること。

test('バージョンの正本（package.json）と src/version.js が一致する', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(PRODUCT_VERSION, pkg.version);
  assert.match(PRODUCT_VERSION, /^\d+\.\d+\.\d+$/);
});

test('お知らせの実データは全件そろっていて、顧客向けの文言に技術用語が無い', () => {
  const list = listAnnouncements();
  assert.ok(list.length >= 1, 'お知らせが1件以上ある');
  for (const entry of list) {
    assert.match(entry.version, /^\d+\.\d+\.\d+$/, 'バージョンの形');
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, '日付の形');
    assert.ok(ANNOUNCEMENT_TYPES[entry.type], `種別 ${entry.type} が定義済み`);
    assert.equal(entry.typeLabel, ANNOUNCEMENT_TYPES[entry.type]);
    assert.ok(entry.title.length > 0 && entry.body.length > 0);
    assert.doesNotMatch(`${entry.title} ${entry.body}`, /API|commit|JSON|テナント/, '技術用語を出さない');
  }
  // 新しい順（日付→バージョン）に並んでいる
  const dates = list.map((entry) => entry.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('最新のお知らせは、いまの製品バージョンと同じ数字を持つ（バージョンとお知らせはセットで上げる）', () => {
  const [latest] = listAnnouncements();
  assert.ok(latest, 'お知らせがある');
  assert.equal(latest.version, PRODUCT_VERSION);
});

test('「使う」ボタンの不具合修正のお知らせが入っている', () => {
  const fix = listAnnouncements().find((entry) => entry.type === 'fix' && entry.title.includes('使う'));
  assert.ok(fix, '修正のお知らせがある');
  assert.equal(fix.version, PRODUCT_VERSION);
});

test('壊れたエントリは落とし、正しいものだけが新しい順に返る', () => {
  const raw = JSON.stringify([
    { version: '0.4.0', date: '2026-10-01', type: 'add', title: '古い追加', body: '本文' },
    { version: '9.9.9', date: 'まちがい', type: 'new', title: '日付が壊れている', body: '本文' },
    { version: '0.5.0', date: '2026-10-20', type: 'unknown', title: '種別が壊れている', body: '本文' },
    { version: '0.5.0', date: '2026-10-20', type: 'new', title: '新しい機能', body: '' },
    { version: '0.5.1', date: '2026-11-01', type: 'fix', title: 'いちばん新しい修正', body: '本文' },
    { version: '0.5.0', date: '2026-10-20', type: 'new', title: '新しい機能', body: '本文' },
  ]);
  const list = parseAnnouncements(raw);
  assert.deepEqual(list.map((entry) => entry.title), ['いちばん新しい修正', '新しい機能', '古い追加']);
  assert.equal(list[0].typeLabel, '修正');
});

const setup = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-announcements-'));
  const tenants = new Tenants({ dir, env: {} });
  const tenant = tenants.create({ name: 'ためし' });
  const rt = tenants.runtime(tenant.id);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.role = 'owner';
    next();
  });
  app.use(rt.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await tenants.close(tenant.id);
  };
  return { base, close };
};

test('GET /api/announcements がバージョンとお知らせ一覧を返す', async () => {
  const { base, close } = await setup();
  try {
    const res = await fetch(`${base}/api/announcements`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.version, PRODUCT_VERSION);
    assert.ok(Array.isArray(data.announcements) && data.announcements.length >= 1);
    const [first] = data.announcements;
    assert.deepEqual(Object.keys(first).sort(), ['body', 'date', 'title', 'type', 'typeLabel', 'version']);
    assert.equal(first.version, PRODUCT_VERSION);
  } finally {
    await close();
  }
});
