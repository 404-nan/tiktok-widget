// docs/cards/combo.md の AC-3〜AC-8(ComboEngine)。実装より前に書いた受け入れテスト。
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ComboEngine } from '../../src/combo.js';
import { defaultsFor } from '../../src/schema.js';

mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
afterEach(() => mock.timers.setTime(1_000_000));

function setup(overrides = {}) {
  const hub = new EventEmitter();
  hub.status = { mode: 'idle' };
  const sent = [];
  const emitted = [];
  hub.broadcast = (msg) => sent.push(msg);
  hub.on('combo', (snap, event) => emitted.push({ snap, event }));
  const combo = new ComboEngine(hub);
  combo.setConfig({ ...defaultsFor('combo'), ...overrides });
  const kinds = () => sent.filter((m) => !m.test).map((m) => m.event.kind);
  return { hub, combo, sent, emitted, kinds };
}
const gift = (name = 'Rose', coins = 10, user = { id: 'u1', name: 'たろう' }, count = 1) => ({ kind: 'gift', user, gift: { name, id: '9', count }, totalDiamonds: coins });
const sec = (n) => mock.timers.tick(n * 1000);
const send = (hub, n, mk = () => gift(), gapSec = 1) => {
  for (let i = 0; i < n; i++) {
    hub.emit('event', mk());
    if (i < n - 1) sec(gapSec);
  }
};
const ends = (sent) => sent.filter((m) => m.event?.kind === 'end');

test('AC-3 ×1 は画面に出さず、×2 から hit を配る', () => {
  const { hub, kinds, combo, sent } = setup();
  hub.emit('event', gift());
  assert.deepEqual(kinds(), []);
  assert.equal(sent.length, 0);
  sec(1);
  hub.emit('event', gift());
  assert.deepEqual(kinds(), ['hit']);
  assert.equal(sent[0].type, 'combo');
  assert.equal(sent[0].event.count, 2);
  assert.deepEqual(sent[0].combo, combo.snapshot());
});

test('AC-3 gift 以外のイベントは見ない', () => {
  const { hub, kinds } = setup();
  hub.emit('event', { kind: 'chat', user: { id: 'u1', name: 'a' }, text: 'hi' });
  hub.emit('event', { kind: 'follow', user: { id: 'u1', name: 'a' } });
  hub.emit('event', gift());
  sec(1);
  hub.emit('event', gift());
  assert.deepEqual(kinds(), ['hit']);
});

test('AC-3 違うギフトでも続き、count と total が増える。個数 5 でも ×1 回分', () => {
  const { hub, sent } = setup();
  hub.emit('event', gift('Rose', 1, undefined, 5));
  sec(1);
  hub.emit('event', gift('Lion', 100, undefined, 1));
  sec(1);
  hub.emit('event', gift('Heart', 7, undefined, 9));
  const last = sent.at(-1).event;
  assert.equal(last.kind, 'hit');
  assert.equal(last.count, 3);
  assert.equal(last.total, 108);
  assert.equal(last.coins, 7);
  assert.equal(last.gift, 'Heart');
  assert.deepEqual(Object.keys(last.user).sort(), ['avatar', 'id', 'name']);
});

test('AC-3 前のギフトから seconds 秒より後は、新しく ×1 から数える', () => {
  const { hub, combo, sent } = setup({ seconds: 10 });
  send(hub, 3);
  assert.equal(sent.at(-1).event.count, 3);
  sec(10.5);
  hub.emit('event', gift());
  assert.equal(combo.snapshot().active.length, 0); // 新しい ×1 は出さない
  sec(1);
  hub.emit('event', gift());
  assert.equal(sent.at(-1).event.kind, 'hit');
  assert.equal(sent.at(-1).event.count, 2);
});

