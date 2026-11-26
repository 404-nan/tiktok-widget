import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { History } from '../src/history.js';
import { makeEvent } from '../src/demo.js';
import { actorDigest } from '../src/effect-log.js';

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
  let wall = 1_700_000_000_000;
  let mono = 0;
  const history = new History(hub, dir, { now: () => wall, monotonicNow: () => mono });
  clearInterval(history.timer);
  hub.setStatus({ mode: 'demo' });
  const t0 = history.current.startedAt;
  const publishAt = (ms, event) => {
    mono = ms;
    wall = t0 + ms;
    hub.publish({ ...event, ts: wall });
  };
  publishAt(1000, { kind: 'viewers', viewers: 100 });
  publishAt(2000, { kind: 'viewers', viewers: 120 });
  publishAt(61_000, { kind: 'viewers', viewers: 80 });
  publishAt(125_000, { kind: 'like', user: { id: 'a' }, count: 1, total: 0 });
  assert.deepEqual(history.current.timeline.map((m) => m.viewers), [120, 80, 80]);
});

test('配信中のフォローとシェアが、効果ログの記録に匿名で残る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  const history = new History(hub, dir, { effectSecret: 'secret' });
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.publish({ kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 1, diamonds: 1 }, totalDiamonds: 1 });
  hub.publish({ kind: 'follow', user: { id: 'u3', name: 'C' } });
  hub.publish({ kind: 'share', user: { id: 'u4', name: 'D' } });
  const sessionId = history.current.id;
  hub.setStatus({ mode: 'idle' });

  const text = fs.readFileSync(path.join(dir, 'effects', `${sessionId}.events.jsonl`), 'utf8');
  const lines = text.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((e) => e.kind), ['gift', 'follow', 'share']);
  assert.equal(lines[1].actor, actorDigest('secret', 'u3'));
  assert.equal(lines[2].actor, actorDigest('secret', 'u4'));
  assert.doesNotMatch(text, /"u3"|"u4"|"C"|"D"/);
});

test('ギフト・フォロー・ルーレットが、1件ごとの記録に名前つきで残る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.publish({ kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 2, diamonds: 5 }, totalDiamonds: 10 });
  hub.publish({ kind: 'follow', user: { id: 'u3', name: 'C' } });
  hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { user: { id: 'u1', name: 'A' } } });
  const sessionId = history.current.id;
  hub.setStatus({ mode: 'idle' });

  const text = fs.readFileSync(path.join(dir, 'details', `${sessionId}.jsonl`), 'utf8');
  const lines = text.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((e) => e.kind), ['gift', 'follow', 'roulette']);
  assert.equal(lines[0].user.name, 'A');
  assert.equal(lines[0].gift.name, 'Rose');
  assert.equal(lines[0].count, 2);
  assert.equal(lines[0].coins, 10);
  assert.equal(lines[1].user.name, 'C');
  assert.equal(lines[2].result, '歌う');
  assert.equal(lines[2].user.name, 'A');
  const viaRead = history.details.read(sessionId, { kind: 'gift' });
  assert.equal(viaRead.total, 1);
  clearInterval(history.details.timer);
});

