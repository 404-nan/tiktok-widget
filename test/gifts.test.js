import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GiftCatalog, giftMatches, giftDisplayName, bundledGifts, coinCount, coinText, mergeGiftCatalog } from '../src/gifts.js';
import { DEMO_GIFTS } from '../src/demo.js';
import { normalizeGift } from '../src/normalize.js';

test('ギフト一覧を取り込み、保存して、読み直せる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const file = path.join(dir, 'gifts.json');
  const first = new GiftCatalog(file);
  first.import([{ id: 1, name: 'Rose', nameJa: 'ローズ', diamond_count: 1, image: 'rose.png' }], 123);
  const second = new GiftCatalog(file);
  assert.deepEqual(second.find('ローズ'), { id: '1', name: 'Rose', nameJa: 'ローズ', diamonds: 1, image: 'rose.png' });
  assert.equal(second.find('Rose').id, '1');
  assert.equal(second.find('1').nameJa, 'ローズ');
});

test('条件は英語名・日本語名・ID のどれでも同じギフトに合う', () => {
  const gift = { id: '1', name: 'Rose', nameJa: 'ローズ' };
  assert.equal(giftMatches(gift, ['Rose']), true);
  assert.equal(giftMatches(gift, ['ローズ']), true);
  assert.equal(giftMatches(gift, ['1']), true);
  // 表示は対応表の英語名「Rose」に当たる。判定用の nameJa（ローズ）は変えない
  assert.equal(giftDisplayName(gift), 'バラ');
});

test('ギフト一覧は ID で英語名と日本語名を対にする', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  await catalog.refresh({
    fetchGifts: async (language) => language === 'en'
      ? [{ id: 5655, name: 'Rose', diamond_count: 1 }]
      : [{ id: 5655, name: 'ローズ', diamond_count: 1 }],
  });
  assert.deepEqual(catalog.find('5655'), { id: '5655', name: 'Rose', nameJa: 'ローズ', diamonds: 1, image: null });
});

test('日本語名が英語名と同じなら nameJa は null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  await catalog.refresh({
    fetchGifts: async (language) => language === 'en'
      ? [{ id: 1, name: 'Test Gift X' }]
      : [{ id: 1, name: 'Test Gift X' }],
  });
  assert.equal(catalog.find('1').nameJa, null);
});

test('日本語名がないギフトの表示は今までの英語名のまま', () => {
  const event = normalizeGift({ giftId: 1, gift: { id: 1, name: 'Plain Gift', diamondCount: 1 }, repeatCount: 1 });
  assert.equal(event.gift.name, 'Plain Gift');
  assert.equal(event.gift.nameJa, null);
  assert.equal(giftDisplayName(event.gift), 'Plain Gift');
});

test('届いたイベントの名前は英語のまま、画面の表示だけ対応表の日本語になる', () => {
  const event = normalizeGift({ giftId: 1, gift: { id: 1, name: 'Rose', diamondCount: 1 }, repeatCount: 1 });
  assert.equal(event.gift.name, 'Rose');
  assert.equal(event.gift.nameJa, null);
  assert.equal(giftDisplayName(event.gift), 'バラ');
});

test('TikTok から日本語名が取れないときは控えの対応表（ID→英語名）から日本語名を出す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  assert.equal(catalog.enrich({ id: '7934', name: 'Heart Me' }).nameJa, 'ハートミー');
  assert.equal(catalog.enrich({ id: '0', name: 'Meteor Shower' }).nameJa, '流星群');
  assert.equal(catalog.enrich({ id: '0', name: 'Unknown Gift' }).nameJa, null);
});

test('届いたギフトの表示名は日本語の対応表（src/gift-names-ja.json）を通る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  const event = normalizeGift({ giftId: 5655, gift: { id: 5655, name: 'Rose', diamondCount: 1 }, repeatCount: 1 }, catalog);
  assert.equal(giftDisplayName(event.gift), 'バラ');
  const other = normalizeGift({ giftId: 999999999, gift: { id: 999999999, name: 'Brand New Gift', diamondCount: 1 }, repeatCount: 1 }, catalog);
  assert.equal(giftDisplayName(other.gift), 'Brand New Gift');
});

