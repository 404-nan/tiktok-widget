import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { normalize } from '../src/config.js';
import { createStore } from '../src/config.js';
import { createRuntime, featureOfPage } from '../src/runtime.js';
import { GiftSounds, GIFT_SOUND_AUTOPLAY_NOTE, soundGain } from '../src/gift-sounds.js';
import { normalizeGift } from '../src/normalize.js';
import { parseAction, runActions } from '../src/actions.js';
import { DEFAULT_WIDGETS, Tenants } from '../src/tenants.js';
import { allowsFeature } from '../src/billing.js';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const root = path.resolve(import.meta.dirname, '..');

function harness(items = [{ id: 'bell', name: 'ベル', kind: 'audio', mime: 'audio/wav' }, { id: 'chime', name: 'チャイム', kind: 'audio', mime: 'audio/wav' }]) {
  const messages = [];
  const sounds = new GiftSounds({
    media: {
      fileInfo(id) {
        const item = items.find((entry) => entry.id === id);
        return item ? { path: '/tmp/x', mime: item.mime, item } : null;
      },
    },
    hub: { broadcast(msg) { messages.push(msg); } },
  });
  return { sounds, messages };
}

const rose = (extra = {}) => ({ kind: 'gift', gift: { id: '5655', name: 'Rose', diamonds: 1, count: 1 }, totalDiamonds: 1, ...extra });

test('最初に合ったルールだけ鳴らし、フォローとシェアとコインの境目を見る', { timeout: 5000 }, () => {
  const { sounds, messages } = harness();
  sounds.setConfig({
    masterVolume: 80,
    maxConcurrent: 5,
    maxSeconds: 30,
    rules: [
      { gifts: ['Rose'], minCoins: 10, mediaId: 'bell', volume: 50 },
      { gifts: ['Rose'], mediaId: 'chime', volume: 80 },
      { events: ['follow'], mediaId: 'bell', volume: 100 },
      { events: ['share'], mediaId: 'chime', volume: 25 },
    ],
  });
  sounds.onEvent(rose({ totalDiamonds: 9 }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].mediaId, 'chime');
  sounds.onEvent(rose({ totalDiamonds: 10 }));
  assert.equal(messages.length, 2);
  assert.equal(messages[1].type, 'giftSound');
  assert.equal(messages[1].event, 'play');
  assert.equal(messages[1].mediaId, 'bell');
  assert.equal(messages[1].volume, 50);
  assert.equal(messages[1].masterVolume, 80);
  assert.equal(messages[1].giftLabel, 'バラ');
  sounds.onEvent(rose({ totalDiamonds: 99 }));
  assert.equal(messages.length, 3);
  assert.equal(messages[2].mediaId, 'bell');
  sounds.onEvent({ kind: 'follow', user: { id: 'u', name: 'あ' } });
  assert.equal(messages.at(-1).giftLabel, 'フォロー');
  assert.equal(messages.at(-1).mediaId, 'bell');
  sounds.onEvent({ kind: 'share', user: { id: 'u', name: 'あ' } });
  assert.equal(messages.at(-1).giftLabel, 'シェア');
  assert.equal(messages.at(-1).mediaId, 'chime');
  assert.equal(messages.at(-1).volume, 25);
  const before = messages.length;
  sounds.onEvent({ kind: 'like', count: 1 });
  assert.equal(messages.length, before);
  sounds.close();
  sounds.setConfig({ masterVolume: 80, maxConcurrent: 5, maxSeconds: 30, rules: [{ minCoins: 100, mediaId: 'bell', volume: 40 }] });
  sounds.onEvent(rose({ totalDiamonds: 99 }));
  assert.equal(messages.length, before);
  sounds.onEvent(rose({ totalDiamonds: 100 }));
  assert.equal(messages.at(-1).volume, 40);
  assert.equal(messages.at(-1).mediaId, 'bell');
  sounds.close();
});

