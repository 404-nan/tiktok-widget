// リレー停止の完成条件を、サーバー側の状態遷移として確かめる受け入れテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RelayStopEngine } from '../../src/relay-stop.js';

function makeHarness(options = {}) {
  const hub = new EventEmitter();
  hub.broadcast = (message) => hub.emit('broadcast', message);
  const slot = {
    starts: 0,
    start(trigger) {
      this.starts += 1;
      return {
        ok: true,
        phase: 'rolling',
        seq: this.starts,
        result: { id: `slot-${this.starts}`, symbols: ['赤', '青', '金'], tier: 'small', reach: true, nearMiss: false, revival: false },
        payout: { id: 'small', text: '小当たり' },
        trigger,
      };
    },
  };
  const timers = new Map();
  let timerId = 0;
  const relay = new RelayStopEngine(hub, {
    slot,
    waitMs: 10000,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    ...options,
  });
  return { hub, slot, relay, timers };
}

function gift(id, name = id) {
  return { kind: 'gift', gift: { id: `gift-${id}`, name: '対象ギフト', count: 1, diamonds: 1 }, user: { id, name }, ts: Date.now() };
}

test('AC-1: 開始時に既存 SlotEngine を一度だけ回し、結果を固定する', () => {
  const { relay, slot } = makeHarness();
  const started = relay.start(gift('one'));
  assert.equal(started.ok, true);
  assert.equal(slot.starts, 1);
  assert.deepEqual(relay.snapshot().fixedResult.symbols, ['赤', '青', '金']);
  assert.equal(relay.snapshot().state, 'waiting');
  relay.close();
});

test('AC-2/5: 有効なギフトの到着順で3本を止め、送信者を各リールへ保存する', () => {
  const { relay } = makeHarness();
  relay.start(gift('starter', '開始者'));
  relay.onEvent(gift('first', '一人目'));
  relay.onEvent(gift('second', '二人目'));
  relay.onEvent(gift('third', '三人目'));
  const state = relay.snapshot();
  assert.equal(state.state, 'idle');
  assert.equal(state.stoppedCount, 3);
  assert.deepEqual(state.stoppers.map((user) => user.name), ['一人目', '二人目', '三人目']);
  assert.equal(state.linked, true);
  relay.close();
});

test('レビュー再現: 完了後の次のギフトは新しいリレーを開始し、エラーを返さない', () => {
  const { relay, slot } = makeHarness();
  relay.start(gift('starter'));
  relay.onEvent(gift('one'));
  relay.onEvent(gift('two'));
  relay.onEvent(gift('three'));

  const next = relay.onEvent(gift('four'));
  assert.equal(next.ok, true);
  assert.equal(slot.starts, 2);
  assert.equal(relay.snapshot().stoppedCount, 1);
  relay.close();
});

test('AC-3/7: 各停止待ちは10秒で自動停止し、待機中はあと1人を示す', () => {
  const { relay, timers } = makeHarness();
  relay.start(gift('starter'));
  assert.equal(relay.snapshot().message, 'あと1人');
  const firstTimer = [...timers.entries()][0][1];
  assert.equal(firstTimer.ms, 10000);
  firstTimer.fn();
  assert.equal(relay.snapshot().stoppedCount, 1);
  assert.equal(relay.snapshot().stoppers[0], null);
  assert.equal(relay.snapshot().state, 'waiting');
  relay.close();
});

test('AC-4: 進行中は1台だけ、待機列に上限はなく投げた分を捨てない', () => {
  const { relay, slot } = makeHarness();
  relay.start(gift('active'));
  for (let i = 0; i < 100; i++) assert.equal(relay.start(gift(`queued-${i}`)).queued, true);
  assert.equal(slot.starts, 1);
  relay.close();
});

test('AC-8/9: スナップショットに固定結果とテスト分離があり、不正入力は日本語で拒否する', () => {
  const { relay } = makeHarness();
  assert.equal(relay.stop({ reel: 0, user: null }).ok, false);
  assert.match(relay.stop({ reel: -1, user: { id: 'x' } }).error, /リール/);
  relay.start(gift('starter'));
  const out = relay.onEvent({ ...gift('test-user'), test: true });
  assert.equal(out.visualOnly, true);
  assert.equal(relay.snapshot().stoppedCount, 0);
  assert.deepEqual(relay.snapshot().fixedResult.symbols, ['赤', '青', '金']);
  relay.close();
});
