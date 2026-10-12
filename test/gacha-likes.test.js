import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Minecraft } from '../src/minecraft.js';
import { WinsEngine } from '../src/wins.js';
import { normalize } from '../src/config.js';

const fakeHub = () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  return hub;
};

test('WIN ガチャ: ルーレットの当たりの wins だけ WIN が増減する', () => {
  const hub = fakeHub();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gacha-')), 'wins.json');
  const w = new WinsEngine(hub, file);
  w.setConfig({ default: { rules: [] } });
  hub.emit('roulette', { roulette: { name: 'WINガチャ' }, item: { label: 'SR -10', wins: -10 }, trigger: { user: { id: 'u', name: 'さくら' } } });
  hub.emit('roulette', { roulette: { name: 'WINガチャ' }, item: { label: 'ハズレ' }, trigger: null });
  hub.emit('roulette', { roulette: { name: 'WINガチャ' }, item: { label: 'N +3', wins: 3 }, trigger: null });
  assert.equal(w.get('default').wins, -7);
});

test('ルーレットの項目の wins は 0 以外の整数だけ', () => {
  const { config, errors } = normalize({ roulettes: { g: { items: [{ label: '+5', wins: 5 }, { label: 'x', wins: 1.5 }] } } });
  assert.equal(config.roulettes.g.items[0].wins, 5);
  assert.ok(errors.some((e) => e.startsWith('roulettes.g.items[1].wins')));
});

test('いいね N 回ごと: たまった回数だけコマンドを送る', () => {
  const hub = fakeHub();
  const mc = new Minecraft(hub);
  const sent = [];
  mc.enqueue = (commands) => sent.push(...commands);
  mc.setConfig({ enabled: false, rules: [] }); // つながないように一度オフで設定してから差し替える
  mc.config = { enabled: true, rules: [{ name: 'いいねTNT', events: ['like'], everyLikes: 200, commands: ['summon tnt'] }] };
  const like = (count) => hub.emit('event', { kind: 'like', user: { id: 'u', name: 'a' }, count });
  like(150); // 150
  assert.equal(sent.length, 0);
  like(60); // 210 → 1回
  assert.equal(sent.length, 1);
  like(400); // 610 → 2回（400・600）
  assert.equal(sent.length, 3);
});
