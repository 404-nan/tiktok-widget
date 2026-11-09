// 天井の数えの保存・復元：再起動（＝作り直し）を挟んでも、配信者ごとの数えが続きから数わること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gacha } from '../src/gacha.js';
import { defaultsFor } from '../src/schema.js';

function setup(storeFile, over = {}) {
  const omikuji = new Gacha(
    { broadcast: () => {} },
    { name: 'omikuji', random: () => 0.999, storeFile },
  );
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, displayMode: 'short', tempo: 'quick', ...over });
  return omikuji;
}

const gift = (testFlag = false) => ({
  kind: 'gift',
  totalDiamonds: 10,
  gift: { id: '1', name: 'Rose' },
  user: { id: 'u1', name: 'ゆず' },
  ...(testFlag ? { test: true } : {}),
});

function draw(t, omikuji, testFlag = false) {
  omikuji.onEvent(gift(testFlag));
  t.mock.timers.tick(400);
  const seen = { tier: omikuji.tier?.id, forced: omikuji.forced };
  t.mock.timers.tick(2550);
  t.mock.timers.tick(500);
  t.mock.timers.tick(100);
  assert.equal(omikuji.phase, 'idle');
  return seen;
}

test('数えは保存され、作り直しても続きから数える', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pity-store-'));
  const file = path.join(dir, 'omikuji-pity.json');
  const first = setup(file, { pity: 5 });
  draw(t, first);
  draw(t, first);
  assert.equal(first.snapshot().pityCount, 2);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pityCount, 2);
  first.close();
  const second = setup(file, { pity: 5 });
  assert.equal(second.snapshot().pityCount, 2);
  second.close();
});

test('復元した続きで天井に届くと大吉が確定し、保存も 0 に戻る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pity-store-'));
  const file = path.join(dir, 'omikuji-pity.json');
  const first = setup(file, { pity: 3 });
  draw(t, first);
  draw(t, first);
  draw(t, first);
  assert.equal(first.snapshot().pityCount, 3);
  first.close();
  const second = setup(file, { pity: 3 });
  const hit = draw(t, second);
  assert.equal(hit.tier, 'daikichi');
  assert.equal(hit.forced, true);
  assert.equal(second.snapshot().pityCount, 0);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pityCount, 0);
  second.close();
});

test('テスト抽選では数えも保存も進まない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pity-store-'));
  const file = path.join(dir, 'omikuji-pity.json');
  const omikuji = setup(file, { pity: 5 });
  draw(t, omikuji, true);
  assert.equal(omikuji.snapshot().pityCount, 0);
  assert.equal(fs.existsSync(file), false);
  omikuji.close();
});

test('保存先が壊れていても 0 から始めて動き続ける', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pity-store-'));
  const file = path.join(dir, 'omikuji-pity.json');
  fs.writeFileSync(file, '{broken');
  const omikuji = setup(file, { pity: 5 });
  assert.equal(omikuji.snapshot().pityCount, 0);
  draw(t, omikuji);
  assert.equal(omikuji.snapshot().pityCount, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pityCount, 1);
  omikuji.close();
});
