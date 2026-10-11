import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { History } from '../src/history.js';
import { makeEvent } from '../src/demo.js';

test('接続から切断までを1回の配信として保存する', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.publish(makeEvent('gift', { user: 'たろう', giftName: 'Corgi', count: 1 }));
  // 本番中のテスト送信（demo_ のユーザー）は数えない
  assert.equal(history.current.totals.coins, 0);

  hub.publish({ kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 5, diamonds: 1 }, totalDiamonds: 5 });
  hub.publish({ kind: 'gift', user: { id: 'u2', name: 'B' }, gift: { name: 'Corgi', id: '2', count: 1, diamonds: 299 }, totalDiamonds: 299 });
  hub.publish({ kind: 'follow', user: { id: 'u3', name: 'C' } });
  hub.publish({ kind: 'viewers', viewers: 120 });
  hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' } });

  const live = history.list()[0];
  assert.equal(live.live, true);
  assert.equal(live.totals.coins, 304);

  hub.setStatus({ mode: 'idle' });
  assert.equal(history.current, null);
  const [saved] = history.list();
  assert.equal(saved.username, 'sakura');
  assert.equal(saved.totals.follows, 1);
  assert.equal(saved.totals.peakViewers, 120);
  assert.equal(saved.topGifter.name, 'B');

  const full = history.get(saved.id);
  assert.deepEqual(full.gifters.map((g) => [g.name, g.coins]), [['B', 299], ['A', 5]]);
  assert.deepEqual(full.roulettes[0].results, [{ label: '歌う', count: 1 }]);
  assert.equal(full.timeline[0].coins, 304);
});

test('何も起きなかった配信は残さない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);
  hub.setStatus({ mode: 'demo' });
  hub.setStatus({ mode: 'idle' });
  assert.deepEqual(history.list(), []);
});

test('視聴者数は分ごとに上がり下がりする', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);
  hub.setStatus({ mode: 'demo' });
  const t0 = history.current.startedAt;
  hub.publish({ kind: 'viewers', viewers: 100, ts: t0 + 1000 });
  hub.publish({ kind: 'viewers', viewers: 120, ts: t0 + 2000 });
  hub.publish({ kind: 'viewers', viewers: 80, ts: t0 + 61_000 });
  hub.publish({ kind: 'like', user: { id: 'a' }, count: 1, total: 0, ts: t0 + 125_000 });
  assert.deepEqual(history.current.timeline.map((m) => m.viewers), [120, 80, 80]);
});
