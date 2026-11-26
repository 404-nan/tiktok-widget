// Hub のイベント再送、ギャップ判定、配信時と再送時のフィルターを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hub, REPLAY_SIZE } from '../src/hub.js';
import { ReplayCursor } from '../public/widgets/lib/replay-cursor.js';

function socket(options = {}) {
  const sent = [];
  return {
    readyState: 1,
    sent,
    role: options.role ?? 'obs',
    compact: options.compact ?? false,
    quiet: options.quiet ?? false,
    allowMessage: options.allowMessage,
    send(text) { sent.push(JSON.parse(text)); },
    on() {},
  };
}

const events = (ws) => ws.sent.filter((message) => message.type === 'event');

test('同じ epoch の再接続は since より後のイベントを順に再送する', () => {
  const hub = new Hub();
  hub.publish({ kind: 'follow', eventId: 'ingest-1' });
  hub.publish({ kind: 'gift', eventId: 'ingest-2', msgId: 'tiktok-2', user: { id: 'u1', name: '一郎' }, gift: { name: 'Rose', count: 1, diamonds: 1 } });
  hub.publish({ kind: 'share' });

  const ws = socket();
  hub.addClient(ws, { since: '0', epoch: hub.epoch });

  assert.deepEqual(ws.sent[0], {
    type: 'hello',
    status: hub.status,
    state: hub.state,
    sample: hub.sample,
    config: null,
    recentChats: [],
    epoch: hub.epoch,
    seq: 3,
    gap: false,
  });
  assert.deepEqual(events(ws).map((message) => [message.event.id, message.event.key, message.replay]), [
    [1, 'ingest-1', true],
    [2, 'tiktok-2', true],
    [3, null, true],
  ]);
});

test('直近500件を保ち、古い since と別 epoch を gap として知らせる', () => {
  const hub = new Hub();
  for (let i = 1; i <= REPLAY_SIZE + 2; i++) hub.publish({ kind: 'follow', eventId: `event-${i}` });
  assert.equal(hub.replayRing.length, REPLAY_SIZE);
  assert.equal(hub.replayRing[0].event.id, 3);

  const stale = socket();
  hub.addClient(stale, { since: 0, epoch: hub.epoch });
  assert.equal(stale.sent[0].gap, true);
  assert.deepEqual(events(stale).map((message) => message.event.id), Array.from({ length: REPLAY_SIZE }, (_, i) => i + 3));

  const otherEpoch = socket();
  hub.addClient(otherEpoch, { since: 1, epoch: 'another-process' });
  assert.equal(otherEpoch.sent[0].gap, true);
  assert.deepEqual(events(otherEpoch), []);
});

test('live と replay は compact・preview・allowMessage・quiet の同じ規則を使う', () => {
  const hub = new Hub();
  const live = socket({ compact: true, allowMessage: (message) => message.type !== 'blocked' });
  hub.addClient(live, { since: 0, epoch: hub.epoch });
  live.sent.length = 0;
  hub.publish({ kind: 'gift', eventId: 'gift-1', user: { id: 'u1', name: '一郎' }, gift: { name: 'Rose', count: 1, diamonds: 1 } });
  const liveEvent = events(live)[0];

  const replay = socket({ compact: true, allowMessage: (message) => message.type !== 'blocked' });
  hub.addClient(replay, { since: 0, epoch: hub.epoch });
  const replayEvent = events(replay)[0];
  assert.deepEqual(replayEvent.event, liveEvent.event);
  assert.ok(liveEvent.statePatch, 'live の compact には差分が付く');
  assert.equal(replayEvent.statePatch, undefined, '再送では古い差分を付けない');
  assert.equal(replayEvent.replay, true);

  const preview = socket({ role: 'preview' });
  hub.addClient(preview, { since: 0, epoch: hub.epoch });
  assert.deepEqual(events(preview), []);

  const quiet = socket({ quiet: true });
  hub.addClient(quiet, { since: 0, epoch: hub.epoch });
  assert.equal(quiet.sent.length, 1);
  assert.deepEqual(events(quiet), []);

  const blocked = socket({ allowMessage: (message) => message.type !== 'event' });
  hub.addClient(blocked, { since: 0, epoch: hub.epoch });
  assert.deepEqual(events(blocked), []);
});