test('配信が終わった後に届いたルーレットの結果は、回し始めた配信の記録に入る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  const startedAt = history.current.startedAt;
  const sessionId = history.current.id;
  hub.setStatus({ mode: 'idle' });
  // 配信が終わってから結果が届く（回し始めた時刻は配信の中）
  hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { user: { id: 'u1', name: 'A' } }, spin: { at: startedAt } });
  const lines = fs.readFileSync(path.join(dir, 'details', `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'roulette');
  assert.equal(lines[0].result, '歌う');
  clearInterval(history.details.timer);
});

test('テストのルーレットは、1件ごとの記録に残らない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { test: true, user: { id: 'u1', name: 'A' } }, spin: { at: Date.now() } });
  const sessionId = history.current.id;
  hub.setStatus({ mode: 'idle' });
  assert.equal(history.details.read(sessionId, { kind: 'roulette' }).total, 0);
  clearInterval(history.details.timer);
});

test('遅れて届いたルーレットは、集計も前の配信に入り、次の配信に混ざらない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  let t = 1_700_000_000_000;
  const history = new History(hub, dir, { now: () => t, monotonicNow: () => t });
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.publish({ kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 1, diamonds: 1 }, totalDiamonds: 1, ts: t });
  const aId = history.current.id;
  const aStartedAt = history.current.startedAt;
  hub.setStatus({ mode: 'idle' });

  t += 120_000;
  hub.setStatus({ mode: 'live', username: 'sakura' });
  const bId = history.current.id;
  assert.notEqual(bId, aId);
  hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { user: { id: 'u1', name: 'A' } }, spin: { at: aStartedAt } });

  const a = history.get(aId);
  assert.equal(a.roulettes[0].results[0].count, 1, '前の配信の集計に入る');
  assert.equal(history.current.roulettes.size, 0, '今の配信の集計には混ざらない');
  hub.setStatus({ mode: 'idle' });
  clearInterval(history.details.timer);
});

test('配信を2回切り替えた後に届いた結果も、元の配信に入る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  let t = 1_700_000_000_000;
  const history = new History(hub, dir, { now: () => t, monotonicNow: () => t });
  clearInterval(history.timer);
  const giftFromA = { kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 1, diamonds: 1 }, totalDiamonds: 1 };

  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.publish({ ...giftFromA, ts: t });
  const aId = history.current.id;
  const aStartedAt = history.current.startedAt;
  hub.setStatus({ mode: 'idle' });

  t += 120_000;
  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.publish({ ...giftFromA, ts: t });
  hub.setStatus({ mode: 'idle' });

  t += 120_000;
  hub.setStatus({ mode: 'live', username: 'sakura' });
  hub.emit('roulette', { roulette: { id: 'main', name: '罰ゲーム' }, item: { label: '歌う' }, trigger: { user: { id: 'u1', name: 'A' } }, spin: { at: aStartedAt } });

  const a = history.get(aId);
  assert.equal(a.roulettes[0].results[0].count, 1, '集計が元の配信に入る');
  assert.equal(a.roulettes[0].spins, 1, 'ルーレットごとの回した回数も増える');
  assert.equal(history.current.roulettes.size, 0, '今の配信には混ざらない');
  const details = history.details.read(aId, { kind: 'roulette' });
  assert.equal(details.total, 1, '1件ごとの記録も元の配信に入る');
  hub.setStatus({ mode: 'idle' });
  clearInterval(history.details.timer);
});

test('配信の進んだ時間より先の分は、1分ごとの記録に作らない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  let wall = 1_700_000_000_000;
  let mono = 0;
  const history = new History(hub, dir, { now: () => wall, monotonicNow: () => mono });
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  // 事故の再現: Hub は実際の現在時刻を ts に付けるが、配信開始の壁時計だけが古い。
  // 未来の分を先に作らず、届いた時点まで進んだ配信時間の中へ記録するべき。
  hub.publish({ kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 1, diamonds: 1 }, totalDiamonds: 1 });
  wall += 120_000;
  mono += 120_000;
  hub.setStatus({ mode: 'idle' });

  const file = fs.readdirSync(dir).find((name) => name.endsWith('.json'));
  const saved = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  assert.equal(saved.durationMs, 120_000);
  assert.equal(saved.timeline.length, 1);
  assert.equal(saved.timeline[0].coins, 1);
  assert.ok(fs.statSync(path.join(dir, file)).size < 1024 * 1024, 'テスト用の配信の記録1件は1MB未満');
  clearInterval(history.details.timer);
});

test('時計が将来へ飛んでも、配信時間と1分ごとの記録は実際に進んだ分だけにする', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-history-'));
  const hub = new Hub();
  let wall = 1_700_000_000_000;
  let mono = 0;
  const history = new History(hub, dir, { now: () => wall, monotonicNow: () => mono });
  clearInterval(history.timer);

  hub.setStatus({ mode: 'live', username: 'sakura' });
  mono += 1_000;
  wall += 3 * 365 * 24 * 60 * 60 * 1000;
  hub.publish({ kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 1, diamonds: 1 }, totalDiamonds: 1, ts: wall });
  hub.setStatus({ mode: 'idle' });

  const file = fs.readdirSync(dir).find((name) => name.endsWith('.json'));
  const saved = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  assert.equal(saved.durationMs, 1_000);
  assert.equal(saved.timeline.length, 1);
  assert.equal(saved.timeline[0].coins, 1);
  assert.ok(fs.statSync(path.join(dir, file)).size < 1024 * 1024, '時計が飛んだ配信の記録1件は1MB未満');
  clearInterval(history.details.timer);
});
