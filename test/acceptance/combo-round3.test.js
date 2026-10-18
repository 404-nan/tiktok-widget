// docs/cards/combo.md の「3巡目」AC-16・AC-17・AC-18。
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

function bootRuntime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-combo-r3-'));
  return createRuntime({ id: 'a', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir], entitled: () => true });
}

// isDevEnv が true になる環境(開発サーバーのポート)で起こす
function devRuntime(t) {
  const before = { TW_ENV: process.env.TW_ENV, PORT: process.env.PORT };
  process.env.TW_ENV = 'dev';
  process.env.PORT = '3941';
  const rt = bootRuntime();
  t.after(() => {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    return rt.close();
  });
  return rt;
}

test('AC-16 hit の gift は giftDisplayName の値そのもの', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  try {
    const hub = new EventEmitter();
    hub.status = { mode: 'idle' };
    const sent = [];
    hub.broadcast = (m) => sent.push(m);
    const combo = new ComboEngine(hub);
    combo.setConfig({ ...defaultsFor('combo') });
    // 5487 は対応表で「フィンガーハート」。TikTok から来た名前は英語
    const gift = { id: '5487', name: 'Finger Heart', count: 1 };
    const ja = giftDisplayName(gift);
    assert.notEqual(ja, 'Finger Heart', '前提: 日本語名がある');
    const e = () => ({ kind: 'gift', user: { id: 'u1', name: 'たろう' }, gift, totalDiamonds: 5 });
    hub.emit('event', e());
    mock.timers.tick(1000);
    hub.emit('event', e());
    const hit = sent.find((m) => m.event?.kind === 'hit');
    assert.equal(hit.event.gift, ja);
  } finally {
    mock.timers.reset();
  }
});

test('AC-17 readRush は待機中でも呼ぶたびに今の snapshot を返す', async (t) => {
  const rt = bootRuntime();
  t.after(() => rt.close());
  const first = rt.readRush();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const second = rt.readRush();
  assert.ok(second.now > first.now, `now が進む (${first.now} → ${second.now})`);
});

for (const [name, user] of [['文字列', 'abc'], ['数', 5], ['空のオブジェクト', {}], ['id も name もないオブジェクト', { avatar: 'x' }]]) {
  test(`AC-18 data.user が${name}なら 400 でテストを送らない`, (t) => {
    const rt = devRuntime(t);
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    t.after(() => mock.timers.reset());
    const sent = [];
    const broadcast = rt.hub.broadcast.bind(rt.hub);
    rt.hub.broadcast = (m) => { sent.push(m); return broadcast(m); };
    const out = rt.performControl('combo', 'test', { user, count: 5 });
    assert.equal(out.status, 400);
    assert.match(out.body.error, /[ぁ-んァ-ン一-龥]/, '日本語の理由');
    mock.timers.tick(10_000);
    assert.equal(sent.filter((m) => m.type === 'combo').length, 0);
    assert.equal(rt.readCombo().active.length, 0);
  });
}

test('AC-18 data.user が無ければ既定のテスト用の人で動く', (t) => {
  const rt = devRuntime(t);
  const out = rt.performControl('combo', 'test', { count: 5 });
  assert.equal(out.status, 200);
});
