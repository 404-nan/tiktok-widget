// Last X 拡充の合格条件：5種の枠がその種類の出来事だけで差し替わる／枠の入切と並び順が保存・復元で欠けない／
// ギフト枠は minCoins 未満で差し替わらない／既存の一覧型の挙動が変わらない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { InfoFeed } from '../src/info-feed.js';
import { emptyLastState, applyLastEvent, seedLastState, orderedLastKinds, lastLabel } from '../public/widgets/lib/lastx.js';
import { normalize } from '../src/config.js';
import { SCHEMA } from '../src/schema.js';

const taro = { id: 'taro', name: 'たろう', avatar: null };
const hana = { id: 'hana', name: 'はな', avatar: null };
const ev = (kind, user, extra = {}) => ({ id: Math.random(), ts: 1000, kind, user, ...extra });
const giftEv = (user, coins) => ev('gift', user, { totalDiamonds: coins, gift: { id: '5655', name: 'Rose', count: 1, diamondCount: coins } });

function feedSetup() {
  const hub = new EventEmitter();
  const feed = new InfoFeed(hub);
  return { hub, feed };
}

test('InfoFeed：種類ごとの「最後の1人」が、その種類の出来事だけで差し替わる', () => {
  const { hub, feed } = feedSetup();
  hub.emit('event', ev('follow', taro));
  hub.emit('event', giftEv(hana, 50));
  hub.emit('event', ev('share', taro));
  hub.emit('event', ev('like', hana));
  hub.emit('event', ev('chat', taro));
  let snap = feed.snapshot();
  assert.equal(snap.last.follow.user.name, 'たろう');
  assert.equal(snap.last.gift.user.name, 'はな');
  assert.equal(snap.last.share.user.name, 'たろう');
  assert.equal(snap.last.like.user.name, 'はな');
  assert.equal(snap.last.chat.user.name, 'たろう');
  // フォローがもう1回来ても、他の枠は変わらない
  hub.emit('event', ev('follow', hana));
  snap = feed.snapshot();
  assert.equal(snap.last.follow.user.name, 'はな');
  assert.equal(snap.last.gift.user.name, 'はな');
  assert.equal(snap.last.like.user.name, 'はな');
  assert.equal(snap.last.chat.user.name, 'たろう');
  feed.close();
});

test('InfoFeed：既存の一覧（items）は今までどおり follow/gift/share だけ', () => {
  const { hub, feed } = feedSetup();
  hub.emit('event', ev('like', taro));
  hub.emit('event', ev('chat', taro));
  hub.emit('event', ev('follow', taro));
  hub.emit('event', giftEv(hana, 10));
  const snap = feed.snapshot();
  assert.equal(snap.items.length, 2);
  assert.deepEqual(snap.items.map((item) => item.kind), ['gift', 'follow']);
  hub.emit('reset');
  assert.deepEqual(feed.snapshot().last, {}, 'リセットで枠も空になる');
  feed.close();
});

test('枠の状態：5種が独立に差し替わり、ギフトは minCoins 未満で差し替わらない', () => {
  const state = emptyLastState();
  assert.equal(applyLastEvent(state, ev('follow', taro)), 'follow');
  assert.equal(applyLastEvent(state, giftEv(hana, 50), { minCoins: 100 }), null, 'minCoins 未満は差し替えない');
  assert.equal(state.gift, null);
  assert.equal(applyLastEvent(state, giftEv(hana, 150), { minCoins: 100 }), 'gift');
  assert.equal(state.gift.user.name, 'はな');
  assert.equal(applyLastEvent(state, ev('like', taro)), 'like');
  assert.equal(applyLastEvent(state, ev('chat', hana)), 'chat');
  assert.equal(applyLastEvent(state, ev('share', taro)), 'share');
  assert.equal(state.follow.user.name, 'たろう', '他の種類では差し替わらない');
  assert.equal(applyLastEvent(state, ev('member', hana)), null, '対象外の種類は無視する');
  // サーバーの控えから埋め直せる（読み込み直し対策）
  const seeded = seedLastState(emptyLastState(), { follow: { kind: 'follow', user: { name: 'はな', avatar: null }, coins: 0 } });
  assert.equal(seeded.follow.user.name, 'はな');
});

test('枠の入切と並び順：設定どおりに並び、保存・復元で欠けない', () => {
  assert.deepEqual(orderedLastKinds({ lastKinds: ['gift', 'follow'], lastOrder: ['chat', 'gift', 'follow'] }), ['gift', 'follow']);
  assert.deepEqual(orderedLastKinds({ lastKinds: ['like'], lastOrder: ['follow', 'gift'] }), ['like'], '順序に無い有効な枠は後ろに足す');
  assert.equal(lastLabel({}, 'gift'), '最後のギフト');
  assert.equal(lastLabel({ lastGiftLabel: 'いちばん新しいギフト' }, 'gift'), 'いちばん新しいギフト');
  const { config, errors } = normalize({
    supporters: {
      main: { displayType: 'last', lastKinds: ['gift', 'follow'], lastOrder: ['chat', 'gift', 'follow'], lastGiftLabel: 'いちばん新しいギフト' },
    },
  });
  assert.deepEqual(errors, []);
  const entry = config.supporters.main;
  assert.equal(entry.displayType, 'last');
  assert.deepEqual(entry.lastKinds, ['gift', 'follow']);
  assert.deepEqual(entry.lastOrder, ['chat', 'gift', 'follow']);
  assert.equal(entry.lastGiftLabel, 'いちばん新しいギフト');
});

test('推奨サイズは型で変わる（一覧は今までどおり）', () => {
  assert.deepEqual(SCHEMA.supporters.size({ displayType: 'list', limit: 5 }), [420, 72 + 5 * 60]);
  assert.deepEqual(SCHEMA.supporters.size({ displayType: 'last', lastKinds: ['gift', 'follow'] }), [420, 72 + 2 * 60]);
  assert.deepEqual(SCHEMA.supporters.size({ displayType: 'last' }), [420, 72 + 5 * 60]);
});

test('ウィジェット本体に「最後の1人」型の分岐と lastx の読み込みがある', () => {
  const html = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'public', 'widgets', 'supporters', 'index.html'), 'utf8');
  assert.ok(html.includes("from './lib/lastx.js'"));
  assert.ok(html.includes("displayType === 'last'"));
  assert.ok(html.includes('data.last'), '初期状態をサーバーの控えから埋める');
});