test('AC-3 gifts に合わないギフトと minCoins 未満は、続けも切りもしない', () => {
  const { hub, sent, combo } = setup({ gifts: ['Rose'], minCoins: 5, seconds: 10 });
  hub.emit('event', gift('Rose', 10));
  sec(1);
  hub.emit('event', gift('Lion', 999)); // gifts に無い
  hub.emit('event', gift('Rose', 4)); // minCoins 未満
  assert.equal(sent.length, 0);
  sec(1);
  hub.emit('event', gift('rose', 5)); // ちょうど minCoins は数える
  assert.equal(sent.at(-1).event.count, 2);
  assert.equal(sent.at(-1).event.total, 15);
  // 無視されたギフトは期限も延ばさない: 最後に数えたギフトから seconds 秒で切れる
  sec(9);
  hub.emit('event', gift('Lion', 999));
  sec(2);
  assert.equal(combo.snapshot().active.length, 0);
});

test('AC-3 人が違えば別のコンボ。id が無ければ name で区別する', () => {
  const { hub, combo } = setup();
  const a = { id: 'a', name: 'A' };
  const b = { id: 'b', name: 'B' };
  hub.emit('event', gift('Rose', 1, a));
  hub.emit('event', gift('Rose', 1, b));
  sec(1);
  hub.emit('event', gift('Rose', 1, a));
  let act = combo.snapshot().active;
  assert.equal(act.length, 1);
  assert.equal(act[0].user.name, 'A');
  sec(1);
  hub.emit('event', gift('Rose', 1, b));
  assert.equal(combo.snapshot().active.length, 2);
  hub.emit('event', gift('Rose', 1, { name: 'N1' }));
  hub.emit('event', gift('Rose', 1, { name: 'N2' }));
  sec(1);
  hub.emit('event', gift('Rose', 1, { name: 'N1' }));
  act = combo.snapshot().active;
  assert.equal(act.filter((x) => x.user.name === 'N1').length, 1);
  assert.equal(act.some((x) => x.user.name === 'N2'), false);
});

test('AC-3 エンジンごとに別々: 別のエンジンの数は混ざらない', () => {
  const a = setup();
  const b = setup();
  send(a.hub, 3);
  assert.equal(b.combo.snapshot().active.length, 0);
});

test('AC-3 持つ人数は最大 30。超えたら一番古く更新されたものをしめてから消す', () => {
  const { hub, combo, sent } = setup({ seconds: 120 });
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 30; i++) {
      hub.emit('event', gift('Rose', 1, { id: `p${i}`, name: `P${i}` }));
      sec(0.1);
    }
  }
  assert.equal(combo.snapshot().active.length, 30);
  sent.length = 0;
  hub.emit('event', gift('Rose', 1, { id: 'new', name: 'NEW' }));
  assert.equal(ends(sent).length, 1);
  assert.equal(ends(sent)[0].event.user.id, 'p0');
  assert.equal(combo.snapshot().active.length, 29); // 新しい ×1 はまだ出さない
  assert.ok(!combo.snapshot().active.some((x) => x.user.id === 'p0'));
});

test('AC-4 段: 境目の回数で blue/green/red/gold/rainbow', () => {
  const { hub, sent } = setup();
  send(hub, 8);
  const hits = sent.map((m) => m.event);
  assert.deepEqual(hits.map((h) => h.count), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(hits.map((h) => h.tier), ['blue', 'green', 'red', 'gold', 'rainbow', 'rainbow', 'rainbow']);
});

test('AC-4 段が上がったときだけ up: true。境目は設定で変えられる', () => {
  const { hub, sent } = setup({ blueAt: 2, greenAt: 4, redAt: 7, goldAt: 12, rainbowAt: 20 });
  send(hub, 8);
  const hits = sent.map((m) => m.event);
  assert.deepEqual(hits.map((h) => h.tier), ['blue', 'blue', 'green', 'green', 'green', 'red', 'red']);
  assert.deepEqual(hits.map((h) => h.up), [true, false, true, false, false, true, false]);
});

test('AC-4 blueAt 未満は tier null で出さない', () => {
  const { hub, sent, combo } = setup({ blueAt: 3, greenAt: 4, redAt: 5, goldAt: 6, rainbowAt: 7 });
  send(hub, 2);
  assert.equal(sent.length, 0);
  assert.equal(combo.snapshot().active.length, 0);
  sec(1);
  hub.emit('event', gift());
  assert.equal(sent.at(-1).event.count, 3);
  assert.equal(sent.at(-1).event.tier, 'blue');
});

test('AC-5 hit の中身と、broadcast と emit が同じ形', () => {
  const { hub, sent, emitted } = setup({ seconds: 10 });
  const u = { id: 'u1', name: 'たろう', avatar: 'a.png', extra: 'x' };
  hub.emit('event', gift('Rose', 3, u));
  sec(2);
  hub.emit('event', gift('Lion', 100, u));
  const ev = sent[0].event;
  assert.deepEqual(ev.user, { id: 'u1', name: 'たろう', avatar: 'a.png' });
  assert.equal(ev.kind, 'hit');
  assert.equal(ev.count, 2);
  assert.equal(ev.total, 103);
  assert.equal(ev.coins, 100);
  assert.equal(ev.gift, 'Lion');
  assert.equal(ev.tier, 'blue');
  assert.equal(ev.up, true);
  assert.equal(ev.expiresAt, Date.now() + 10_000);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event.kind, 'hit');
  assert.deepEqual(emitted[0].snap, sent[0].combo);
  assert.equal(sent[0].test, undefined);
});