test('音量は 0〜100 で、範囲外は設定エラーになり再生側は収める', { timeout: 5000 }, () => {
  assert.equal(soundGain(80, 50), 0.4);
  assert.equal(soundGain(0, 100), 0);
  assert.equal(soundGain(100, 100), 1);
  assert.equal(soundGain(200, -5), 0);
  const bad = normalize({
    giftSounds: {
      masterVolume: 101,
      maxSeconds: 0,
      maxConcurrent: 9,
      rules: [
        { mediaId: 'bell', gifts: ['Rose'], volume: -1 },
        { mediaId: 'chime', gifts: ['Rose'], volume: 101 },
        { mediaId: 'bell', events: ['like'] },
      ],
    },
  });
  assert.ok(bad.errors.some((e) => e.includes('giftSounds.masterVolume')));
  assert.ok(bad.errors.some((e) => e.includes('giftSounds.maxSeconds')));
  assert.ok(bad.errors.some((e) => e.includes('giftSounds.maxConcurrent')));
  assert.ok(bad.errors.some((e) => e.includes('rules[0].volume') && e.includes('0 以上')));
  assert.ok(bad.errors.some((e) => e.includes('rules[1].volume') && e.includes('100 以下')));
  assert.ok(bad.errors.some((e) => e.includes('like')));
  assert.equal(bad.config.giftSounds.masterVolume, 100);
  assert.equal(bad.config.giftSounds.maxConcurrent, 5);
  const ok = normalize({ giftSounds: { rules: [{ mediaId: 'bell', gifts: ['Rose'] }] } });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.config.giftSounds.rules[0].volume, 100);
  const bare = normalize({ giftSounds: { rules: [{ mediaId: 'bell' }] } });
  assert.deepEqual(bare.errors, []);
  assert.ok(bare.warnings.some((w) => w.includes('きっかけ')));
  const issues = { errors: [], warnings: [] };
  assert.equal(parseAction({ type: 'sound.play', mediaId: 'bell', volume: 101 }, 'a', issues), null);
  assert.match(issues.errors.join('\n'), /volume/);
  assert.equal(parseAction({ type: 'sound.play', volume: 10 }, 'a', issues), null);
  const action = parseAction({ type: 'sound.play', mediaId: 'bell', volume: 40 }, 'a', { errors: [], warnings: [] });
  assert.equal(action.volume, 40);
  const { sounds } = harness();
  sounds.setConfig({ enabled: false, rules: [] });
  assert.throws(() => sounds.play('missing'), /音声が見つかりません/);
  const played = sounds.play('bell', { volume: 40 });
  assert.equal(played.mediaId, 'bell');
  assert.equal(played.volume, 40);
  const ran = runActions([{ type: 'sound.play', mediaId: 'bell', volume: 20 }], { sounds });
  assert.equal(ran[0].ok, true);
  assert.equal(ran[0].result.volume, 20);
  assert.equal(runActions([{ type: 'sound.play', mediaId: 'bell' }], {}).some((r) => /ギフト別サウンドがありません/.test(r.error)), true);
  sounds.close();
});

test('同時は3、待ちは10、あふれたら古い待ちから捨て、鳴り始めだけ最近に残す', { timeout: 5000 }, () => {
  const { sounds, messages } = harness();
  sounds.setConfig({ maxConcurrent: 3, maxSeconds: 30, masterVolume: 80, rules: [] });
  const tokens = [];
  for (let i = 0; i < 14; i++) tokens.push(sounds.play('bell').token);
  let snap = sounds.snapshot();
  assert.equal(snap.playing.length, 3);
  assert.equal(snap.queue.length, 10);
  assert.deepEqual(snap.playing.map((job) => job.token), tokens.slice(0, 3));
  assert.deepEqual(snap.queue.map((job) => job.token), tokens.slice(4));
  assert.equal(snap.recent.length, 3);
  assert.equal(messages.filter((m) => m.event === 'play').length, 3);
  assert.equal(sounds.ack(tokens[0]), true);
  snap = sounds.snapshot();
  assert.equal(snap.playing.length, 3);
  assert.equal(snap.queue.length, 9);
  assert.equal(snap.playing.some((job) => job.token === tokens[4]), true);
  assert.equal(snap.recent.length, 4);
  assert.equal(snap.recent[0].mediaId, 'bell');
  sounds.close();
  assert.equal(sounds.snapshot().playing.length, 0);
});

