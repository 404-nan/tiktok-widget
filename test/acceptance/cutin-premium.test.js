// カットインのプレミア演出カードを、利用者から見た完成条件で確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Hub } from '../../src/hub.js';
import { normalize } from '../../src/config.js';
import { defaultsFor } from '../../src/schema.js';
import { resolveCutin, drawCutin } from '../../src/cutin-draw.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function event(kind, extra = {}) {
  return { kind, user: { id: 'u1', name: 'テスト' }, ...extra };
}

test('AC-1/AC-2: gift・follow・shareだけに、配る前の同じcutinDrawを付ける', () => {
  const hub = new Hub();
  const received = [[], []];
  hub.on('prepare', (e) => {
    if (['gift', 'follow', 'share'].includes(e.kind)) e.cutinDraw = drawCutin({ rush: e.rushNow === true });
  });
  for (const list of received) hub.addClient({ readyState: 1, send(text) { list.push(JSON.parse(text)); }, on() {} });
  for (const kind of ['gift', 'follow', 'share', 'like', 'chat', 'viewers']) hub.publish(event(kind, { test: true }));
  const events = received[0].filter((m) => m.type === 'event').map((m) => m.event);
  assert.equal(events.filter((e) => e.cutinDraw).length, 3);
  assert.equal(events.filter((e) => !e.cutinDraw).length, 3);
  assert.deepEqual(received[0].filter((m) => m.type === 'event').map((m) => m.event), received[1].filter((m) => m.type === 'event').map((m) => m.event));
  assert.equal(typeof events.find((e) => e.kind === 'gift').cutinDraw.seed, 'number');
  assert.equal(events.find((e) => e.kind === 'gift').cutinDraw.rush, false);
});

test('AC-2: RUSH中の印は、イベントを受け取った時点の状態を使う', () => {
  const before = drawCutin({ rush: false });
  const during = drawCutin({ rush: true });
  assert.equal(before.rush, false);
  assert.equal(during.rush, true);
});

test('AC-3: サーバー側と公開側で同じ結果を解決でき、壊れたくじは既定に戻る', () => {
  const settings = { premium: true, premiumRate: 100, premiumPatterns: ['giraffe', 'zebra', 'gold'], promote: true, promoteRate: 100, rushBoost: true };
  const draw = { premium: 0.2, pattern: 0.51, promote: 0.1, from: 0.4, seed: 12, rush: true };
  assert.deepEqual(resolveCutin(draw, 'green', settings), { tier: 'red', from: 'blue', pattern: 'zebra' });
  assert.deepEqual(resolveCutin(null, 'red', settings), { tier: 'red', from: null, pattern: null });
  assert.deepEqual(resolveCutin(draw, 'unknown', settings), { tier: null, from: null, pattern: null });
  assert.deepEqual(resolveCutin({ ...draw, premium: 2 }, 'red', settings), { tier: 'red', from: null, pattern: null });
});

test('AC-4/AC-5: 新設定の既定値と範囲・柄の検証は既存設定を壊さない', () => {
  const cutin = defaultsFor('cutins');
  const image = defaultsFor('imageCutins');
  assert.deepEqual({ premium: cutin.premium, premiumRate: cutin.premiumRate, premiumPatterns: cutin.premiumPatterns, promote: cutin.promote, promoteRate: cutin.promoteRate, rushBoost: cutin.rushBoost }, { premium: false, premiumRate: 1, premiumPatterns: ['giraffe', 'zebra', 'gold'], promote: false, promoteRate: 20, rushBoost: false });
  assert.deepEqual([image.bluePhoto, image.greenPhoto, image.redPhoto, image.goldPhoto, image.rainbowPhoto], ['', '', '', '', '']);
  const old = normalize({ cutins: { default: { redText: '激アツ' } }, imageCutins: { default: { photo: '' } } });
  assert.deepEqual(old.errors, []);
  assert.equal(old.config.cutins.default.premium, false);
  const bad = normalize({ cutins: { default: { premiumRate: 101, premiumPatterns: ['giraffe', 'bird'] } } });
  assert.ok(bad.errors.some((e) => e.includes('premiumRate')));
  assert.ok(bad.errors.some((e) => e.includes('premiumPatterns')));
});

test('AC-6: 公開側の柄はES5・決定的で、外部画像を参照しない', () => {
  const source = read('public/widgets/lib/cutin-premium.js');
  assert.doesNotMatch(source, /https?:|<image|href=/i);
  assert.doesNotMatch(source, /=>|`|\b(?:let|const|class|import|export)\b/);
  const context = { window: {}, Math, String, Number, Object, Array, JSON };
  context.window.window = context.window;
  vm.runInNewContext(source, context);
  const api = context.window.CutinPremium;
  assert.ok(api);
  for (const id of ['giraffe', 'zebra', 'gold']) {
    const first = api.paint(id, 300, 100, 42, 10);
    assert.ok(first && first.defs && first.fill);
    assert.equal(JSON.stringify(first), JSON.stringify(api.paint(id, 300, 100, 42, 10)));
    assert.notEqual(JSON.stringify(first), JSON.stringify(api.paint(id, 300, 100, 43, 10)));
  }
  assert.equal(api.paint('bird', 300, 100, 42, 10), null);
});

test('AC-7/AC-8/AC-9: 画面はプレミア結果を読み込み、かんたん設定とES5検査に登録する', () => {
  assert.match(read('public/widgets/cutin.html'), /cutin-premium\.js/);
  assert.match(read('public/widgets/image-cutin.html'), /cutin-premium\.js/);
  const cutin = read('public/widgets/lib/cutin.js');
  assert.match(cutin, /CutinPremium\.resolve/);
  assert.match(cutin, /e\.cutinDraw/);
  assert.doesNotMatch(cutin, /const seed = Math\.floor\(Math\.random\(\) \* 900\) \+ 1/);
  const simple = read('public/dashboard/simple.js');
  for (const name of ['premium', 'premiumRate', 'promote', 'promoteRate', 'rushBoost', 'bluePhoto', 'greenPhoto', 'redPhoto', 'goldPhoto', 'rainbowPhoto']) assert.match(simple, new RegExp(name));
  assert.match(read('test/es5-public.test.js'), /cutin-premium\.js/);
});
