// おみくじの「いいね・シェアでも引ける」仕組み：個人の数えと権利、総いいね数の倍率、保存。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Gacha } from '../src/gacha.js';
import { StageQueue } from '../src/stage-queue.js';
import { defaultsFor } from '../src/schema.js';

function setup(over = {}, opts = {}) {
  const msgs = [];
  const hub = opts.hub ?? { broadcast: (m) => msgs.push(m) };
  const busEvents = [];
  const bus = { emit: (type, payload) => busEvents.push({ type, ...payload }) };
  const omikuji = new Gacha(hub, { name: 'omikuji', random: opts.random ?? (() => 0.999), bus, storeFile: opts.storeFile ?? null, stage: opts.stage ?? null, stageKey: 'local' });
  omikuji.setConfig({ ...defaultsFor('omikuji'), displayMode: 'short', tempo: 'quick', ...over });
  return { omikuji, msgs, busEvents, hub };
}

const like = (count, user = { id: 'u1', name: '一郎' }, extra = {}) => ({ kind: 'like', count, user, ...extra });
const share = (user = { id: 'u1', name: '一郎' }, extra = {}) => ({ kind: 'share', user, ...extra });

// 短い型の1回ぶん時間を進める（振る300 → 結果800（大吉は2550）→ 終了300）。
// 次の抽選が控えているときは、終わった瞬間に次が始まるので phase は idle にならない
function advance(t) {
  t.mock.timers.tick(300);
  t.mock.timers.tick(2600);
  t.mock.timers.tick(400);
}

function finishDraw(t, omikuji) {
  advance(t);
  assert.equal(omikuji.phase, 'idle');
}

const rollingCount = (msgs) => msgs.filter((m) => m.type === 'omikuji' && m.event === 'rolling').length;

test('初期値は全部無効（いいね・シェアでは引けず、倍率も掛からず、ゲージも出ない）', () => {
  const d = defaultsFor('omikuji');
  assert.equal(d.likeDrawEvery, 0);
  assert.equal(d.shareDrawEvery, 0);
  assert.equal(d.likeBoostTotal, 0);
  assert.equal(d.likeBoostTimes, 2);
  assert.equal(d.likeGauge, 'off');
});

test('いいねの数え：倍数に届くたび1回引け、端数は持ち越す', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, msgs } = setup({ likeDrawEvery: 100 });
  omikuji.onEvent(like(80));
  assert.equal(rollingCount(msgs), 0, '80ではまだ引けない');
  assert.equal(omikuji.snapshot().likeTotal, 80);
  omikuji.onEvent(like(30));
  assert.equal(rollingCount(msgs), 1, '合計110で1回引ける');
  finishDraw(t, omikuji);
  omikuji.onEvent(like(100));
  assert.equal(rollingCount(msgs), 2, '合計210で2回目が引ける（端数の10が効く）');
  finishDraw(t, omikuji);
  omikuji.onEvent(like(50));
  assert.equal(rollingCount(msgs), 2, '合計260ではまだ3回目は来ない');
  omikuji.close();
});

test('1回のいいねで複数回ぶん届いたら、届いた回数ぶん引ける', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, msgs } = setup({ likeDrawEvery: 100 });
  omikuji.onEvent(like(250));
  assert.equal(rollingCount(msgs), 1, '1回目はすぐ始まる');
  assert.equal(omikuji.snapshot().pending, 1, '2回目は待ちに入る');
  advance(t);
  assert.equal(rollingCount(msgs), 2, '終わったら2回目が始まる');
  finishDraw(t, omikuji);
  assert.equal(rollingCount(msgs), 2, '3回目は無い（250では2回まで）');
  omikuji.close();
});

test('シェアの数え：shareDrawEvery の倍数に届くたび1回引ける', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, msgs } = setup({ shareDrawEvery: 2 });
  omikuji.onEvent(share());
  assert.equal(rollingCount(msgs), 0);
  omikuji.onEvent(share());
  assert.equal(rollingCount(msgs), 1, '2回目のシェアで引ける');
  finishDraw(t, omikuji);
  omikuji.onEvent({ kind: 'share' }); // 送った人が分からないシェアは数えない
  omikuji.onEvent(share());
  assert.equal(rollingCount(msgs), 1, '数えは3のまま。次の1回はまだ来ない');
  omikuji.close();
});

