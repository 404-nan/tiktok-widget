// おみくじの特定ギフトだけを11連にする設定と、前面の件数表示を確かめる。
// 11連は本番側のまとめ引き（個人の天井つき）へ移植した物で、個人の数えも11進むことを含む。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Gacha } from '../src/gacha.js';
import { SCHEMA, defaultsFor } from '../src/schema.js';

function setup(over = {}, random = () => 0.999) {
  const omikuji = new Gacha({ broadcast: () => {} }, { name: 'omikuji', random });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, displayMode: 'short', ...over });
  return omikuji;
}

const gift = (name, over = {}) => ({
  kind: 'gift',
  totalDiamonds: 10,
  gift: { id: name, name },
  user: { id: 'u1', name: 'ゆず' },
  ...over,
});

test('schema の elevenGifts の既定は空の並び', () => {
  assert.deepEqual(SCHEMA.omikuji.fields.elevenGifts.default, []);
  assert.deepEqual(defaultsFor('omikuji').elevenGifts, []);
});

test('elevenGifts のギフトは tenCount に関係なく11件になる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup({ elevenGifts: ['Galaxy'] });
  omikuji.onEvent(gift('Galaxy'));
  assert.equal(omikuji.snapshot().results.length, 11);
  assert.equal(omikuji.snapshot().durations.revealMs, 6600);
  omikuji.close();
});

test('tenCount=12 では elevenGifts は11件、tenGifts は12件になる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const eleven = setup({ tenCount: 12, elevenGifts: ['Galaxy'], tenGifts: ['Rose'] });
  eleven.onEvent(gift('Galaxy'));
  assert.equal(eleven.snapshot().results.length, 11);
  eleven.close();

  const ten = setup({ tenCount: 12, elevenGifts: ['Galaxy'], tenGifts: ['Rose'] });
  ten.onEvent(gift('Rose'));
  assert.equal(ten.snapshot().results.length, 12);
  ten.close();
});

test('同じギフトが elevenGifts と tenGifts の両方にあれば11件を優先する', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup({ tenCount: 12, elevenGifts: ['Galaxy'], tenGifts: ['Galaxy'] });
  omikuji.onEvent(gift('Galaxy'));
  assert.equal(omikuji.snapshot().results.length, 11);
  omikuji.close();
});

test('elevenGifts は通常ギフトの関門より先に判定する', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup({ gifts: ['Rosa'], minCoins: 999, elevenGifts: ['Galaxy'] });
  omikuji.onEvent(gift('Galaxy'));
  assert.equal(omikuji.snapshot().results.length, 11);
  omikuji.close();
});

test('本物の11連は天井を11進め、テストの11連は進めない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const real = setup({ pity: 100, elevenGifts: ['Galaxy'] });
  real.onEvent(gift('Galaxy'));
  assert.equal(real.pityCount, 11);
  real.close();

  const trial = setup({ pity: 100, elevenGifts: ['Galaxy'] });
  trial.onEvent(gift('Galaxy', { test: true }));
  assert.equal(trial.pityCount, 0);
  trial.close();
});

test('本物の11連は個人の天井も11進め、テストの11連は進めない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const real = setup({ pityPersonal: 100, elevenGifts: ['Galaxy'] });
  real.onEvent(gift('Galaxy'));
  assert.equal(real.pityUsers.get('id:u1'), 11);
  real.close();

  const trial = setup({ pityPersonal: 100, elevenGifts: ['Galaxy'] });
  trial.onEvent(gift('Galaxy', { test: true }));
  assert.equal(trial.pityUsers.has('id:u1'), false);
  trial.close();
});

test('待ち列に入った11連の引き継ぎは、そのまま11連へ届く', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup({ tenCount: 12 });
  omikuji.start({ kind: 'gift', user: { id: 'u1', name: 'ゆず' } });
  omikuji.start({ kind: 'ten', pullCount: 11, user: { id: 'u1', name: 'ゆず' } });
  assert.equal(omikuji.snapshot().pending, 1);
  // 最初の抽選が終わって待ち列の11連が始まるまで、細かく時間を進める（短い型の速さに合わせる）
  for (let i = 0; i < 100 && omikuji.phase !== 'ten'; i++) t.mock.timers.tick(100);
  assert.equal(omikuji.phase, 'ten');
  assert.equal(omikuji.snapshot().results.length, 11);
  omikuji.close();
});

const FRONT = fs.readFileSync(new URL('../public/widgets/gacha.js', import.meta.url), 'utf8');

function loadFront() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      id, textContent: '', hidden: true,
      style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {}, appendChild() {},
    });
    return elements.get(id);
  };
  let socket;
  const sandbox = {
    document: {
      body: { getAttribute: () => 'omikuji', classList: { add() {}, remove() {} } },
      getElementById: element,
      querySelector: () => null,
      createElement: () => ({ setAttribute() {}, appendChild() {}, style: {}, classList: { add() {} } }),
    },
    location: { pathname: '/widgets/omikuji.html', search: '', protocol: 'http:', host: 'localhost' },
    WebSocket: class { constructor() { socket = this; } },
    XMLHttpRequest: class { open() {} send() {} },
    setInterval: () => 0,
    clearInterval() {},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(new URL('../public/widgets/lib/replay-socket.js', import.meta.url), 'utf8'), sandbox);
  vm.runInNewContext(FRONT, sandbox);
  return { phase: element('phase'), who: element('drawWho'), send: (data) => socket.onmessage({ data: JSON.stringify(data) }) };
}

test('前面の段階表示と drawWho は結果の件数に追随する', () => {
  const front = loadFront();
  front.send({ type: 'omikuji', phase: 'ten', trigger: { user: { name: 'ゆず' } }, results: new Array(11).fill({}) });
  assert.equal(front.phase.textContent, '11連');
  assert.equal(front.who.textContent, 'ゆず さんの11連');
  front.send({ type: 'omikuji', phase: 'ten', trigger: { user: { name: 'ゆず' } }, results: new Array(10).fill({}) });
  assert.equal(front.phase.textContent, '10連');
  assert.equal(front.who.textContent, 'ゆず さんの10連');
});
