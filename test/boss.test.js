import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BossEngine, maxHpFor, nameFor, damageOf, hitTier } from '../src/boss.js';
import { defaultsFor } from '../src/schema.js';
import { normalize } from '../src/config.js';
import { Minecraft } from '../src/minecraft.js';

const boss = (over = {}) => ({ ...defaultsFor('bosses'), ...over });

function setup(config = { default: boss() }, file) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  file ??= path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-boss-')), 'boss.json');
  const engine = new BossEngine(hub, file);
  engine.setConfig(config);
  return { hub, engine, sent, file };
}
const gift = (name, count = 1, coins = 1, user = 'たろう') => ({ kind: 'gift', user: { id: `u_${user}`, name: user }, gift: { name, id: '1', count }, totalDiamonds: coins * count });
const like = (count) => ({ kind: 'like', user: { id: 'u2', name: 'みお' }, count });

test('最大 HP は倒すたびに hpScale 倍、名前は nextNames を順に使う', () => {
  const c = boss({ hp: 1000, hpScale: 1.5, name: 'スライム', nextNames: ['ゴブリン', '魔王'] });
  assert.equal(maxHpFor(c, 1), 1000);
  assert.equal(maxHpFor(c, 2), 1500);
  assert.equal(maxHpFor(c, 3), 2250);
  assert.deepEqual([1, 2, 3, 4].map((r) => nameFor(c, r)), ['スライム', 'ゴブリン', '魔王', '魔王']);
  assert.equal(nameFor(boss({ name: '鬼' }), 5), '鬼');
});

test('ダメージ: コイン × coinDamage、いいねは damageFrom に入れたときだけ、gifts で絞れる', () => {
  assert.equal(damageOf(boss({ coinDamage: 2 }), gift('Rose', 5, 1)), 10);
  assert.equal(damageOf(boss(), like(30)), 0);
  assert.equal(damageOf(boss({ damageFrom: ['coins', 'likes'], likeDamage: 0.5 }), like(30)), 15);
  assert.equal(damageOf(boss({ damageFrom: ['likes'] }), gift('Rose')), 0);
  assert.equal(damageOf(boss({ gifts: ['Galaxy'] }), gift('Rose', 1, 1)), 0);
  assert.equal(damageOf(boss({ gifts: ['galaxy'] }), gift('Galaxy', 1, 1000)), 1000);
  assert.equal(hitTier(boss({ bigHit: 100 }), 99), 0);
  assert.equal(hitTier(boss({ bigHit: 100 }), 100), 1);
  assert.equal(hitTier(boss({ bigHit: 100 }), 1000), 2);
});

test('ギフトで HP が減り、送った人が最後の一撃として残る', () => {
  const { engine, hub, sent } = setup({ default: boss({ hp: 1000 }) });
  hub.emit('event', gift('Doughnut', 2, 30));
  const b = engine.get('default');
  assert.equal(b.hp, 940);
  assert.equal(b.lastHit.user.name, 'たろう');
  assert.equal(b.lastHit.damage, 60);
  const msg = sent.at(-1);
  assert.equal(msg.type, 'boss');
  assert.equal(msg.event.kind, 'hit');
  assert.equal(msg.event.damage, 60);
  assert.equal(msg.prev.hp, 1000);
  assert.equal(msg.event.by.gift, 'ドーナッツ');
  // チャットやフォローではダメージにならない
  hub.emit('event', { kind: 'follow', user: { id: 'x', name: 'x' } });
  assert.equal(engine.get('default').hp, 940);
});

test('HP が 0 で討伐: とどめの人・ルーレットなどへの知らせ・残り HP が少ないしるし', () => {
  const { engine, hub, sent } = setup({ default: boss({ hp: 100, lowHp: 30, bigHit: 1000 }) });
  hub.emit('event', gift('Perfume', 1, 75));
  assert.equal(sent.at(-1).event.low, true);
  const defeated = [];
  hub.on('bossDefeated', (d) => defeated.push(d));
  hub.emit('event', gift('Galaxy', 1, 1000, 'みお'));
  const b = engine.get('default');
  assert.equal(b.hp, 0);
  assert.equal(b.defeated, true);
  assert.equal(b.kills, 1);
  assert.equal(b.finisher.user.name, 'みお');
  assert.equal(sent.at(-1).event.kind, 'defeat');
  assert.equal(sent.at(-1).event.overflow, 975);
  assert.equal(defeated.length, 1);
  assert.equal(defeated[0].trigger.gift.name, 'Galaxy');
  // 次のボスが出るまでのダメージは HP を減らさない（オーバーキル）
  hub.emit('event', gift('Rose', 3));
  assert.equal(sent.at(-1).event.kind, 'overkill');
  assert.equal(engine.get('default').hp, 0);
  assert.ok(engine.get('default').nextAt > Date.now());
});

