import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BossEngine } from '../src/boss.js';
import { defaultsFor } from '../src/schema.js';
import { createEventBus } from '../src/events.js';

const boss = (over = {}) => ({ ...defaultsFor('bosses'), ...over });

function setup(config = { default: boss() }, file) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  file ??= path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-boss-gap-')), 'boss.json');
  const engine = new BossEngine(hub, file);
  engine.setConfig(config);
  return { hub, engine, sent, file };
}

const gift = (name, id, coins) => ({
  kind: 'gift',
  user: { id: 'u', name: 'たろう' },
  gift: { name, id, count: 1 },
  totalDiamonds: coins,
});

test('順位差: HP は相手とのコイン差。自分のギフトで減り、いいねと coinDamage は無視', () => {
  const { engine, hub, sent } = setup({ default: boss({ mode: 'rank-gap', rivalCoins: 1000, coinDamage: 9, damageFrom: ['coins', 'likes'] }) });
  assert.equal(engine.get('default').hp, 1000);
  assert.equal(engine.get('default').defeated, false);
  hub.emit('event', gift('Rose', '5655', 100));
  assert.equal(engine.get('default').ourCoins, 100);
  assert.equal(engine.get('default').hp, 900);
  assert.equal(sent.at(-1).event.by.gift, 'バラ');
  hub.emit('event', { kind: 'like', user: { id: 'u2', name: 'みお' }, count: 50 });
  assert.equal(engine.get('default').ourCoins, 100);
});

test('相手コイン 0 は未開始。ダメージしても討伐にしない', () => {
  const { engine, hub } = setup({ default: boss({ mode: 'rank-gap', rivalCoins: 0 }) });
  const defeated = [];
  hub.on('bossDefeated', () => defeated.push(1));
  engine.apply('default', 'damage', 50);
  assert.equal(engine.get('default').hp, 0);
  assert.equal(engine.get('default').defeated, false);
  engine.apply('default', 'defeat');
  assert.equal(engine.get('default').defeated, false);
  assert.equal(defeated.length, 0);
});

test('差が 0 で討伐。相手が増えると戻り、自動で次のボスは出ない', () => {
  const { engine, hub } = setup({ default: boss({ mode: 'rank-gap', rivalCoins: 100, hpScale: 5, autoNext: true, nextDelay: 2 }) });
  const bus = createEventBus();
  engine.setBus(bus);
  const kinds = [];
  bus.on('boss.damage', (e) => kinds.push(['damage', e.amount]));
  bus.on('boss.heal', (e) => kinds.push(['heal', e.amount]));
  const defeated = [];
  hub.on('bossDefeated', () => defeated.push(1));
  engine.apply('default', 'damage', 100);
  assert.equal(engine.get('default').defeated, true);
  assert.equal(engine.get('default').kills, 1);
  assert.equal(defeated.length, 1);
  assert.deepEqual(kinds.at(-1), ['damage', 100]);
  assert.equal(engine.get('default').nextAt, null);
  engine.apply('default', 'rivalAdd', 40);
  assert.equal(engine.get('default').defeated, false);
  assert.equal(engine.get('default').hp, 40);
  assert.equal(engine.get('default').round, 1);
  assert.deepEqual(kinds.at(-1), ['heal', 40]);
  engine.healBy('default', 10);
  assert.equal(engine.get('default').rivalCoins, 150);
  assert.equal(engine.get('default').hp, 50);
});

test('live が取れなければ手入力。API で変えた相手コインは設定の再読込で上書きしない', () => {
  const { engine } = setup({ default: boss({ mode: 'rank-gap', rankSource: 'live', rivalCoins: 100 }) });
  engine.setRankProvider(() => ({ rivalCoins: 2000, name: '上位さん' }));
  assert.equal(engine.get('default').rivalCoins, 2000);
  assert.equal(engine.get('default').rankLive, true);
  assert.equal(engine.get('default').manualRival, 100);
  engine.setRankProvider(() => { throw new Error('ない'); });
  assert.equal(engine.get('default').rivalCoins, 100);
  assert.equal(engine.get('default').rankLive, false);

  const manual = setup({ default: boss({ mode: 'rank-gap', rivalCoins: 1000 }) });
  manual.engine.apply('default', 'rival', 5000);
  manual.engine.setConfig({ default: boss({ mode: 'rank-gap', rivalCoins: 1000, name: '改' }) });
  assert.equal(manual.engine.get('default').manualRival, 5000);
  manual.engine.setConfig({ default: boss({ mode: 'rank-gap', rivalCoins: 2500 }) });
  assert.equal(manual.engine.get('default').manualRival, 5000);

  const follow = setup({ default: boss({ mode: 'rank-gap', rivalCoins: 1000 }) });
  follow.engine.setConfig({ default: boss({ mode: 'rank-gap', rivalCoins: 2500 }) });
  assert.equal(follow.engine.get('default').manualRival, 2500);
});

test('起動時の読み込みでは討伐を知らせない。コインはファイルに残る', () => {
  const first = setup({ default: boss({ mode: 'rank-gap', rivalCoins: 80 }) });
  first.engine.apply('default', 'damage', 80);
  first.engine.flush();
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const defeated = [];
  hub.on('bossDefeated', () => defeated.push(1));
  const engine = new BossEngine(hub, first.file);
  engine.setConfig({ default: boss({ mode: 'rank-gap', rivalCoins: 80 }) });
  assert.equal(defeated.length, 0);
  assert.equal(engine.get('default').defeated, true);
  assert.equal(engine.get('default').ourCoins, 80);
});

test('固定HPは今までどおり。一部回復は満タンにしない', () => {
  const { engine, hub, sent } = setup({ default: boss({ hp: 100, autoNext: false }) });
  hub.emit('event', { kind: 'gift', user: { id: 'u', name: 'たろう' }, gift: { name: 'Doughnut', id: '1', count: 1 }, totalDiamonds: 10 });
  assert.equal(sent.at(-1).event.by.gift, 'Doughnut');
  assert.equal(engine.get('default').hp, 90);
  engine.healBy('default', 5);
  assert.equal(engine.get('default').hp, 95);
  engine.apply('default', 'heal');
  assert.equal(engine.get('default').hp, 100);
  engine.apply('default', 'defeat');
  engine.healBy('default', 10);
  assert.equal(engine.get('default').hp, 10);
  assert.equal(engine.get('default').defeated, false);
});

test('古い boss.json（新項目なし）も固定HPの続きから読める', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-boss-old-')), 'boss.json');
  fs.writeFileSync(file, JSON.stringify({
    default: { round: 1, hp: 40, maxHp: 100, defeated: false, defeatedAt: 0, lastHit: null, finisher: null, kills: 2, total: 60, updatedAt: 1 },
  }));
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const engine = new BossEngine(hub, file);
  engine.setConfig({ default: boss({ hp: 100 }) });
  const b = engine.get('default');
  assert.equal(b.mode, 'hp');
  assert.equal(b.hp, 40);
  assert.equal(b.kills, 2);
  assert.equal(b.ourCoins, 0);
});
