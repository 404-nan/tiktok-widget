import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGift, normalizeLike, normalizeUser, normalizeViewers } from '../src/normalize.js';

const user = { uniqueId: 'sakura', nickname: 'さくら', avatarThumb: { mUrls: ['https://example.com/a.jpg'] } };

test('ユーザー: v3 形式', () => {
  assert.deepEqual(normalizeUser(user), { id: 'sakura', name: 'さくら', avatar: 'https://example.com/a.jpg' });
});

test('ユーザー: 旧形式と欠損', () => {
  assert.equal(normalizeUser({ uniqueId: 'x', profilePicture: { urls: ['u'] } }).avatar, 'u');
  assert.equal(normalizeUser(undefined).name, '名無し');
});

test('ギフト: 連打中は無視し、連打終了で確定する', () => {
  const base = { giftId: '5655', user, gift: { type: 1, name: 'Rose', diamondCount: 1, image: { mUrls: ['g.png'] } } };
  assert.equal(normalizeGift({ ...base, repeatCount: 3, repeatEnd: 0 }), null);
  const e = normalizeGift({ ...base, repeatCount: 7, repeatEnd: 1 });
  assert.equal(e.gift.name, 'Rose');
  assert.equal(e.gift.count, 7);
  assert.equal(e.gift.image, 'g.png');
  assert.equal(e.totalDiamonds, 7);
});

test('ギフト: 連打できないギフトはそのまま確定', () => {
  const e = normalizeGift({ giftId: '6369', user, repeatCount: 1, repeatEnd: 0, gift: { type: 2, name: 'Lion', diamondCount: 29999 } });
  assert.equal(e.totalDiamonds, 29999);
});

test('ギフト: 旧形式 (giftDetails)', () => {
  const e = normalizeGift({
    giftId: 1,
    repeatCount: 2,
    repeatEnd: true,
    user,
    giftDetails: { giftType: 1, giftName: 'Rose', diamondCount: 1, giftImage: { giftPictureUrl: 'old.png' } },
  });
  assert.equal(e.gift.name, 'Rose');
  assert.equal(e.gift.image, 'old.png');
  assert.equal(e.totalDiamonds, 2);
});

test('いいね・視聴者: 文字列の数値も読む', () => {
  assert.deepEqual(normalizeLike({ user, count: 5, total: '1200' }).total, 1200);
  assert.equal(normalizeLike({ user, likeCount: 3, totalLikeCount: 10 }).count, 3);
  assert.equal(normalizeViewers({ total: '345' }).viewers, 345);
  assert.equal(normalizeViewers({ viewerCount: 12 }).viewers, 12);
});
