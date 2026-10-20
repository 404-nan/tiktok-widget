import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { defaultsFor, SCHEMA } from '../src/schema.js';
import { parseText } from '../src/config.js';
import { SlotEngine, rollSlot, slotTimeline, RESULT_HOLD_MS } from '../src/slot.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function loadCore() {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(read('public/widgets/lib/slot-core.js'), sandbox);
  return sandbox.module.exports;
}

const Core = loadCore();
const html = read('public/widgets/slot.html');
const widget = read('public/widgets/slot.js');
const config = defaultsFor('slots');

test('絵柄は SVG 6 種で、slot.html に 1 回ずつ書いてある', () => {
  assert.deepEqual([...Core.PICS].sort(), ['7', 'bar', 'bell', 'cherry', 'replay', 'suika']);
  for (const pic of Core.PICS) {
    assert.equal(html.split(`<symbol id="s-${pic}"`).length - 1, 1, pic);
  }
  // 文字だけの絵柄（textContent で絵柄名を入れる形）はもう使わない
  assert.doesNotMatch(widget, /\.symbol'\)\.textContent/);
  assert.match(widget, /<use href="#s-/);
});

test('既定の絵柄は 6 種の絵にそのまま対応し、役の絵柄も絵柄一覧にある', () => {
  const names = config.symbols.map((s) => s.label);
  assert.equal(names.length, 6);
  const pics = names.map((n) => Core.aliasOf(n));
  assert.ok(pics.every(Boolean), JSON.stringify(pics));
  assert.deepEqual([...new Set(pics)].sort(), [...Core.PICS].sort());
  for (const payout of config.payouts) for (const name of payout.symbols) assert.ok(names.includes(name), name);
});

test('古い設定の絵柄名は対応表で読み替え、表に無い名前も文字でなく絵になる', () => {
  const old = ['さくらんぼ', 'ベル', 'スター', '7'];
  const picFor = Core.createSymbolMap(old);
  assert.equal(picFor('さくらんぼ'), 'cherry');
  assert.equal(picFor('スター'), 'bar');
  assert.equal(picFor('ベル'), 'bell');
  assert.equal(picFor('7'), '7');
  assert.equal(picFor({ label: 'さくらんぼ' }), 'cherry');
  const custom = Core.createSymbolMap(['りんご', 'みかん', '7']);
  const a = custom('りんご');
  const b = custom('みかん');
  assert.ok(Core.PICS.includes(a) && Core.PICS.includes(b));
  assert.notEqual(a, b);
  assert.notEqual(a, '7');
  assert.ok(Core.PICS.includes(custom('設定に無い名前')));
});

test('画面の時刻表はサーバーと同じで、結果は復活でも 2.5 秒以上見せる', () => {
  for (const reelStopMs of [100, 700, 1500]) {
    for (const reach of [false, true]) {
      for (const revival of [false, true]) {
        const result = { reach, revival, tier: revival ? 'big' : 'lose' };
        const t = Core.timeline(result, reelStopMs);
        const server = slotTimeline(result, reelStopMs);
        assert.equal(t.resultAt, server.resultAt);
        assert.equal(t.holdUntil, server.holdUntil);
        assert.ok(t.holdUntil - t.resultAt >= 2500);
        assert.ok(t.resultAt > t.stops[2]);
        assert.ok(t.stops[0] < t.stops[1] && t.stops[1] < t.stops[2], '左→中→右の順に止まる');
        if (revival) assert.ok(t.revivalAt > t.settleAt && t.revivalTextAt < t.resultAt);
      }
    }
  }
  assert.equal(RESULT_HOLD_MS, Core.RESULT_HOLD_MS);
});

test('リーチ演出はサーバーの result.reach と一致する', () => {
  let seed = 1;
  const random = (min, max) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return min + (seed % (max - min));
  };
  let seen = 0;
  for (let i = 0; i < 500; i++) {
    const r = rollSlot(config, random);
    const t = Core.timeline(r, 700);
    assert.equal(t.reachAt >= 0, r.reach);
    if (r.reach) { seen++; assert.equal(t.reachAt, t.stops[1]); }
  }
  assert.ok(seen > 0);
  // 画面は絵柄から独自にリーチを判定しない（timeline の reachAt だけを見る）
  assert.doesNotMatch(widget, /symbols\[0\]\s*===\s*symbols\[1\]/);
  assert.match(widget, /t\.reachAt >= 0/);
});

test('ニアミスの上段と復活の仮の絵は、当たりの絵とずれている', () => {
  const picFor = Core.createSymbolMap(config.symbols);
  assert.equal(Core.nearMissName(['7', '7', 'BAR'], picFor), '7');
  assert.equal(Core.nearMissName(['ベル', 'チェリー', 'ベル'], picFor), 'チェリー');
  assert.equal(Core.nearMissName(['ベル', 'ベル', 'ベル'], picFor), '');
  for (const pic of Core.PICS) assert.notEqual(Core.revivalFakePic(pic), pic);
});

test('サーバーの done は結果を見せ終わる時刻まで待つ（抽選の結果は変えない）', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const events = [];
    const hub = { broadcast: (msg) => events.push(msg) };
    const slot = new SlotEngine(hub, { randomInt: () => 0 });
    slot.setConfig({ ...config, revivalRate: 100, payouts: [{ id: 'jp', text: 'ジャックポット', tier: 'jackpot', weight: 1, symbols: ['7', '7', '7'] }] });
    slot.start({ kind: 'dev' });
    const start = events.find((e) => e.event === 'start');
    assert.equal(start.result.revival, true);
    const hold = slotTimeline(start.result, 700).holdUntil;
    mock.timers.tick(hold - 1);
    assert.equal(events.some((e) => e.event === 'done'), false);
    mock.timers.tick(1);
    assert.equal(events.some((e) => e.event === 'done'), true);
    slot.close();
  } finally {
    mock.timers.reset();
  }
});