test('テスト送信のいいね・シェアでは、数えも権利も動かない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, msgs } = setup({ likeDrawEvery: 1, shareDrawEvery: 1, likeBoostTotal: 10 });
  omikuji.onEvent(like(500, { id: 'u1', name: '一郎' }, { test: true }));
  omikuji.onEvent(share({ id: 'u1', name: '一郎' }, { test: true }));
  assert.equal(omikuji.snapshot().likeTotal, 0, '総いいね数も増えない');
  assert.equal(omikuji.snapshot().likeBoost, false);
  assert.equal(rollingCount(msgs), 0);
  omikuji.close();
});

test('送った人が分からないいいねは、総いいね数だけ進む（個人の抽選は来ない）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, msgs } = setup({ likeDrawEvery: 10, likeBoostTotal: 100 });
  omikuji.onEvent({ kind: 'like', count: 120 });
  assert.equal(omikuji.snapshot().likeTotal, 120);
  assert.equal(omikuji.snapshot().likeBoost, true, '総いいね数の的には届く');
  assert.equal(rollingCount(msgs), 0, '誰の抽選か決められないので引かない');
  omikuji.close();
});

test('いいねで引けた回も、天井の数えはギフトと同じく進む', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ likeDrawEvery: 10, pity: 2 });
  omikuji.onEvent(like(10));
  finishDraw(t, omikuji);
  assert.equal(omikuji.snapshot().pityCount, 1);
  omikuji.onEvent(like(10));
  finishDraw(t, omikuji);
  assert.equal(omikuji.snapshot().pityCount, 2);
  omikuji.onEvent(like(10));
  assert.equal(omikuji.tier?.id, 'daikichi', '3回目は天井で大吉が確定する');
  assert.equal(omikuji.forced, true);
  finishDraw(t, omikuji);
  omikuji.close();
});

test('総いいね数が的に届くと、その後の抽選だけ大吉の重みに倍率が掛かる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = [
    { id: 'daikichi', label: '大吉', weight: 10, pity: true },
    { id: 'kichi', label: '吉', weight: 90, pity: false },
  ];
  // 倍率なし: 重み10/合計100、乱数0.1005 → 10.05 は大吉の枠（10）を超えて吉
  const before = setup({ tiers, likeBoostTotal: 100, likeBoostTimes: 2 }, { random: () => 0.1005 });
  before.omikuji.start({ kind: 'gift', user: { id: 'u9', name: '九郎' } });
  assert.equal(before.omikuji.tier?.id, 'kichi');
  before.omikuji.close();

  const after = setup({ tiers, likeBoostTotal: 100, likeBoostTimes: 2 }, { random: () => 0.1005 });
  after.omikuji.onEvent(like(100, { id: 'ux', name: '誰か' }));
  assert.equal(after.omikuji.snapshot().likeBoost, true);
  after.omikuji.start({ kind: 'gift', user: { id: 'u9', name: '九郎' } });
  // 倍率2倍: 大吉の重み20/合計110、乱数0.1005 → 11.05 は大吉の枠（20）の中
  assert.equal(after.omikuji.tier?.id, 'daikichi', '倍率が掛かると大吉になる');
  after.omikuji.close();
});

test('倍率は確率上昇（luckBoost）の％のあとに掛かる（順番が固定）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = [
    { id: 'daikichi', label: '大吉', weight: 10, pity: true },
    { id: 'kichi', label: '吉', weight: 90, pity: false },
  ];
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  hub.gifters = new Map([['u1', { diamonds: 100 }]]);
  const base = { tiers, luckBoost: true, luckUnitCoins: 100, luckStepPct: 10, luckMaxSteps: 3, likeBoostTimes: 2 };
  // luck だけ（倍率の的には未達）: 重み11/合計101、乱数0.15 → 15.15 は大吉の枠（11）を超えて吉
  const luckOnly = setup({ ...base, likeBoostTotal: 50 }, { hub, random: () => 0.15 });
  luckOnly.omikuji.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(luckOnly.omikuji.tier?.id, 'kichi', 'luck の％だけでは届かない');
  luckOnly.omikuji.close();
  // luck × 倍率: （1＋10％）× 2倍 ＝ 重み22/合計112、乱数0.15 → 16.8 は大吉の枠（22）の中
  const both = setup({ ...base, likeBoostTotal: 50 }, { hub, random: () => 0.15 });
  both.omikuji.onEvent(like(50, { id: 'ux', name: '誰か' }));
  both.omikuji.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(both.omikuji.tier?.id, 'daikichi', '％のあとに倍率が掛かると大吉になる');
  both.omikuji.close();
});