test('別の room の配信では epoch と再送履歴を新しくし、同じ room では続きを再送する', () => {
  const hub = new Hub();
  hub.setStatus({ mode: 'live', roomId: 'room-1' });
  hub.publish({ kind: 'follow', eventId: 'room-1-event' });
  const firstEpoch = hub.epoch;
  assert.equal(hub.seq, 1);
  assert.equal(hub.replayRing.length, 1);

  hub.setStatus({ mode: 'ended' });
  hub.setStatus({ mode: 'live', roomId: 'room-1' });
  assert.equal(hub.epoch, firstEpoch);
  assert.equal(hub.seq, 1);
  assert.equal(hub.replayRing.length, 1);

  hub.setStatus({ mode: 'ended' });
  hub.setStatus({ mode: 'live', roomId: 'room-2' });
  assert.notEqual(hub.epoch, firstEpoch);
  assert.equal(hub.seq, 0);
  assert.deepEqual(hub.replayRing, []);

  const ws = socket();
  hub.addClient(ws, { since: 0, epoch: firstEpoch });
  assert.equal(ws.sent[0].gap, true);
  assert.deepEqual(events(ws), []);
});

test('since 付きで gap を返した接続だけを数えて hub から読める', () => {
  const hub = new Hub();
  assert.equal(hub.replayGapCount, 0);

  const noGap = socket();
  hub.addClient(noGap, { since: 0, epoch: hub.epoch });
  assert.equal(noGap.sent[0].gap, false);
  assert.equal(hub.replayGapCount, 0);

  const withoutSince = socket();
  hub.addClient(withoutSince, { epoch: 'another-process' });
  assert.equal(withoutSince.sent[0].gap, true);
  assert.equal(hub.replayGapCount, 0, 'since が無い初回接続は数えない');

  const stale = socket();
  hub.addClient(stale, { since: 0, epoch: 'another-process' });
  assert.equal(stale.sent[0].gap, true);
  assert.equal(hub.replayGapCount, 1);

  const staleAgain = socket();
  hub.addClient(staleAgain, { since: 0, epoch: 'another-process' });
  assert.equal(staleAgain.sent[0].gap, true);
  assert.equal(hub.replayGapCount, 2);
});


test('別の room の開始をつながっている画面へ知らせ、新しい配信だけ再送できる', () => {
  const hub = new Hub();
  hub.setStatus({ mode: 'live', roomId: 'room-1' });
  const first = socket();
  hub.addClient(first);
  const cursor = new ReplayCursor();
  const feed = () => {
    for (const message of first.sent) {
      if (message.type === 'hello') cursor.hello(message);
      else if (message.type === 'event') cursor.accept(message);
    }
  };

  hub.publish({ kind: 'follow', eventId: 'room-1-event' });
  feed();
  hub.setStatus({ mode: 'ended' });
  hub.setStatus({ mode: 'live', roomId: 'room-2' });

  const hellos = first.sent.filter((message) => message.type === 'hello');
  assert.equal(hellos.length, 2, 'room が変わったら接続中の画面にも新しい hello を送る');
  assert.equal(hellos[1].epoch, hub.epoch);
  assert.equal(hellos[1].seq, 0);
  feed();
  assert.equal(cursor.epoch, hub.epoch);
  assert.equal(cursor.lastSeq, 0);

  // ここで画面が切れたとみなし、新しい配信の1件目はカーソルへ入れない。
  hub.publish({ kind: 'follow', eventId: 'room-2-event' });
  const second = socket();
  hub.addClient(second, { since: cursor.lastSeq, epoch: cursor.epoch });
  assert.equal(second.sent[0].gap, false);
  assert.deepEqual(events(second).map((message) => [message.event.id, message.event.key, message.replay]), [
    [1, 'room-2-event', true],
  ]);
});


// EFFECT_TYPES と同じ一覧。サーバー側の表とずれたらこのテストの表も直す。
const EFFECT_TYPE_LIST = [
  'event', 'roulette', 'rouletteResult', 'omikuji', 'gacha', 'puchun',
  'boss', 'cheer', 'combo', 'ootori', 'peka', 'push', 'rush', 'slot',
  'cardDraw', 'goalAlert', 'stepup', 'swarm', 'throne', 'timer', 'vote', 'quiz',
  'wins', 'winsCombo', 'dareba', 'named-sabotage', 'mediaAlert',
  'giftSound', 'relay-stop', 'slotResult', 'visitor',
];

const ofType = (ws, type) => ws.sent.filter((message) => message.type === type);

function sendEffect(hub, type, index) {
  if (type === 'event') {
    hub.publish({ kind: 'follow', eventId: `${type}-${index}` });
    return;
  }
  hub.broadcast({ type, marker: `${type}-${index}` });
}