test('連打は終わった1回だけ鳴らし、ファイルが無ければ次のルールへ進まない', { timeout: 5000 }, () => {
  const { sounds, messages } = harness([
    { id: 'bell', name: 'ベル', kind: 'audio', mime: 'audio/wav' },
    { id: 'pic', name: '絵', kind: 'image', mime: 'image/png' },
  ]);
  sounds.setConfig({
    rules: [
      { gifts: ['Rose'], mediaId: 'missing', volume: 100 },
      { gifts: ['Rose'], mediaId: 'bell', volume: 100 },
    ],
  });
  sounds.onEvent(rose());
  assert.equal(messages.length, 0);
  sounds.setConfig({
    rules: [
      { gifts: ['Rose'], mediaId: 'pic', volume: 100 },
      { gifts: ['Rose'], mediaId: 'bell', volume: 100 },
    ],
  });
  sounds.onEvent(rose());
  assert.equal(messages.length, 0);
  sounds.setConfig({ rules: [{ gifts: ['Rose'], mediaId: 'bell', volume: 100 }] });
  for (const repeatEnd of [0, false, '0']) sounds.onEvent(rose({ repeatEnd }));
  assert.equal(messages.length, 0);
  for (let i = 0; i < 4; i++) {
    const mid = normalizeGift({ giftId: '5655', repeatCount: i + 1, repeatEnd: false, gift: { id: '5655', name: 'Rose', type: 1, diamondCount: 1 } });
    assert.equal(mid, null);
  }
  const end = normalizeGift({ giftId: '5655', repeatCount: 4, repeatEnd: true, gift: { id: '5655', name: 'Rose', type: 1, diamondCount: 1 } });
  assert.equal(end.repeatEnd, undefined);
  sounds.onEvent(end);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].giftLabel, 'バラ');
  sounds.setConfig({ enabled: false, rules: [{ gifts: ['Rose'], mediaId: 'bell' }] });
  sounds.onEvent(rose());
  assert.equal(messages.length, 1);
  sounds.close();
});

test('giftSounds の無い古い設定は初期値で埋まり、エラーにしない', { timeout: 5000 }, () => {
  const old = normalize({ alerts: { default: { events: ['gift'] } } });
  assert.deepEqual(old.errors, []);
  assert.deepEqual(old.warnings, []);
  assert.equal(old.config.giftSounds.enabled, true);
  assert.equal(old.config.giftSounds.masterVolume, 80);
  assert.equal(old.config.giftSounds.maxSeconds, 8);
  assert.equal(old.config.giftSounds.maxConcurrent, 3);
  assert.deepEqual(old.config.giftSounds.rules, []);
  assert.equal(GIFT_SOUND_AUTOPLAY_NOTE, 'LIVE Studio のソース設定で音声を有効にしてください');
});