test('大吉の重みが 0 なら、倍率が掛かっても出ない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = [
    { id: 'daikichi', label: '大吉', weight: 0, pity: true },
    { id: 'kichi', label: '吉', weight: 100, pity: false },
  ];
  const { omikuji } = setup({ tiers, likeBoostTotal: 10, likeBoostTimes: 5 }, { random: () => 0 });
  omikuji.onEvent(like(10, { id: 'ux', name: '誰か' }));
  assert.equal(omikuji.snapshot().likeBoost, true);
  omikuji.start({ kind: 'gift', user: { id: 'u1', name: '一郎' } });
  assert.equal(omikuji.tier?.id, 'kichi');
  omikuji.close();
});

test('数えと渡した回数は保存され、作り直しても二重に渡らない。版2の保存も読める', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'like-store-'));
  const file = path.join(dir, 'omikuji-pity.json');
  const first = setup({ likeDrawEvery: 100 }, { storeFile: file });
  first.omikuji.onEvent(like(80));
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 4);
  assert.equal(saved.likeTotal, 80);
  assert.equal(saved.likeUsers['id:u1'].likes, 80);
  first.omikuji.close();

  const second = setup({ likeDrawEvery: 100 }, { storeFile: file });
  assert.equal(second.omikuji.snapshot().likeTotal, 80, '総いいね数が続きから数わる');
  second.omikuji.onEvent(like(30));
  assert.equal(second.omikuji.phase, 'rolling', '合計110で1回だけ引ける');
  finishDraw(t, second.omikuji);
  second.omikuji.onEvent(like(10));
  assert.equal(second.omikuji.phase, 'idle', '渡した回数が保存されているので、二重には渡らない');
  second.omikuji.close();

  fs.writeFileSync(file, `${JSON.stringify({ version: 2, pityCount: 1, pityUsers: {} })}\n`);
  const third = setup({}, { storeFile: file });
  assert.equal(third.omikuji.snapshot().pityCount, 1, '版2の天井の数えはそのまま読める');
  assert.equal(third.omikuji.snapshot().likeTotal, 0, 'いいねの数えは 0 から');
  third.omikuji.close();
});

test('順番待ちがいっぱいの分は権利として保持し、空いたら古い順に消化する。保持の上限を超えた分は記録に残して捨てる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const stage = new StageQueue();
  stage.acquire('local', 'cardDraw'); // 大きな演出が舞台を使っている
  const { omikuji, busEvents } = setup({ likeDrawEvery: 10, stageQueue: true, stageQueueMax: 2 }, { stage });
  for (let i = 0; i < 5; i++) omikuji.onEvent(like(10));
  assert.equal(omikuji.snapshot().stagePending, 2, '順番待ちには上限の2件');
  assert.equal(omikuji.snapshot().likeHeld, 2, '入らなかった2件は権利として保持');
  assert.equal(busEvents.filter((e) => e.type === 'omikuji.like-dropped').length, 1, '保持の上限（1人あたり2件）を超えた1件は記録に残る');
  stage.release('local', 'cardDraw');
  for (let i = 0; i < 3; i++) advance(t);
  finishDraw(t, omikuji);
  assert.equal(omikuji.seq, 4, '順番待ち2件＋保持2件が全部引けた');
  assert.equal(omikuji.snapshot().likeHeld, 0);
  omikuji.close();
});