test('コインは diamond_count / diamondCount / coins / 文字のどれでも数にし、無ければ null', () => {
  assert.equal(coinCount({ diamond_count: 5000 }), 5000);
  assert.equal(coinCount({ diamondCount: '1,000' }), 1000);
  assert.equal(coinCount({ coins: '20' }), 20);
  assert.equal(coinCount({ diamonds: 0 }), 0);
  assert.equal(coinCount({ name: 'Mystery' }), null);
  assert.equal(coinCount({ diamonds: 'たくさん' }), null);
  assert.equal(coinText(undefined), '? コイン');
  assert.equal(coinText(null), '? コイン');
  assert.equal(coinText(Number.NaN), '? コイン');
  assert.equal(coinText(5000), '5000 コイン');
  assert.equal(coinText(0), '0 コイン');
});

test('コインの無い再取得で、前に分かっていたコインを消さない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  catalog.import([{ id: 5338, name: 'Unicorn Fantasy', diamondCount: '5000' }]);
  catalog.import([{ id: 5338, name: 'Unicorn Fantasy', nameJa: 'ユニコーン ファンタジー' }]);
  assert.equal(catalog.find('5338').diamonds, 5000);
  assert.equal(catalog.find('5338').nameJa, 'ユニコーン ファンタジー');
});

test('テスト送信用の一覧は、ユニコーン ファンタジー以降も NaN にしない', () => {
  const known = DEMO_GIFTS.map((g) => ({ ...g }));
  const names = new Set(known.map((g) => String(g.name).toLocaleLowerCase()));
  const extra = bundledGifts().filter((g) => g.name && !names.has(g.name.toLocaleLowerCase()));
  const all = mergeGiftCatalog([
    known,
    [{ id: '1', name: 'Rose', diamond_count: '1' }],
    [{ id: '1', name: 'Rose' }],
    extra,
  ]);
  const start = all.findIndex((g) => g.nameJa === 'ユニコーン ファンタジー');
  assert.ok(start >= 0);
  for (const g of all.slice(start)) {
    const label = coinText(g.diamonds);
    assert.equal(label.includes('NaN'), false, `${g.id} ${g.nameJa || g.name}`);
    assert.match(label, /^(\?|\d+) コイン$/);
  }
  const uni = all.find((g) => g.id === '5338');
  assert.equal(uni.diamonds, 5000);
  assert.equal(coinText(uni.diamonds), '5000 コイン');
  assert.equal(all.find((g) => g.id === '1').diamonds, 1);
  const unknown = mergeGiftCatalog([[{ id: '9', name: 'Mystery Gift' }]])[0];
  assert.equal(unknown.diamonds, null);
  assert.equal(coinText(unknown.diamonds), '? コイン');
});

test('対応表は GiftID → [英語名, 日本語名] の形で、日本語名が入っている', () => {
  const table = JSON.parse(fs.readFileSync(new URL('../src/gift-names-ja.json', import.meta.url), 'utf8'));
  const entries = Object.entries(table.names);
  assert.ok(entries.length > 500);
  for (const [id, pair] of entries) {
    assert.match(id, /^\d+$/);
    assert.equal(pair.length, 2);
    assert.ok(pair[1] && pair[1] !== pair[0], `${id} の日本語名`);
  }
});

const DAY_MS = 24 * 60 * 60 * 1000;

test('取り直しの判定は updatedAt と attemptedAt の新しい方から24時間で見る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  const now = 10_000_000_000;
  catalog.updatedAt = now - 2 * DAY_MS;
  catalog.attemptedAt = now - 1000;
  assert.equal(catalog.stale(now), false);
  catalog.attemptedAt = now - DAY_MS;
  assert.equal(catalog.stale(now), true);
});

test('ギフト一覧の取り直しに失敗した直後は、24時間以内に再取得しない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  let calls = 0;
  const fail = async () => { calls += 1; throw new Error('denied'); };
  const first = await catalog.refresh({ fetchGifts: fail });
  assert.equal(first.refreshed, false);
  assert.equal(calls, 2);
  const second = await catalog.refresh({ fetchGifts: fail });
  assert.equal(second.refreshed, false);
  assert.equal(calls, 2);
});

test('ギフト一覧の取り直しに失敗しても、24時間たつとまた試す', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  t.mock.timers.setTime(10_000_000_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  let calls = 0;
  const fail = async () => { calls += 1; throw new Error('denied'); };
  await catalog.refresh({ fetchGifts: fail });
  assert.equal(calls, 2);
  await catalog.refresh({ fetchGifts: fail });
  assert.equal(calls, 2);
  t.mock.timers.setTime(10_000_000_000 + DAY_MS);
  await catalog.refresh({ fetchGifts: fail });
  assert.equal(calls, 4);
});