test('AC-5 seconds 秒たつと(画面がなくても)end を配る。ギフトのたびに延びる', () => {
  const { hub, sent, combo, kinds } = setup({ seconds: 10 });
  send(hub, 3, () => gift('Rose', 10), 8); // 8 秒おき
  sec(9);
  assert.deepEqual(kinds(), ['hit', 'hit']); // まだ切れていない
  sec(1.1);
  assert.deepEqual(kinds(), ['hit', 'hit', 'end']);
  const end = sent.at(-1).event;
  assert.equal(end.count, 3);
  assert.equal(end.total, 30);
  assert.equal(end.tier, 'green');
  assert.deepEqual(Object.keys(end.user).sort(), ['avatar', 'id', 'name']);
  assert.equal(combo.snapshot().active.length, 0);
  assert.equal(combo.snapshot().last.count, 3);
});

test('AC-5 ×1 だけ・blueAt 未満のコンボでは end を配らない', () => {
  const a = setup();
  a.hub.emit('event', gift());
  sec(30);
  assert.deepEqual(a.sent, []);
  const b = setup({ blueAt: 3, greenAt: 4, redAt: 5, goldAt: 6, rainbowAt: 7 });
  send(b.hub, 2);
  sec(30);
  assert.deepEqual(b.sent, []);
  assert.equal(b.combo.snapshot().last, null);
});

test('AC-6 snapshot の形。active は更新が新しい順で、出していないコンボは入れない', () => {
  const { hub, combo } = setup({ seconds: 10 });
  hub.emit('event', gift('Rose', 1, { id: 'a', name: 'A' }));
  hub.emit('event', gift('Rose', 1, { id: 'solo', name: 'S' })); // ×1 のまま
  sec(1);
  hub.emit('event', gift('Rose', 5, { id: 'a', name: 'A' }));
  hub.emit('event', gift('Rose', 1, { id: 'b', name: 'B' }));
  sec(1);
  hub.emit('event', gift('Rose', 1, { id: 'b', name: 'B' }));
  const s = combo.snapshot();
  assert.deepEqual(Object.keys(s).sort(), ['active', 'last', 'now', 'seconds']);
  assert.equal(s.now, Date.now());
  assert.equal(s.seconds, 10);
  assert.deepEqual(s.active.map((x) => x.user.id), ['b', 'a']);
  assert.deepEqual(Object.keys(s.active[1]).sort(), ['count', 'expiresAt', 'tier', 'total', 'user']);
  assert.equal(s.active[1].count, 2);
  assert.equal(s.active[1].total, 6);
  assert.equal(s.active[1].tier, 'blue');
  assert.equal(s.last, null);
});

test('AC-6 終わったあとの last の形', () => {
  const { hub, combo } = setup({ seconds: 5 });
  send(hub, 4);
  sec(6);
  const { last } = combo.snapshot();
  assert.deepEqual(Object.keys(last).sort(), ['count', 'endedAt', 'tier', 'total', 'user']);
  assert.equal(last.count, 4);
  assert.equal(last.tier, 'red');
  assert.ok(last.endedAt <= Date.now());
});