test('保持した権利は保存され、作り直しても（再起動）消えずに古い順に消化される。二重には渡らない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'like-store-'));
  const file = path.join(dir, 'omikuji-pity.json');
  const u2 = { id: 'u2', name: '二郎' };
  const u3 = { id: 'u3', name: '三郎' };
  const stage1 = new StageQueue();
  stage1.acquire('local', 'cardDraw'); // 大きな演出が舞台を使っている
  const first = setup({ likeDrawEvery: 10, stageQueue: true, stageQueueMax: 2 }, { storeFile: file, stage: stage1 });
  first.omikuji.onEvent(like(10)); // 一郎：順番待ちへ
  first.omikuji.onEvent(like(10, u2)); // 二郎：順番待ちへ（上限2でいっぱい）
  first.omikuji.onEvent(like(10, u3)); // 三郎：入らず権利として保持
  first.omikuji.onEvent(like(10)); // 一郎：保持の後ろに並ぶ
  assert.equal(first.omikuji.snapshot().stagePending, 2);
  assert.equal(first.omikuji.snapshot().likeHeld, 2);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 4);
  assert.deepEqual(saved.likeHeld.map((h) => h.user.id), ['u3', 'u1'], '未消化の権利が古い順に保存される');
  first.omikuji.close();

  // 作り直し（再起動）。舞台はまだ使われている想定で、保持した権利だけが戻る（順番待ちは従来どおり戻らない）
  const stage2 = new StageQueue();
  stage2.acquire('local', 'cardDraw');
  const second = setup({ likeDrawEvery: 10, stageQueue: true, stageQueueMax: 2 }, { storeFile: file, stage: stage2 });
  assert.equal(second.omikuji.snapshot().likeHeld, 1, '先頭の1件は順番待ちへ移り、残り1件は保持のまま');
  assert.equal(second.omikuji.snapshot().stagePending, 1);
  stage2.release('local', 'cardDraw');
  advance(t);
  finishDraw(t, second.omikuji);
  const order = second.msgs.filter((m) => m.type === 'omikuji' && m.event === 'rolling').map((m) => m.trigger?.user?.id);
  assert.deepEqual(order, ['u3', 'u1'], '保持した権利が古い順に消化される');
  assert.equal(second.omikuji.snapshot().likeHeld, 0);
  const savedAfter = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(savedAfter.likeHeld, [], '消化した権利は保存からも消える');
  second.omikuji.close();

  // もう一度作り直しても、渡し直しは起きない
  const third = setup({ likeDrawEvery: 10, stageQueue: true, stageQueueMax: 2 }, { storeFile: file });
  assert.equal(third.omikuji.snapshot().likeHeld, 0);
  assert.equal(third.omikuji.seq, 0, '再起動のたびに権利が渡り直されることはない');
  assert.equal(third.omikuji.phase, 'idle');
  third.omikuji.close();
});

test('版3の保存（未消化の権利なし）もそのまま読める', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'like-store-'));
  const file = path.join(dir, 'omikuji-pity.json');
  fs.writeFileSync(file, `${JSON.stringify({
    version: 3, pityCount: 0, pityUsers: {}, likeTotal: 80,
    likeUsers: { 'id:u1': { likes: 80, shares: 0, likeGiven: 0, shareGiven: 0 } },
  })}\n`);
  const { omikuji } = setup({ likeDrawEvery: 100 }, { storeFile: file });
  assert.equal(omikuji.snapshot().likeTotal, 80, '版3の数えはそのまま続く');
  assert.equal(omikuji.snapshot().likeHeld, 0, '権利は空から');
  omikuji.onEvent(like(30));
  assert.equal(omikuji.phase, 'rolling', '合計110で1回引ける');
  finishDraw(t, omikuji);
  omikuji.close();
});

test('いいねで貯めた分は、まとめ引き（tenBatch）に混ざらない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, msgs } = setup({ likeDrawEvery: 10, tenBatch: true, tenCount: 2, minCoins: 1 });
  omikuji.onEvent({ kind: 'gift', totalDiamonds: 1, gift: { id: '1', name: 'Rose' }, user: { id: 'u9', name: '九郎' } });
  assert.equal(omikuji.phase, 'rolling', 'ギフトの抽選が進行中');
  omikuji.onEvent(like(20)); // 進行中に2回ぶん貯まる
  assert.equal(omikuji.snapshot().pending, 2);
  advance(t);
  assert.equal(omikuji.phase, 'rolling', '次の1回が単発で始まる');
  assert.equal(omikuji.tenResults, null, 'まとめ引きにはなっていない');
  advance(t);
  assert.equal(omikuji.phase, 'rolling', 'もう1回も単発で始まる');
  assert.equal(msgs.filter((m) => m.event === 'ten').length, 0);
  finishDraw(t, omikuji);
  omikuji.close();
});

test('配信が終わると、いいね・シェアの数えと総いいね数は 0 に戻る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const { omikuji } = setup({ likeBoostTotal: 100 }, { hub });
  hub.emit('status', { mode: 'live' });
  omikuji.onEvent(like(50, { id: 'ux', name: '誰か' }));
  assert.equal(omikuji.snapshot().likeTotal, 50);
  hub.emit('status', { mode: 'ended' });
  assert.equal(omikuji.snapshot().likeTotal, 0);
  omikuji.close();
});