test('ギフト一覧の取得が時間切れでも、試した時刻を残して24時間は再取得しない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  const result = await catalog.refresh({
    timeoutMs: 5,
    fetchGifts: () => new Promise(() => {}),
  });
  assert.equal(result.refreshed, false);
  assert.ok(catalog.attemptedAt > 0);
  let calls = 0;
  await catalog.refresh({ fetchGifts: async () => { calls += 1; return []; } });
  assert.equal(calls, 0);
});

test('ギフト一覧の取得に成功したときは、24時間以内に再取得しない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  let calls = 0;
  const fetchGifts = async (language) => {
    calls += 1;
    return language === 'en' ? [{ id: 5655, name: 'Rose', diamond_count: 1 }] : [{ id: 5655, name: 'ローズ', diamond_count: 1 }];
  };
  const first = await catalog.refresh({ fetchGifts });
  assert.equal(first.refreshed, true);
  assert.equal(calls, 2);
  await catalog.refresh({ fetchGifts });
  assert.equal(calls, 2);
  assert.equal(catalog.find('5655').nameJa, 'ローズ');
});

test('前の形のギフト一覧ファイルを読むと、attemptedAt は updatedAt と同じとみなす', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const file = path.join(dir, 'gifts.json');
  fs.writeFileSync(file, JSON.stringify({ updatedAt: 123456, gifts: [{ id: '1', name: 'Rose', nameJa: 'ローズ', diamonds: 1, image: null }] }));
  const catalog = new GiftCatalog(file);
  assert.equal(catalog.updatedAt, 123456);
  assert.equal(catalog.attemptedAt, 123456);
  assert.equal(catalog.lastError, null);
});

test('失敗した時刻と短い理由を新しい形で保存して、読み直せる', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const file = path.join(dir, 'gifts.json');
  const first = new GiftCatalog(file);
  await first.refresh({ fetchGifts: async () => { throw new Error('denied'); } });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(saved.attemptedAt > 0);
  assert.equal(saved.lastError, 'denied');
  const second = new GiftCatalog(file);
  assert.equal(second.attemptedAt, saved.attemptedAt);
  assert.equal(second.lastError, 'denied');
});

test('force: true なら、24時間たっていなくてもギフト一覧を取り直す', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const catalog = new GiftCatalog(path.join(dir, 'gifts.json'));
  let calls = 0;
  const fetchGifts = async (language) => {
    calls += 1;
    return language === 'en' ? [{ id: 5655, name: 'Rose', diamond_count: 1 }] : [{ id: 5655, name: 'ローズ', diamond_count: 1 }];
  };
  await catalog.refresh({ fetchGifts });
  assert.equal(calls, 2);
  const forced = await catalog.refresh({ fetchGifts, force: true });
  assert.equal(forced.refreshed, true);
  assert.equal(calls, 4);
});

test('lastError に鍵らしい文字列や URL を残さない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const file = path.join(dir, 'gifts.json');
  const catalog = new GiftCatalog(file);
  const secret = 'sk-live-1234567890abcdef';
  const url = `https://example.invalid/webcast/gift/list/?apiKey=${secret}&signature=abcdef1234567890abcdef1234567890`;
  await catalog.refresh({ fetchGifts: async () => { throw new Error(`signTikTokUrl failed ${url} token ${secret}`); } });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(saved.lastError);
  assert.equal(saved.lastError.includes(secret), false);
  assert.equal(saved.lastError.includes(url), false);
  assert.equal(saved.lastError.includes('https://'), false);
  assert.ok(saved.lastError.length <= 120);
});

test('lastError に署名済みらしい長い文字列を残さない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gifts-'));
  const file = path.join(dir, 'gifts.json');
  const catalog = new GiftCatalog(file);
  const signed = 'sign=webcast%2Fgift%2Flist%3FapiKey%3Dsecret%26signature%3Dabcdef1234567890abcdef1234567890';
  await catalog.refresh({ fetchGifts: async () => { throw new Error(`signTikTokUrl failed ${signed}`); } });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.lastError.includes('webcast%2F'), false);
  assert.equal(saved.lastError.includes('apiKey'), false);
  assert.equal(saved.lastError.includes('abcdef1234567890'), false);
});
