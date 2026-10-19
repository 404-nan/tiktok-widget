// ダレ場の判定・状態・テスト送信を、利用者から見える条件で確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DarebaEngine } from '../../src/dareba.js';

class TestHub extends EventEmitter {
  constructor() {
    super();
    this.status = { mode: 'idle' };
    this.messages = [];
  }

  broadcast(message) {
    this.messages.push(message);
  }
}

const gift = (ts, name = `送信者${ts}`) => ({
  kind: 'gift',
  ts,
  user: { id: name, name },
  gift: { id: '1', name: '小さなギフト', count: 1, diamonds: 1 },
  totalDiamonds: 1,
});

function harness(config = {}) {
  const hub = new TestHub();
  const engine = new DarebaEngine({ hub, now: () => harness.now });
  engine.setConfig({ enabled: true, type: '野良ボス', ...config });
  return { hub, engine };
}

test('AC-1/2: 600秒未満・基準0・40%境界・1200秒未満の再発を止める', () => {
  harness.now = 0;
  const { hub, engine } = harness();
  hub.status = { mode: 'live' };
  engine.startLive(0);
  for (let i = 0; i < 10; i++) engine.record(gift(i * 40_000));
  engine.evaluate(599_999);
  assert.equal(engine.snapshot().state, 'monitoring');
  engine.evaluate(600_000);
  assert.equal(engine.snapshot().state, 'triggered');
  const firstId = engine.snapshot().eventId;
  engine.stop('停止しました');
  engine.evaluate(1_200_000);
  assert.equal(engine.snapshot().state, 'stopped');
  engine.record(gift(1_260_000, '基準')); // 直近180秒は基準の3分合計の40%を超えても待ち時間中は起こさない
  engine.evaluate(1_380_000);
  assert.equal(engine.snapshot().eventId, firstId);
});

test('AC-3/5/8: 種類・送信者・時刻をサーバー状態として同じ形で復元する', () => {
  harness.now = 0;
  const { hub, engine } = harness({ type: '宝箱' });
  engine.startLive(0);
  engine.trigger({ user: { id: 'u1', name: '花子' }, ts: 700_000 });
  const state = engine.snapshot();
  assert.equal(state.type, '宝箱');
  assert.equal(state.startedAt, 700_000);
  assert.equal(state.user.name, '花子');
  assert.equal(state.state, 'triggered');
  assert.deepEqual(engine.restore(state), state);
  assert.equal(hub.messages.at(-1).type, 'dareba');
});

test('AC-3/4: 進行中の二重開始を拒否し、停止で予約とタイマーを片付ける', () => {
  const { engine } = harness({ type: '号外' });
  engine.startLive(0);
  assert.equal(engine.trigger({ ts: 700_000 }), true);
  assert.equal(engine.trigger({ ts: 701_000 }), false);
  assert.equal(engine.snapshot().state, 'triggered');
  assert.equal(engine.stop('中断しました'), true);
  assert.equal(engine.snapshot().state, 'stopped');
  assert.equal(engine.snapshot().remainingMs, 0);
});

test('AC-6/7: event と testEvent を分け、テスト送信を基準や待ち時間へ入れない', () => {
  const { engine } = harness();
  engine.startLive(0);
  engine.record(gift(700_000, '本番'));
  engine.testEvent(gift(700_001, 'テスト'));
  assert.equal(engine.snapshot().observedEvents, 1);
  assert.equal(engine.snapshot().lastUser.name, '本番');
  engine.resetForLive(800_000);
  assert.equal(engine.snapshot().observedEvents, 0);
});

test('AC-9: 表示用の値に判定基準を含めない', () => {
  const { engine } = harness();
  engine.startLive(0);
  engine.trigger({ ts: 700_000, user: { name: '花子' } });
  const text = JSON.stringify(engine.snapshot());
  assert.doesNotMatch(text, /基準|平均|40%|600/);
});