test('ギフトで回ったときはアバターと個数も画面へ渡す', () => {
  const events = [];
  const hub = new EventEmitter();
  hub.broadcast = (msg) => events.push(msg);
  const slot = new SlotEngine(hub, { randomInt: () => 0 });
  slot.setConfig(config);
  slot.onEvent({ kind: 'gift', gift: { id: '5655', name: 'Rose', count: 3, diamonds: 1 }, user: { id: 'u', name: 'ゆうと', avatar: 'https://example.com/a.png' } });
  const start = events.find((e) => e.event === 'start');
  assert.equal(start.trigger.count, 3);
  assert.equal(start.trigger.user.avatar, 'https://example.com/a.png');
  slot.close();
});

test('待機表示 idleMode は small / hide（既定 small）', () => {
  assert.deepEqual(SCHEMA.slots.fields.idleMode.values, ['small', 'hide']);
  assert.equal(config.idleMode, 'small');
  const ok = parseText('slots:\n  idleMode: hide\n');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.config.slots.idleMode, 'hide');
  const bad = parseText('slots:\n  idleMode: big\n');
  assert.ok(bad.errors.length > 0);
  assert.equal(bad.config.slots.idleMode, 'small');
  assert.match(widget, /cfg\.idleMode !== 'hide'/);
  assert.deepEqual(SCHEMA.slots.size(), [1080, 600]);
});

test('slot.html は仕様の寸法で、Chromium 103 で使えない CSS・グラデ・ガラスを使わない', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  for (const rule of [
    /\.cab \{[^}]*width: 1032px; height: 480px/,
    /\.band \{[^}]*height: 96px/,
    /\.who \{[^}]*width: 320px/,
    /\.window \{[^}]*height: 332px; flex: none; padding: 12px 28px/,
    /\.reel \{[^}]*width: 296px; height: 288px;[^}]*border: 6px solid/,
    /\.cell \{ height: 92px/,
    /\.sym \{ width: 76px; height: 76px/,
    /\.lamp \{[^}]*width: 296px; height: 12px/,
    /\.mini \{[^}]*width: 376px; height: 112px/,
    /#stage \{[^}]*width: 1080px; height: 600px;[^}]*white-space: nowrap/,
  ]) assert.match(css, rule);
  assert.doesNotMatch(html, /gradient\(|backdrop-filter|blur\(|:has\(|color-mix\(|@container|text-wrap/);
  assert.doesNotMatch(css, /(^|[;{\s])(translate|scale|rotate)\s*:/m);
  assert.doesNotMatch(css, /rgba\(|hsla\(/);
  // 3 本のリール
  assert.equal((html.match(/<div class="reel( d[12])?">/g) || []).length, 3);
  assert.match(html, /lang="ja"/);
});