test('AC-7 配信中の test: true(testEvent)は本番の数に入れず、別の状態で test: true つきで配る', () => {
  const { hub, combo, sent, emitted } = setup();
  hub.status.mode = 'live';
  for (let i = 0; i < 6; i++) {
    hub.emit('testEvent', { ...gift(), test: true });
    sec(1);
  }
  assert.deepEqual(combo.snapshot().active, []);
  assert.equal(emitted.length, 0);
  const tested = sent.filter((m) => m.test === true);
  assert.ok(tested.length >= 1);
  assert.equal(tested.at(-1).type, 'combo');
  assert.equal(tested.at(-1).event.kind, 'hit');
  assert.equal(tested.at(-1).event.count, 6);
  assert.equal(sent.filter((m) => !m.test).length, 0);
  // 本番のギフトは数える
  hub.emit('event', gift());
  sec(1);
  hub.emit('event', gift());
  assert.equal(combo.snapshot().active[0].count, 2);
  assert.equal(emitted.length, 1);
});

test('AC-7 テスト用の状態は、同じ人でも本番の数に混ざらない', () => {
  const { hub, combo, sent } = setup();
  hub.status.mode = 'live';
  hub.emit('testEvent', { ...gift(), test: true });
  sec(1);
  hub.emit('testEvent', { ...gift(), test: true });
  hub.emit('event', gift());
  assert.equal(sent.filter((m) => !m.test).length, 0); // 本番は ×1 のまま
  assert.equal(combo.snapshot().active.length, 0);
});

test("AC-7 つなぐ前の 'event' はテストでも数える。reset で全部捨て、end は配らず空の snapshot だけ配る", () => {
  const { hub, combo, sent, emitted } = setup();
  hub.emit('event', { ...gift(), test: true });
  sec(1);
  hub.emit('event', { ...gift(), test: true });
  assert.equal(combo.snapshot().active.length, 1);
  sent.length = 0;
  emitted.length = 0;
  hub.emit('reset');
  assert.equal(combo.snapshot().active.length, 0);
  assert.equal(ends(sent).length, 0);
  assert.ok(sent.length >= 1);
  assert.deepEqual(sent.at(-1).combo.active, []);
  assert.equal(ends(emitted.map((x) => ({ event: x.event }))).length, 0);
  sec(60); // 捨てたあとにタイマーで end が出ない
  assert.equal(ends(sent).length, 0);
});

test('AC-8 enabled: false にすると数えず、動いているコンボは捨てる(end は配らない)', () => {
  const { hub, combo, sent } = setup();
  send(hub, 3);
  sent.length = 0;
  combo.setConfig({ ...defaultsFor('combo'), enabled: false });
  assert.equal(combo.snapshot().active.length, 0);
  assert.equal(ends(sent).length, 0);
  sec(1);
  hub.emit('event', gift());
  sec(1);
  hub.emit('event', gift());
  assert.equal(combo.snapshot().active.length, 0);
  sec(60);
  assert.equal(ends(sent).length, 0);
});

test('AC-8 設定を変えても、動いているコンボの expiresAt はそのまま。次のギフトから新しい seconds', () => {
  const { hub, combo, sent } = setup({ seconds: 10 });
  send(hub, 2);
  const before = combo.snapshot().active[0].expiresAt;
  combo.setConfig({ ...defaultsFor('combo'), seconds: 60 });
  assert.equal(combo.snapshot().active[0].expiresAt, before);
  sec(11); // 古い期限で切れる
  assert.equal(sent.at(-1).event.kind, 'end');
  send(hub, 2);
  assert.equal(combo.snapshot().active[0].expiresAt, Date.now() + 60_000);
});

test('AC-9 reset() は全部のコンボを捨て、end は配らない', () => {
  const { hub, combo, sent } = setup();
  send(hub, 3);
  sent.length = 0;
  combo.reset();
  assert.equal(combo.snapshot().active.length, 0);
  assert.equal(ends(sent).length, 0);
  sec(60);
  assert.equal(ends(sent).length, 0);
});
