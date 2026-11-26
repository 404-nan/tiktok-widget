// Hub のイベント再送、ギャップ判定、配信時と再送時のフィルターを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hub, REPLAY_SIZE } from '../src/hub.js';

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
  assert.deepEqual(replayEvent.statePatch, liveEvent.statePatch);
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
