import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GiftCatalog, giftMatches, giftDisplayName } from '../src/gifts.js';
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
  assert.equal(giftDisplayName(gift), 'ローズ');
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
