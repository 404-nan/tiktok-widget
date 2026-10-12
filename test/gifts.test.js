import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GiftCatalog, giftMatches, giftDisplayName } from '../src/gifts.js';

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