test('次のボス: HP が hpScale 倍になって満タンで出る（autoNext のタイマー）', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { engine, sent } = setup({ default: boss({ hp: 1000, hpScale: 2, nextDelay: 5, name: 'A', nextNames: ['B'] }) });
  engine.apply('default', 'defeat');
  assert.equal(engine.get('default').defeated, true);
  t.mock.timers.tick(4999);
  assert.equal(engine.get('default').round, 1);
  t.mock.timers.tick(1);
  const b = engine.get('default');
  assert.equal(b.round, 2);
  assert.equal(b.maxHp, 2000);
  assert.equal(b.hp, 2000);
  assert.equal(b.name, 'B');
  assert.equal(b.defeated, false);
  assert.equal(sent.at(-1).event.kind, 'next');
});

test('autoNext: false なら倒れたまま。HP を戻すと同じボスが満タンに', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { engine } = setup({ default: boss({ hp: 500, autoNext: false }) });
  engine.apply('default', 'defeat');
  t.mock.timers.tick(600_000);
  assert.equal(engine.get('default').defeated, true);
  assert.equal(engine.get('default').nextAt, null);
  engine.apply('default', 'heal');
  assert.deepEqual([engine.get('default').round, engine.get('default').hp, engine.get('default').defeated], [1, 500, false]);
  engine.apply('default', 'next');
  assert.deepEqual([engine.get('default').round, engine.get('default').hp], [2, 750]);
});

test('手で動かす: damage（省くと 100）/ set / heal / reset、名前を省くと全部、知らない名前はエラー', () => {
  const { engine } = setup({ a: boss({ hp: 1000 }), b: boss({ hp: 300 }) });
  engine.apply('a', 'damage');
  assert.equal(engine.get('a').hp, 900);
  engine.apply(null, 'damage', 50);
  assert.equal(engine.get('a').hp, 850);
  assert.equal(engine.get('b').hp, 250);
  engine.apply('a', 'set', 10);
  assert.equal(engine.get('a').hp, 10);
  engine.apply('a', 'heal');
  assert.equal(engine.get('a').hp, 1000);
  engine.apply('b', 'defeat');
  engine.apply('b', 'next');
  engine.apply('b', 'reset');
  assert.deepEqual([engine.get('b').round, engine.get('b').hp, engine.get('b').kills], [1, 300, 0]);
  assert.throws(() => engine.apply('c', 'damage'), /c/);
  assert.throws(() => engine.apply('a', 'explode'), /action/);
  assert.throws(() => engine.apply('a', 'damage', -5), /value/);
});

test('HP はファイルに残り、作り直しても続きから。設定で HP を変えると割合を保つ', () => {
  const first = setup({ default: boss({ hp: 1000 }) });
  first.engine.apply('default', 'damage', 250);
  first.engine.apply('default', 'damage', 250);
  first.hub.emit('event', gift('Rose', 1, 1));
  first.engine.flush();
  const again = setup({ default: boss({ hp: 1000 }) }, first.file);
  assert.equal(again.engine.get('default').hp, 499);
  assert.equal(again.engine.get('default').lastHit.user.name, 'たろう');
  again.engine.setConfig({ default: boss({ hp: 2000 }) });
  assert.equal(again.engine.get('default').maxHp, 2000);
  assert.equal(again.engine.get('default').hp, 998);
});

test('討伐で Minecraft にコマンドを送る（{user} {boss} {round} が置き換わる）', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const mc = new Minecraft(hub);
  mc.config = { enabled: true, superstreamProfile: 'p', rules: [] };
  const sent = [];
  mc.enqueue = (commands, vars, source) => sent.push({ commands, vars, source });
  mc.onBossDefeated(
    { commands: ['say {user} が {boss} を倒した（{round} 体目）'], superstreamGift: '6001', superstreamAction: 'lightning' },
    { name: '魔王', round: 3 },
    { user: { id: 'u1', name: 'た;ろう' } },
    null,
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].commands, ['say {user} が {boss} を倒した（{round} 体目）', 'ss test profile p 6001', 'ss test action p lightning']);
  assert.equal(sent[0].vars.user, 'たろう');
  assert.equal(sent[0].vars.boss, '魔王');
  assert.equal(sent[0].vars.round, 3);
  // Minecraft 連携がオフなら送らない
  mc.config.enabled = false;
  mc.onBossDefeated({ commands: ['say x'] }, { name: 'x', round: 1 }, null, null);
  assert.equal(sent.length, 1);
});

test('設定の検証: commands は1行ずつ、ダメージにするものは coins / likes', () => {
  const { config, errors } = normalize({ bosses: { default: { name: '鬼', hp: 5000, damageFrom: ['coins', 'likes'], commands: ['/say 討伐!', 'give @a diamond'] } } });
  assert.deepEqual(errors, []);
  assert.deepEqual(config.bosses.default.commands, ['say 討伐!', 'give @a diamond']);
  assert.equal(config.bosses.default.hpScale, 1.5);
  const bad = normalize({ bosses: { default: { damageFrom: ['shares'], commands: ['say a\nsay b'], hp: 0 } } });
  assert.ok(bad.errors.some((e) => e.includes('bosses.default.damageFrom')));
  assert.ok(bad.errors.some((e) => e.includes('bosses.default.commands')));
  assert.ok(bad.errors.some((e) => e.includes('bosses.default.hp')));
});
