// テスト送信の線引き（2026-11-07 確定）の合格条件：
// ・テスト発火（/api/simulate）は本番でも所有者だけに開け、配信画面用の鍵（obs）には開けない。
// ・開発用口（/api/dev/trigger）は開発限定のまま。
// ・本番の画面から叩いていた3件（おみくじ開始／ガチャ視聴者テスト／ギフト音の試聴）は
//   本番向けの操作口（/api/control）へ付け替え、本番でも所有者が使える。
// ・テストは本番の記録・数を変えない（視聴者の保存記録、WIN数、ボスの体力、抽選の天井回数）。
// ・テストの開始は本物の抽選が進行中なら待ち列に入らず断られ、本物の順番を変えない。
// ・テストギフトはスロットの払い出し動作へ届かない（配信前・配信中とも）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { defaultsFor } from '../src/schema.js';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listen(runtime, role) {
  const app = express();
  app.use(express.json());
  if (role) app.use((req, _res, next) => { req.role = role; next(); });
  app.use(runtime.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function close(server, runtime) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await runtime.close();
}

const postJson = (port, url, body) => fetch(`http://127.0.0.1:${port}${url}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const getJson = async (port, url) => (await fetch(`http://127.0.0.1:${port}${url}`)).json();

async function waitIdle(port, url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snap = await getJson(port, url);
    if (snap?.phase === 'idle' && (snap?.pending ?? 0) === 0) return snap;
    if (Date.now() > deadline) throw new Error(`${url} が idle に戻らない`);
    await sleep(150);
  }
}

function prodEnv(t) {
  const before = process.env.TW_ENV;
  const beforePort = process.env.PORT;
  delete process.env.TW_ENV;
  delete process.env.PORT;
  t.after(() => {
    if (before === undefined) delete process.env.TW_ENV; else process.env.TW_ENV = before;
    if (beforePort === undefined) delete process.env.PORT; else process.env.PORT = beforePort;
  });
}

test('テスト発火は本番でも所有者に開き、配信画面用の鍵には開けない', async (t) => {
  prodEnv(t);
  const dir = tmp('tw-test-send-line-');
  const gift = { kind: 'gift', senderName: 'テストさん', giftName: 'Rose', count: 1 };

  const ownerRuntime = createRuntime({ id: 'owner', store: createStore(path.join(dir, 'owner.yaml')), dataDir: path.join(dir, 'owner'), mediaDirs: [dir] });
  const owner = await listen(ownerRuntime, 'owner');
  try {
    const res = await postJson(owner.port, '/api/simulate', gift);
    assert.equal(res.status, 200, '本番でも所有者はテスト発火できる');
    assert.equal(ownerRuntime.hub.recent.at(-1)?.user.name, 'テストさん');
    assert.equal(ownerRuntime.hub.recent.at(-1)?.test, true, 'テストの印が付く');
  } finally {
    await close(owner.server, ownerRuntime);
  }

  // 役割なし（1人用の画面）は /api/me と同じく所有者として扱う
  const localRuntime = createRuntime({ id: 'local', store: createStore(path.join(dir, 'local.yaml')), dataDir: path.join(dir, 'local'), mediaDirs: [dir] });
  const local = await listen(localRuntime);
  try {
    assert.equal((await postJson(local.port, '/api/simulate', gift)).status, 200);
  } finally {
    await close(local.server, localRuntime);
  }

  const obsRuntime = createRuntime({ id: 'obs', store: createStore(path.join(dir, 'obs.yaml')), dataDir: path.join(dir, 'obs'), mediaDirs: [dir] });
  const obs = await listen(obsRuntime, 'obs');
  try {
    const res = await postJson(obs.port, '/api/simulate', gift);
    assert.equal(res.status, 403, '配信画面用の鍵ではテスト発火できない');
    assert.equal(obsRuntime.hub.recent.length, 0, '届いていない');
  } finally {
    await close(obs.server, obsRuntime);
  }
});