test('演出の知らせは全部、連番つきで切れた分だけ順に再送する', () => {
  for (const type of EFFECT_TYPE_LIST) {
    const hub = new Hub();
    const live = socket();
    hub.addClient(live);
    live.sent.length = 0;
    for (let i = 1; i <= 3; i++) sendEffect(hub, type, i);
    assert.deepEqual(ofType(live, type).map((message) => message.seq), [1, 2, 3], `${type} の live seq`);

    for (let i = 4; i <= 5; i++) sendEffect(hub, type, i);
    const reconnected = socket();
    hub.addClient(reconnected, { since: '3', epoch: hub.epoch });
    const replayed = ofType(reconnected, type);
    assert.deepEqual(replayed.map((message) => message.seq), [4, 5], `${type} の再送 seq`);
    assert.ok(replayed.every((message) => message.replay === true), `${type} に replay 印`);

    const caughtUp = socket();
    hub.addClient(caughtUp, { since: '5', epoch: hub.epoch });
    assert.deepEqual(ofType(caughtUp, type), [], `${type} は追いついたら再送しない`);
  }
});

test('出来事と派生の知らせが混ざっても連番は1本の昇順で抜けない', () => {
  const hub = new Hub();
  const ws = socket();
  hub.addClient(ws);
  ws.sent.length = 0;
  hub.publish({ kind: 'follow', eventId: 'mixed-1' });
  hub.broadcast({ type: 'combo', combo: { active: [], last: null }, event: { id: 'combo-1', kind: 'hit' } });
  hub.publish({ kind: 'share', eventId: 'mixed-2' });
  hub.broadcast({ type: 'stepup', stepup: {}, event: { kind: 'up', step: 2 } });

  const sequenced = ws.sent.filter((message) => ['event', 'combo', 'stepup'].includes(message.type));
  assert.deepEqual(sequenced.map((message) => [message.type, message.seq]), [
    ['event', 1],
    ['combo', 2],
    ['event', 3],
    ['stepup', 4],
  ]);
  assert.deepEqual(hub.replayRing.map((message) => message.seq), [1, 2, 3, 4]);
});

test('再送用の知らせは集計を持たず、compact でも statePatch を付けない', () => {
  const hub = new Hub();
  hub.publish({ kind: 'gift', eventId: 'stateful', user: { id: 'u1', name: '一郎' }, gift: { name: 'Rose', count: 1, diamondCount: 1 } });
  assert.equal(hub.replayRing[0].state, undefined);
  assert.equal(hub.replayRing[0].statePatch, undefined);

  const plain = socket();
  hub.addClient(plain, { since: 0, epoch: hub.epoch });
  const replayed = ofType(plain, 'event')[0];
  assert.equal(replayed.state, undefined);
  assert.equal(replayed.statePatch, undefined);
  assert.equal(plain.sent[0].state.diamonds, 1, 'hello には今の集計が残る');

  const compact = socket({ compact: true });
  hub.addClient(compact, { since: 0, epoch: hub.epoch });
  const compactReplay = ofType(compact, 'event')[0];
  assert.equal(compactReplay.state, undefined);
  assert.equal(compactReplay.statePatch, undefined);
  assert.equal(compactReplay.seq, 1);
});

test('プレビューには本番の派生知らせを再送せず、テスト由来だけは届ける', () => {
  const hub = new Hub();
  hub.broadcast({ type: 'combo', combo: { active: [], last: null }, event: { id: 'live-combo', kind: 'hit' } });
  hub.broadcast({ type: 'combo', combo: { active: [], last: null }, event: { id: 'test-combo', kind: 'hit' }, test: true });

  const preview = socket({ role: 'preview' });
  hub.addClient(preview, { since: 0, epoch: hub.epoch });
  assert.deepEqual(ofType(preview, 'combo').map((message) => message.event.id), ['test-combo']);

  const quiet = socket({ quiet: true });
  hub.addClient(quiet, { since: 0, epoch: hub.epoch });
  assert.deepEqual(ofType(quiet, 'combo'), []);
});

test('派生の知らせが入る再送リングは2000件まで保ち、古い seq は gap にする', () => {
  assert.equal(REPLAY_SIZE, 2000);
  const hub = new Hub();
  for (let i = 0; i < REPLAY_SIZE + 2; i++) hub.broadcast({ type: 'combo', marker: `ring-${i}` });
  assert.equal(hub.replayRing.length, REPLAY_SIZE);
  assert.equal(hub.replayRing[0].seq, 3);

  const stale = socket();
  hub.addClient(stale, { since: 0, epoch: hub.epoch });
  assert.equal(stale.sent[0].gap, true);
  assert.deepEqual(ofType(stale, 'combo').map((message) => message.seq), Array.from({ length: REPLAY_SIZE }, (_, i) => i + 3));
});

test('派生の知らせが持つ内部の seq は effectSeq へ退避し、一番上の seq は配信連番にする', () => {
  const hub = new Hub();
  const ws = socket();
  hub.addClient(ws);
  ws.sent.length = 0;
  hub.broadcast({ type: 'cardDraw', seq: 7, phase: 'show' });
  const message = ofType(ws, 'cardDraw')[0];
  assert.equal(message.seq, 1);
  assert.equal(message.effectSeq, 7);
});