test('ウィジェット一覧に無い配信者には出さず、OBS は読む・確認だけ', { timeout: 10000 }, async () => {
  assert.equal(DEFAULT_WIDGETS.includes('giftSounds'), false);
  assert.equal(featureOfPage('sounds.html'), 'giftSounds');
  const tenants = new Tenants({ dir: tmp('tw-gift-tenants-') });
  const created = tenants.create({ name: 'りん' });
  assert.equal(tenants.info(created.id).widgets.includes('giftSounds'), false);
  tenants.update(created.id, { widgets: ['alerts', 'giftSounds', 'nope'] });
  assert.deepEqual(tenants.info(created.id).widgets, ['alerts', 'giftSounds']);
  const all = fs.readFileSync(path.join(root, 'public/widgets/all.html'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'public/dashboard/editor.js'), 'utf8');
  const form = fs.readFileSync(path.join(root, 'public/dashboard/gift-sounds-form.js'), 'utf8');
  const widget = fs.readFileSync(path.join(root, 'public/widgets/sounds.js'), 'utf8');
  assert.match(all, /me\.widgets\?\.includes\(section\)/);
  assert.match(all, /section === 'giftSounds'/);
  assert.match(all, /pageUrl\('sounds'/);
  assert.match(editor, /me\.widgets\.includes\(s\)/);
  assert.match(form, /LIVE Studio のソース設定で音声を有効にしてください/);
  assert.match(widget, /master \* rule/);
  assert.match(widget, /\/api\/gift-sounds\/autoplay/);
  assert.match(widget, /muted: true/);
  assert.match(widget, /wait\.length > 10/);
  assert.equal(allowsFeature({ plan: 'yen2000', paidUntil: '2099-01-01' }, 'giftSounds', { enforcement: true, premiumFeatures: ['sounds'] }), false);
  assert.equal(allowsFeature({ plan: 'yen5000', paidUntil: '2099-01-01' }, 'sounds', { enforcement: true, premiumFeatures: ['giftSounds'] }), true);

  const dir = tmp('tw-gift-http-');
  fs.writeFileSync(path.join(dir, 'config.yaml'), 'alerts:\n  default:\n    events: [gift]\n');
  let entitled = false;
  const runtime = createRuntime({
    id: 'test',
    store: createStore(path.join(dir, 'config.yaml')),
    dataDir: dir,
    mediaDirs: [dir],
    entitled: (feature) => feature !== 'giftSounds' || entitled,
  });
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const before = process.env.TW_ENV;
  const beforePort = process.env.PORT;
  const post = (url, body) => fetch(`http://127.0.0.1:${port}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const get = (url) => fetch(`http://127.0.0.1:${port}${url}`);
  try {
    const config = await (await get('/api/config')).json();
    assert.deepEqual(config.errors, []);
    assert.deepEqual(config.warnings, []);
    assert.equal(config.config.giftSounds.masterVolume, 80);
    assert.deepEqual(config.config.giftSounds.rules, []);
    const uploaded = await fetch(`http://127.0.0.1:${port}/api/media-alerts?name=bell.wav`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: Buffer.from('RIFFwav'),
    });
    assert.equal(uploaded.status, 200);
    const mediaId = (await uploaded.json()).item.id;
    assert.equal((await runtime.setConfig('giftSounds.maxSeconds', 30)).ok, true);
    assert.equal((await runtime.setConfig('giftSounds.rules', [{ events: ['follow'], mediaId, volume: 70 }])).ok, true);
    process.env.TW_ENV = 'dev';
    process.env.PORT = '3999';
    const quiet = await post('/api/simulate', { kind: 'follow' });
    assert.equal(quiet.status, 200);
    assert.equal((await (await get('/api/gift-sounds')).json()).playing.length, 0);
    entitled = true;
    runtime.entitlementsChanged();
    const heard = await post('/api/simulate', { kind: 'follow' });
    assert.equal(heard.status, 200);
    const snap = await (await get('/api/gift-sounds')).json();
    assert.equal(snap.playing.length, 1);
    assert.equal(snap.playing[0].mediaId, mediaId);
    assert.equal(snap.playing[0].volume, 70);
    assert.equal(snap.recent.length, 1);
    assert.equal(snap.recent[0].label, 'フォロー');
    assert.equal((await post('/api/gift-sounds/ack', { token: snap.playing[0].token })).status, 200);
    const burst = await post('/api/dev/trigger', { target: 'gift-sound', mediaId, count: 4 });
    assert.equal(burst.status, 200);
    const after = (await burst.json()).giftSounds;
    assert.equal(after.playing.length, 3);
    assert.equal(after.queue.length, 1);
    assert.equal(after.recent.length, 4);
    const tooMany = await post('/api/dev/trigger', { target: 'gift-sound', mediaId, count: 5 });
    assert.equal(tooMany.status, 400);
    const missing = await post('/api/dev/trigger', { target: 'gift-sound', mediaId: 'none' });
    assert.equal(missing.status, 400);
    assert.match(await missing.text(), /音声が見つかりません/);
    const autoplay = await post('/api/gift-sounds/autoplay', { muted: true });
    assert.equal(autoplay.status, 200);
    assert.equal((await autoplay.json()).autoplay.note, GIFT_SOUND_AUTOPLAY_NOTE);
  } finally {
    if (before === undefined) delete process.env.TW_ENV;
    else process.env.TW_ENV = before;
    if (beforePort === undefined) delete process.env.PORT;
    else process.env.PORT = beforePort;
    await stopServer(server);
    await runtime.close();
  }

  const obsDir = tmp('tw-gift-obs-');
  const obsRuntime = createRuntime({ id: 'obs', store: createStore(path.join(obsDir, 'config.yaml')), dataDir: obsDir, mediaDirs: [obsDir] });
  const obsApp = express();
  obsApp.use(express.json());
  obsApp.use((req, _res, next) => { req.role = 'obs'; next(); });
  obsApp.use(obsRuntime.router);
  const obsServer = createServer(obsApp);
  await new Promise((resolve) => obsServer.listen(0, '127.0.0.1', resolve));
  const obsPort = obsServer.address().port;
  try {
    assert.equal((await fetch(`http://127.0.0.1:${obsPort}/api/gift-sounds`)).status, 200);
    const ack = await fetch(`http://127.0.0.1:${obsPort}/api/gift-sounds/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'none' }),
    });
    assert.equal(ack.status, 200);
    const note = await fetch(`http://127.0.0.1:${obsPort}/api/gift-sounds/autoplay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ muted: true }),
    });
    assert.equal(note.status, 200);
    const file = await fetch(`http://127.0.0.1:${obsPort}/api/media-alerts/aaaaaaaaaaaaaaaa/file`);
    assert.equal(file.status, 404);
    const denied = await fetch(`http://127.0.0.1:${obsPort}/api/dev/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'gift-sound', mediaId: 'aaaaaaaaaaaaaaaa', count: 1 }),
    });
    assert.equal(denied.status, 403);
  } finally {
    await stopServer(obsServer);
    await obsRuntime.close();
  }
  clearInterval(tenants.timer);
  clearInterval(tenants.rentalTimer);
  tenants.rental.close();
});

function stopServer(server) {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(resolve));
}
