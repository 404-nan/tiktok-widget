// combo-3 のレビュー指摘を、既存の受け入れテストとは別の経路で確かめる。
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createStore } from '../../src/config.js';
import { createRuntime } from '../../src/runtime.js';
import { ComboEngine } from '../../src/combo.js';
import { giftDisplayName } from '../../src/gift-display.js';
import { defaultsFor } from '../../src/schema.js';

function comboWithMessages() {
  const hub = new EventEmitter();
  hub.status = { mode: 'idle' };
  const sent = [];
  hub.broadcast = (message) => sent.push(message);
  const combo = new ComboEngine(hub);
  combo.setConfig({ ...defaultsFor('combo') });
  return { combo, hub, sent };
}

test('AC-16 gift は giftDisplayName の値そのものを使う', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  try {
    const { combo, hub, sent } = comboWithMessages();
    // ID だけでは表示名を決めず、giftDisplayName の結果をそのまま使う。
    const gift = { id: '9', name: 'Rose', nameJa: 'バラ', count: 1 };
    const expected = giftDisplayName(gift);
    const event = { kind: 'gift', user: { id: 'u1', name: 'たろう' }, gift, totalDiamonds: 5 };
    hub.emit('event', event);
    mock.timers.tick(1000);
    hub.emit('event', event);
    assert.equal(sent.at(-1).event.gift, expected);
  } finally {
    mock.timers.reset();
  }
});

test('AC-14/17 combo 操作のあとも readRush は新しい snapshot を返す', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-combo-review-'));
  const runtime = createRuntime({
    id: 'review',
    store: createStore(path.join(dir, 'config.yaml')),
    dataDir: dir,
    mediaDirs: [],
    entitled: () => true,
  });
  t.after(() => runtime.close());

  const first = runtime.readRush();
  assert.equal(runtime.performControl('combo', 'status').status, 200);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const second = runtime.readRush();
  assert.ok(second.now > first.now, `now が進む (${first.now} → ${second.now})`);
});

test('reset は event.kind を持たない空の snapshot だけを配る', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  try {
    const { combo, hub, sent } = comboWithMessages();
    const gift = { kind: 'gift', user: { id: 'u1', name: 'たろう' }, gift: { id: '9', name: 'Rose', count: 1 }, totalDiamonds: 5 };
    hub.emit('event', gift);
    mock.timers.tick(1000);
    hub.emit('event', gift);
    sent.length = 0;

    combo.reset();

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].combo.active, []);
    assert.equal('event' in sent[0], false);
  } finally {
    mock.timers.reset();
  }
});
