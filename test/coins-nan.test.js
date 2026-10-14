import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { History, coinsPerHour } from '../src/history.js';
import { normalizeGift } from '../src/normalize.js';

const user = { uniqueId: 'sakura', nickname: 'さくら' };

function giftEvent(diamondCount, { count = 1, name = 'Rose', id = 'u1', who = 'さくら', repeatEnd = 1 } = {}) {
  const raw = {
    giftId: id,
    user: { uniqueId: id, nickname: who },
    repeatCount: count,
    repeatEnd,
    gift: { type: 2, name, id },
  };
  if (diamondCount !== 'missing') raw.gift.diamondCount = diamondCount;
  return normalizeGift(raw);
}

test('コイン合計・コイン/時・ランキングは、diamondCount が undefined・文字・欠損でも NaN にならない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-coins-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);
  hub.setStatus({ mode: 'live', username: 'sakura' });

  const cases = [
    giftEvent(undefined, { who: '未定義', id: 'u-undef', name: 'Plain' }),
    giftEvent('missing', { who: '欠損', id: 'u-miss', name: 'Gone' }),
    giftEvent('15', { who: '文字', id: 'u-str', name: 'String', count: 2 }),
    giftEvent('1,000', { who: '桁', id: 'u-comma', name: 'Comma' }),
    giftEvent('たくさん', { who: '壊れた文字', id: 'u-bad', name: 'Bad' }),
  ];
  for (const event of cases) hub.publish(event);
  // 正規化を通さない生イベント（totalDiamonds が無い・NaN・文字）
  hub.publish({ kind: 'gift', user: { id: 'u-raw', name: '生' }, gift: { id: '9', name: 'Raw', diamondCount: '8', count: 2 } });
  hub.publish({ kind: 'gift', user: { id: 'u-nan', name: 'ナン' }, gift: { id: '8', name: 'Nan', count: 1 }, totalDiamonds: Number.NaN });
  hub.publish({ kind: 'gift', user: user, gift: { id: '7', name: 'Empty' } });

  assert.equal(Number.isNaN(hub.state.diamonds), false);
  assert.equal(Number.isFinite(hub.state.diamonds), true);
  // "15"×2 + "1,000" + 生の "8"×2。undefined・欠損・壊れた文字・NaN・空は 0
  assert.equal(hub.state.diamonds, 30 + 1000 + 16);
  for (const row of hub.state.topGifters) {
    assert.equal(Number.isFinite(row.diamonds), true, row.user?.name);
    assert.equal(Number.isNaN(row.diamonds), false);
  }
  assert.deepEqual(
    hub.state.topGifters.filter((row) => row.diamonds > 0).map((row) => [row.user.name, row.diamonds]),
    [['桁', 1000], ['文字', 30], ['生', 16]],
  );

  const session = history.current;
  assert.equal(session.totals.coins, hub.state.diamonds);
  assert.equal(Number.isFinite(session.totals.coins), true);
  for (const minute of session.timeline) {
    assert.equal(Number.isFinite(minute.coins), true);
    assert.equal(Number.isNaN(minute.coins), false);
  }
  session.endedAt = session.startedAt + 3_600_000;
  const saved = session.toJSON();
  for (const row of saved.gifters) {
    assert.equal(Number.isFinite(row.coins), true, row.name);
    assert.equal(Number.isNaN(row.coins), false);
  }
  assert.equal(saved.coinsPerHour, session.totals.coins);
  assert.equal(Number.isNaN(saved.coinsPerHour), false);

  assert.equal(coinsPerHour(3600, 3_600_000), 3600);
  assert.equal(coinsPerHour(1800, 30 * 60_000), 3600);
  assert.equal(coinsPerHour(Number.NaN, 3_600_000), 0);
  assert.equal(coinsPerHour('1,000', 3_600_000), 1000);
  assert.equal(coinsPerHour(100, 0), 0);
  assert.equal(coinsPerHour(100, undefined), 0);
  assert.equal(coinsPerHour(undefined, undefined), 0);

  history.end();
});