test('本番向け操作口で3件が本番でも動き、テストは本番の記録・数を変えない。開発用口は本番で閉じたまま', async (t) => {
  prodEnv(t);
  const dir = tmp('tw-test-send-control-');
  const runtime = createRuntime({ id: 'test', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  try {
    // おみくじは「当たると WIN数が増える」設定にしておく（テストで実行されたら数が変わって検出できる）
    const omikujiTiers = defaultsFor('omikuji').tiers.map((tier) => ({ ...tier, actions: [{ type: 'wins.add', id: 'default', n: 3 }] }));
    const omikujiSet = runtime.setConfig(['omikuji'], {
      ...defaultsFor('omikuji'), enabled: true, pickMode: 'random', displayMode: 'short', rollMs: 20, revealMs: 20, doneMs: 10, tiers: omikujiTiers,
    });
    assert.equal(omikujiSet.ok, true, (omikujiSet.errors || []).join('\n'));
    // ガチャも「当たると WIN数が増える」等級にしておく（テスト回しで等級の動作が実行されたら検出できる）
    const gachaSet = runtime.setConfig(['gacha'], {
      ...defaultsFor('gacha'), enabled: true, rollMs: 20, revealMs: 20, doneMs: 10, cooldownSec: 0,
      tiers: [{ id: 'common', label: 'あたり', weight: 1, pity: false, actions: [{ type: 'wins.add', id: 'default', n: 3 }] }],
    });
    assert.equal(gachaSet.ok, true, (gachaSet.errors || []).join('\n'));

    // ギフト音の試聴：音声を1つ置いてから鳴らす
    const wav = Buffer.alloc(44 + 8, 0);
    wav.write('RIFF', 0); wav.write('WAVE', 8);
    const uploaded = await fetch(`http://127.0.0.1:${port}/api/media-alerts?name=ベル.wav`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
    });
    assert.equal(uploaded.status, 200);
    const mediaId = (await uploaded.json()).item.id;

    const played = await postJson(port, '/api/control', { target: 'gift-sound', action: 'play', data: { mediaId, volume: 80, count: 2 } });
    assert.equal(played.status, 200);
    const playedBody = await played.json();
    assert.equal(playedBody.ok, true);
    assert.equal(playedBody.sounds.length, 2);
    const tooMany = await postJson(port, '/api/control', { target: 'gift-sound', action: 'play', data: { mediaId, count: 5 } });
    assert.equal(tooMany.status, 400);
    const missing = await postJson(port, '/api/control', { target: 'gift-sound', action: 'play', data: { mediaId: 'none' } });
    assert.equal(missing.status, 400);

    // おみくじ開始：画面の状態は進むが、設定済みの動作（WIN数）は実行されない
    const winsBefore = runtime.readWins().default.wins;
    const omikuji = await postJson(port, '/api/control', { target: 'omikuji', action: 'start', data: { user: 'テスト視聴者' } });
    assert.equal(omikuji.status, 200);
    const omikujiBody = await omikuji.json();
    assert.equal(omikujiBody.ok, true);
    assert.notEqual(omikujiBody.omikuji.phase, 'idle');
    await waitIdle(port, '/api/omikuji');
    assert.equal(runtime.readWins().default.wins, winsBefore, 'テスト開始で WIN数は変わらない');

    // ガチャ視聴者テスト：結果は返るが、本物の視聴者記録には残らない（無料・有料とも）
    for (const paid of [false, true]) {
      const spin = await postJson(port, '/api/control', { target: 'gacha-viewer', action: 'spin', data: { name: 'テスト視聴者', paid } });
      assert.equal(spin.status, 200);
      const spinBody = await spin.json();
      assert.equal(spinBody.ok, true);
      assert.equal(spinBody.gacha.viewer.name, 'テスト視聴者', '結果は画面確認用に返る');
      assert.equal(spinBody.gacha.cost, paid ? 'paid' : 'free');
      assert.ok(!(spinBody.viewers ?? []).some((v) => v.name === 'テスト視聴者'), 'テスト視聴者は本物の一覧に入らない');
      await waitIdle(port, '/api/gacha');
    }
    assert.equal(runtime.readWins().default.wins, winsBefore, 'テスト回しで等級の動作（WIN数）は実行されない');

    // 開発用口は本番では3件とも閉じたまま
    for (const body of [
      { target: 'omikuji', user: 'テスト視聴者' },
      { target: 'gacha-viewer', name: 'テスト視聴者', paid: false },
      { target: 'gift-sound', mediaId, count: 1 },
    ]) {
      const denied = await postJson(port, '/api/dev/trigger', body);
      assert.equal(denied.status, 403, `開発用口は本番で閉じている: ${body.target}`);
    }
  } finally {
    await close(server, runtime);
  }
  // 保存ファイルにもテスト視聴者は残っていない
  const savedFile = path.join(dir, 'gacha-viewers.json');
  const saved = fs.existsSync(savedFile) ? JSON.parse(fs.readFileSync(savedFile, 'utf8')) : {};
  assert.deepEqual(Object.keys(saved), [], '視聴者の保存記録にテストの人が残らない');
});

test('ダッシュボードの画面は開発用口を叩かず、本番向け操作口を使う', () => {
  const read = (rel) => fs.readFileSync(path.resolve(import.meta.dirname, '..', rel), 'utf8');
  for (const rel of ['public/dashboard/editor-preview.js', 'public/dashboard/gacha-viewers-form.js', 'public/dashboard/gift-sounds-form.js']) {
    assert.ok(!read(rel).includes('/api/dev/trigger'), `${rel} が開発用口を叩いている`);
    assert.ok(read(rel).includes('/api/control'), `${rel} が本番向け操作口を使っていない`);
  }
  // 開発専用の結線（dev-features）は開発用口のまま（線引きの対象外）
  assert.ok(read('public/dashboard/dev-features.js').includes('/api/dev/trigger'));
});

test('既存の視聴者記録と抽選の状態はテストで変わらず、進行中のテスト開始は断られる', async (t) => {
  prodEnv(t);
  const dir = tmp('tw-test-send-state-');
  const runtime = createRuntime({ id: 'state', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  try {
    const tiers = [
      { id: 'common', label: 'あたり', weight: 1, pity: false, actions: [{ type: 'wins.add', id: 'default', n: 3 }] },
    ];
    const gachaSet = runtime.setConfig(['gacha'], {
      ...defaultsFor('gacha'), enabled: true, rollMs: 20, revealMs: 20, doneMs: 10, cooldownSec: 0, pity: 5, tiers,
    });
    assert.equal(gachaSet.ok, true, (gachaSet.errors || []).join('\n'));

    // 本物の視聴者が1回回した状態を作る（記録と天井回数が残る）
    runtime.hub.publish({ kind: 'chat', text: '!ガチャ', user: { id: 'real1', name: '本物さん' } });
    await waitIdle(port, '/api/gacha');
    await sleep(400); // 保存の遅延書き込みを終わらせる
    const viewersFile = path.join(dir, 'gacha-viewers.json');
    const fileBefore = fs.readFileSync(viewersFile, 'utf8');
    assert.equal((await getJson(port, '/api/gacha-viewers')).total, 1);
    assert.equal((await getJson(port, '/api/gacha')).pityCount, 1, '本物の抽選で天井回数が1つ進む');

    // テスト回し（無料・有料）：記録も天井回数も変わらない
    for (const paid of [false, true]) {
      const spin = await postJson(port, '/api/control', { target: 'gacha-viewer', action: 'spin', data: { name: 'テスト視聴者', paid } });
      assert.equal(spin.status, 200);
      await waitIdle(port, '/api/gacha');
    }
    await sleep(400);
    assert.equal(fs.readFileSync(viewersFile, 'utf8'), fileBefore, '既存の視聴者記録はテストで変わらない');
    assert.equal((await getJson(port, '/api/gacha-viewers')).total, 1);
    assert.equal((await getJson(port, '/api/gacha')).pityCount, 1, 'テスト回しで天井回数は進まない');

    // 進行中のガチャへテスト回しを入れない（待ち列に積まない）
    const slowSet = runtime.setConfig(['gacha'], {
      ...defaultsFor('gacha'), enabled: true, rollMs: 3000, revealMs: 20, doneMs: 10, cooldownSec: 0, pity: 5, tiers,
    });
    assert.equal(slowSet.ok, true);
    const seqBeforeBusy = (await getJson(port, '/api/gacha')).seq;
    runtime.hub.publish({ kind: 'chat', text: '!ガチャ', user: { id: 'real2', name: '本物2' } });
    await sleep(200);
    const busySpin = await postJson(port, '/api/control', { target: 'gacha-viewer', action: 'spin', data: { name: 'テスト視聴者', paid: false } });
    assert.equal(busySpin.status, 400, '進行中のテスト回しは断られる');
    assert.match((await busySpin.json()).error ?? '', /進行中/);
    const duringBusy = await getJson(port, '/api/gacha');
    assert.equal(duringBusy.pending, 0, 'テスト回しは待ち列に入らない');
    assert.equal(duringBusy.seq, seqBeforeBusy + 1, '進むのは本物の抽選だけ');
    await waitIdle(port, '/api/gacha');

    // 進行中のおみくじへテスト開始を入れない
    const omikujiSet = runtime.setConfig(['omikuji'], { ...defaultsFor('omikuji'), enabled: true, pickMode: 'random', tempo: 'slow' });
    assert.equal(omikujiSet.ok, true, (omikujiSet.errors || []).join('\n'));
    const omiBefore = await getJson(port, '/api/omikuji');
    process.env.TW_ENV = 'dev';
    process.env.PORT = '3940';
    try {
      const realStart = await postJson(port, '/api/dev/trigger', { target: 'omikuji', user: '本物' });
      assert.equal(realStart.status, 200);
    } finally {
      delete process.env.TW_ENV;
      delete process.env.PORT;
    }
    const busyOmi = await postJson(port, '/api/control', { target: 'omikuji', action: 'start', data: { user: 'テスト視聴者' } });
    assert.equal(busyOmi.status, 400, '進行中のテスト開始は断られる');
    assert.match((await busyOmi.json()).error ?? '', /進行中/);
    const omiAfter = await waitIdle(port, '/api/omikuji');
    assert.equal(omiAfter.seq, omiBefore.seq + 1, '開発用の開始でも抽選は1回回る');
    // 開発用の開始もテスト扱い（2026-11-10 の整合）：画面では回るが、天井回数は進まない
    assert.equal(omiAfter.pityCount, omiBefore.pityCount, '開発用の開始で天井回数は進まない');
  } finally {
    await close(server, runtime);
  }
});

test('テストギフトはスロットの動作とボスへ届かない（配信前・配信中とも）', async (t) => {
  prodEnv(t);
  const dir = tmp('tw-test-send-slot-');
  const runtime = createRuntime({ id: 'slot', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  try {
    const slotSet = runtime.setConfig(['slots'], {
      ...defaultsFor('slots'), enabled: true, trigger: { gifts: ['Rose'], minCoins: 0 }, reelStopMs: 100,
      payouts: [{ id: 'win', text: '当たり', tier: 'small', weight: 1, symbols: ['ベル', 'ベル', 'ベル'], actions: [{ type: 'wins.add', id: 'default', n: 5 }] }],
    });
    assert.equal(slotSet.ok, true, (slotSet.errors || []).join('\n'));
    const bossSnap = async () => {
      const snap = await getJson(port, '/api/boss');
      for (const boss of Object.values(snap)) delete boss.now;
      return JSON.stringify(snap);
    };
    const bossBefore = await bossSnap();
    const gift = { kind: 'gift', senderName: 'テストさん', giftName: 'Rose', count: 1 };

    // 配信前：テストギフトは通常のイベント経路に流れるが、スロットの動作もボスの体力も変えない
    const sent = await postJson(port, '/api/simulate', gift);
    assert.equal(sent.status, 200);
    await waitIdle(port, '/api/slot'); // 画面確認のために回るのはよい。終わるまで待つ
    assert.equal(runtime.readWins().default.wins, 0, 'テストギフトでスロットの動作（WIN数）は実行されない');
    assert.equal(await bossSnap(), bossBefore, 'テストギフトでボスは削れない');

    // 配信中：テストギフトは仕組み側へ渡らない
    runtime.hub.setStatus({ mode: 'live' });
    const sentLive = await postJson(port, '/api/simulate', gift);
    assert.equal(sentLive.status, 200);
    await sleep(800);
    assert.equal(runtime.readWins().default.wins, 0);
    assert.equal(await bossSnap(), bossBefore);
    assert.equal((await getJson(port, '/api/slot')).phase, 'idle', '配信中のテストでスロットは回らない');
  } finally {
    await close(server, runtime);
  }
});

test('テスト進行中に本物が来たら、テストは打ち切られて本物が先に通る', async (t) => {
  prodEnv(t);
  const dir = tmp('tw-test-send-reverse-');
  const runtime = createRuntime({ id: 'reverse', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  try {
    // おみくじ：テスト開始の直後に本物の開始を入れると、本物が割り込む
    const omikujiDefaults = defaultsFor('omikuji');
    // 天井の数えだけを見るので、大吉が偶然出て数えが戻らないようにする
    const omikujiTiers = omikujiDefaults.tiers.map((tier) => tier.id === 'daikichi' ? { ...tier, weight: 0 } : tier);
    const omikujiSet = runtime.setConfig(['omikuji'], { ...omikujiDefaults, enabled: true, pickMode: 'random', tempo: 'slow', tiers: omikujiTiers });
    assert.equal(omikujiSet.ok, true, (omikujiSet.errors || []).join('\n'));
    const omiBefore = await getJson(port, '/api/omikuji');
    const testStart = await postJson(port, '/api/control', { target: 'omikuji', action: 'start', data: { user: 'テスト視聴者' } });
    assert.equal(testStart.status, 200);
    const testSeq = (await testStart.json()).omikuji.seq;
    // 本物の開始は本物のギフトで入れる。開発用の開始（/api/dev/trigger）もテスト扱いに
    // なったため（2026-11-10、プレビューで発火させない直しの整合）、割り込みの役は担わない
    runtime.hub.publish({ kind: 'gift', gift: { name: 'Rose', id: 'rose' }, totalDiamonds: 1, user: { id: 'real-omi', name: '本物' } });
    await sleep(100);
    const during = await getJson(port, '/api/omikuji');
    assert.equal(during.seq, testSeq + 1, '本物の開始がテストを打ち切って始まる');
    assert.equal(during.pending, 0, '本物はテストの後ろに並ばない');
    assert.equal(during.trigger?.kind, 'gift', '進行中なのは本物の抽選');
    const omiAfter = await waitIdle(port, '/api/omikuji');
    assert.equal(omiAfter.pityCount, omiBefore.pityCount + 1, '天井回数は本物の分だけ進む');

    // ガチャ：テスト回しの直後に本物のコメントが来ると、本物が割り込む
    const tiers = [
      { id: 'common', label: 'あたり', weight: 1, pity: false, actions: [] },
    ];
    const gachaSet = runtime.setConfig(['gacha'], {
      ...defaultsFor('gacha'), enabled: true, rollMs: 3000, revealMs: 20, doneMs: 10, cooldownSec: 0, pity: 5, tiers,
    });
    assert.equal(gachaSet.ok, true);
    const pityBefore = (await getJson(port, '/api/gacha')).pityCount;
    const spin = await postJson(port, '/api/control', { target: 'gacha-viewer', action: 'spin', data: { name: 'テスト視聴者', paid: false } });
    assert.equal(spin.status, 200);
    const gachaTestSeq = (await getJson(port, '/api/gacha')).seq;
    runtime.hub.publish({ kind: 'chat', text: '!ガチャ', user: { id: 'real7', name: '本物さん' } });
    await sleep(200);
    const gachaDuring = await getJson(port, '/api/gacha');
    assert.equal(gachaDuring.seq, gachaTestSeq + 1, '本物のガチャがテストを打ち切って始まる');
    assert.equal(gachaDuring.pending, 0);
    await waitIdle(port, '/api/gacha');
    assert.equal((await getJson(port, '/api/gacha')).pityCount, pityBefore + 1, '天井回数は本物の分だけ進む');
    const viewers = await getJson(port, '/api/gacha-viewers');
    assert.equal(viewers.total, 1);
    assert.equal(viewers.viewers[0].name, '本物さん');

    // スロット：テストで回っている最中に本物のギフトが来ると、本物が割り込む
    const slotSet = runtime.setConfig(['slots'], {
      ...defaultsFor('slots'), enabled: true, trigger: { gifts: ['Rose'], minCoins: 0 }, reelStopMs: 3000,
      payouts: [{ id: 'win', text: '当たり', tier: 'small', weight: 1, symbols: ['ベル', 'ベル', 'ベル'], actions: [] }],
    });
    assert.equal(slotSet.ok, true);
    const slotTest = await postJson(port, '/api/simulate', { kind: 'gift', senderName: 'テストさん', giftName: 'Rose', count: 1 });
    assert.equal(slotTest.status, 200);
    await sleep(200);
    const slotTestSeq = (await getJson(port, '/api/slot')).seq;
    runtime.hub.publish({ kind: 'gift', gift: { name: 'Rose', id: 'rose' }, totalDiamonds: 1, user: { id: 'real8', name: '本物さん' } });
    await sleep(200);
    const slotDuring = await getJson(port, '/api/slot');
    assert.equal(slotDuring.seq, slotTestSeq + 1, '本物のスロットがテストを打ち切って始まる');
    assert.equal(slotDuring.pending, 0);
    assert.notEqual(slotDuring.trigger?.test, true, '進行中なのは本物の回転');
    await waitIdle(port, '/api/slot', 30000);
  } finally {
    await close(server, runtime);
  }
});

test('テストは RUSH・応援・投票・押しボタンの状態と動作に混ざらず、保存ファイルも変わらない', async (t) => {
  prodEnv(t);
  const dir = tmp('tw-test-send-engines-');
  const runtime = createRuntime({ id: 'engines', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  const control = (target, action, data) => postJson(port, '/api/control', { target, action, data });
  try {
    assert.equal(runtime.setConfig(['rush'], { ...defaultsFor('rush'), enabled: true, gifts: ['Rose'], enterCoins: 0 }).ok, true);
    assert.equal(runtime.setConfig(['cheers'], { default: { ...defaultsFor('cheers'), goal: 1, loop: false, fullActions: [{ type: 'wins.add', id: 'default', n: 4 }] } }).ok, true);
    assert.equal(runtime.setConfig(['votes'], { default: { ...defaultsFor('votes'), options: ['A', 'B'], durationSeconds: 60, resultActions: [{ type: 'wins.add', id: 'default', n: 2 }] } }).ok, true);
    assert.equal(runtime.setConfig(['pushButtons'], { default: { ...defaultsFor('pushButtons'), keyword: '押', seconds: 30, steps: [1, 10, 30, 100], blueActions: [{ type: 'wins.add', id: 'default', n: 2 }] } }).ok, true);
    assert.equal((await control('vote', 'start')).status, 200);
    assert.equal((await control('push', 'start')).status, 200);

    // 起動直後の初期保存が落ち着いてから写しを取る（ボスの保存ファイルは少し遅れて作られる）
    for (let i = 0; i < 30 && !fs.existsSync(path.join(dir, 'boss.json')); i += 1) await sleep(100);
    await sleep(300);
    const watched = ['wins.json', 'boss.json', 'points.json', 'gacha-viewers.json'];
    const filesBefore = Object.fromEntries(watched.map((name) => {
      const file = path.join(dir, name);
      return [name, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null];
    }));
    const winsBefore = runtime.readWins().default.wins;

    // テストの入力：RUSH は始まらない。応援・投票・押しボタンは準備中の見え方として数えるが、動作は実行されない
    runtime.hub.publish({ kind: 'gift', gift: { name: 'Rose', id: 'rose' }, totalDiamonds: 1, user: { id: 't1', name: 'テスト' }, test: true });
    runtime.hub.publish({ kind: 'like', count: 1, user: { id: 't1', name: 'テスト' }, test: true });
    runtime.hub.publish({ kind: 'chat', text: '1', user: { id: 't1', name: 'テスト' }, test: true });
    runtime.hub.publish({ kind: 'chat', text: '押', user: { id: 't1', name: 'テスト' }, test: true });
    await sleep(400);

    assert.equal(runtime.readRush().active, false, 'テストギフトで RUSH は始まらない');
    const cheers = (await (await control('cheer', 'status')).json()).cheers;
    assert.equal(cheers.default.full, true, 'テストいいねは準備中の見え方として数え、満タンにもなる');
    const votes = (await (await control('vote', 'status')).json()).votes;
    assert.deepEqual(votes.default.counts, [1, 0], 'テスト票は準備中の見え方として数える');
    const pushes = (await (await control('push', 'status')).json()).push;
    assert.equal(pushes.default.pushes, 1, 'テストの押しは準備中の見え方として数える');

    // テストだけで終わらせても、設定済みの動作は実行されない
    assert.equal((await control('vote', 'result')).status, 200);
    assert.equal((await control('push', 'finish')).status, 200);
    await sleep(300);
    assert.equal(runtime.readWins().default.wins, winsBefore, 'テストだけの完了で設定済みの動作は実行されない');
    for (const name of watched) {
      const file = path.join(dir, name);
      const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      assert.equal(now, filesBefore[name], `保存ファイル ${name} はテストで変わらない`);
    }

    // 本物の入力は今までどおり効く（状態にも動作にも）
    runtime.hub.publish({ kind: 'gift', gift: { name: 'Rose', id: 'rose' }, totalDiamonds: 1, user: { id: 'r1', name: '本物' } });
    assert.equal(runtime.readRush().active, true, '本物のギフトで RUSH が始まる');
    assert.equal((await control('cheer', 'reset')).status, 200);
    runtime.hub.publish({ kind: 'like', count: 1, user: { id: 'r1', name: '本物' } });
    await sleep(300);
    assert.equal(runtime.readWins().default.wins, winsBefore + 4, '本物のいいねで応援が満タンになり動作が実行される');
    assert.equal((await control('vote', 'start')).status, 200);
    runtime.hub.publish({ kind: 'chat', text: '1', user: { id: 'r1', name: '本物' } });
    assert.equal((await control('vote', 'result')).status, 200);
    await sleep(200);
    assert.equal(runtime.readWins().default.wins, winsBefore + 6, '本物の票の結果で動作が実行される');
    // 押しボタンの動作は1つの状態につき1回だけ（終わった状態はリセットしてから始める）
    assert.equal((await control('push', 'reset')).status, 200);
    assert.equal((await control('push', 'start')).status, 200);
    runtime.hub.publish({ kind: 'chat', text: '押', user: { id: 'r1', name: '本物' } });
    await sleep(200);
    assert.equal((await control('push', 'finish')).status, 200);
    await sleep(200);
    assert.equal(runtime.readWins().default.wins, winsBefore + 8, '本物の押しの結果で動作が実行される');
  } finally {
    await close(server, runtime);
  }
});

test('テストは WIN数のルールとタイマーの延長に届かず、ルーレットの結果も出さない', async (t) => {
  prodEnv(t);
  const dir = tmp('tw-test-send-engines2-');
  const runtime = createRuntime({ id: 'engines2', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const { server, port } = await listen(runtime);
  const control = (target, action, data) => postJson(port, '/api/control', { target, action, data });
  try {
    assert.equal(runtime.setConfig(['wins'], { default: { ...defaultsFor('wins'), rules: [{ gifts: ['Rose'], add: 4 }] } }).ok, true);
    assert.equal(runtime.setConfig(['timers'], { default: { ...defaultsFor('timers'), startMinutes: 60, coinSeconds: 2, minCoins: 1, likeEvery: 0, followSeconds: 0, shareSeconds: 0 } }).ok, true);
    assert.equal(runtime.setConfig(['roulettes'], { default: { ...defaultsFor('roulettes'), gifts: ['Rose'], duration: 1, hold: 1, items: [{ label: 'あたり', win: true }, { label: 'はずれ', win: false }] } }).ok, true);
    assert.equal((await control('timer', 'start', { id: 'default' })).status, 200);

    await sleep(300);
    const watched = ['wins.json', 'timers.json'];
    const filesBefore = Object.fromEntries(watched.map((name) => {
      const file = path.join(dir, name);
      return [name, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null];
    }));
    assert.notEqual(filesBefore['timers.json'], null, 'タイマーを始めると保存ファイルができる');
    const rouletteResults = [];
    runtime.hub.on('roulette', (r) => rouletteResults.push(r));

    // テストのギフト・いいね
    runtime.hub.publish({ kind: 'gift', gift: { name: 'Rose', id: 'rose', count: 1 }, totalDiamonds: 1, user: { id: 't1', name: 'テスト' }, test: true });
    runtime.hub.publish({ kind: 'like', count: 5, user: { id: 't1', name: 'テスト' }, test: true });
    await sleep(500);
    assert.equal(runtime.readWins().default.wins, 0, 'テストギフトで WIN数のルールは適用されない');
    assert.equal(runtime.readTimer().default.extended, 0, 'テストギフトでタイマーは延びない');
    await sleep(3500); // ルーレットの結果が出るころまで待つ
    assert.equal(rouletteResults.length, 0, 'テストギフトのルーレットは画面だけ（結果は出さない）');
    for (const name of watched) {
      const file = path.join(dir, name);
      const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      assert.equal(now, filesBefore[name], `保存ファイル ${name} はテストで変わらない`);
    }

    // 本物のギフトは今までどおり効く
    runtime.hub.publish({ kind: 'gift', gift: { name: 'Rose', id: 'rose', count: 1 }, totalDiamonds: 1, user: { id: 'r1', name: '本物' } });
    await sleep(300);
    assert.equal(runtime.readWins().default.wins, 4, '本物のギフトで WIN数のルールが適用される');
    assert.equal(runtime.readTimer().default.extended, 2, '本物のギフトでタイマーが延びる');
    await sleep(3500);
    assert.equal(rouletteResults.length, 1, '本物のギフトではルーレットの結果が出る');
  } finally {
    await close(server, runtime);
  }
});
