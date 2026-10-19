import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import * as cfg from '../src/config.js';
import { createAi, checkChanges, buildRequest, parseReply } from '../src/ai.js';
import { buildSystem } from '../src/ai-prompt.js';
import { createRuntime } from '../src/runtime.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ai-'));

// にせの AI: 送られてきたものを覚えて、決めた案を返す
function fakeClient(proposal, seen = []) {
  return {
    messages: {
      async parse(body) {
        seen.push(body);
        if (proposal instanceof Error) throw proposal;
        return { stop_reason: 'end_turn', parsed_output: proposal, usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };
}

test('変更の確かめ: 値は JSON の文字から読み、変えてはいけない場所は断る', () => {
  const ok = checkChanges([
    { op: 'set', path: 'roulettes.batsu', value_json: '{"name":"罰ゲーム","gifts":["Rose"],"items":["歌う*2","変顔"]}', label: 'ルーレットを作る' },
    { op: 'merge', path: 'wins.default', value_json: '{"goal":10}', label: '' },
    { op: 'delete', path: 'goals.old', value_json: '', label: '消す' },
  ]);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.changes[0].value.items, ['歌う*2', '変顔']);
  assert.equal(ok.changes[1].label, 'WIN数の設定を変える');
  assert.equal('value' in ok.changes[2], false);

  const bad = checkChanges([
    { op: 'set', path: 'minecraft.password', value_json: '"x"' },
    { op: 'merge', path: 'minecraft', value_json: '{"enabled":true}' },
    { op: 'set', path: 'nothing.here', value_json: '1' },
    { op: 'set', path: 'roulettes', value_json: '{}' },
    { op: 'delete', path: 'theme' },
    { op: 'set', path: 'theme.accent', value_json: '{こわれた' },
    { op: 'run', path: 'theme.accent', value_json: '1' },
  ]);
  assert.equal(bad.changes.length, 0);
  assert.equal(bad.errors.length, 7);
  // Minecraft のルールだけは変えられる
  assert.equal(checkChanges([{ op: 'set', path: 'minecraft.rules', value_json: '[]' }]).errors.length, 0);
});

test('設定の文字にまとめて当てる: コメントは残り、間違った値は書かない', () => {
  const text = fs.readFileSync(cfg.EXAMPLE_PATH, 'utf8');
  const next = cfg.applyChanges(text, [
    { op: 'set', path: 'roulettes.batsu', value: { name: '罰ゲーム', gifts: ['Rose'], items: ['歌う*2', '変顔'] } },
    { op: 'merge', path: 'theme', value: { accent: '#3FA9F5' } },
  ]);
  assert.equal(next.ok, true);
  assert.equal(next.config.roulettes.batsu.name, '罰ゲーム');
  assert.equal(next.config.theme.accent, '#3FA9F5');
  assert.equal(next.config.theme.gold, cfg.parseText(text).config.theme.gold);
  assert.match(next.text, /^# ライコネの設定/);
  const bad = cfg.applyChanges(text, [{ op: 'set', path: 'theme.accent', value: 'あか' }]);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length > 0);
});

test('AI に送る文: パスワードは入れない。項目の一覧は先頭に固めて置く', async () => {
  const dir = tmp();
  const seen = [];
  const ai = createAi({ dir, makeClient: () => fakeClient({ reply: 'こうします', changes: [{ op: 'merge', path: 'theme', value_json: '{"accent":"#3FA9F5"}', label: '色を青に' }] }, seen) });
  assert.equal(ai.state().set, false);
  await assert.rejects(() => ai.ask({ text: 'x', config: {} }), /まだ使えません/);

  const st = ai.update({ key: 'sk-ant-test-0000000000abcd', dailyLimit: 5, model: 'claude-sonnet-5-5' });
  assert.deepEqual({ set: st.set, source: st.source, tail: st.tail, model: st.model, dailyLimit: st.dailyLimit }, { set: true, source: 'admin', tail: 'abcd', model: 'claude-sonnet-5-5', dailyLimit: 5 });
  assert.equal(fs.statSync(path.join(dir, 'ai.json')).mode & 0o777, 0o600);
  assert.equal(JSON.stringify(st).includes('sk-ant-test'), false);
  assert.throws(() => ai.update({ model: 'gpt-x' }), /モデルは/);
  assert.throws(() => ai.update({ dailyLimit: -1 }), /1日の回数/);

  const config = cfg.parseText(fs.readFileSync(cfg.EXAMPLE_PATH, 'utf8')).config;
  config.minecraft.password = 'himitsu-pass';
  const out = await ai.ask({ text: '色を青にして', config, focus: { section: 'theme' }, gifts: [{ name: 'Rose', diamonds: 1 }] });
  assert.equal(out.reply, 'こうします');
  assert.deepEqual(out.changes, [{ op: 'merge', path: 'theme', value: { accent: '#3FA9F5' }, label: '色を青に' }]);
  const body = seen[0];
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.match(body.system[0].text, /roulettes/);
  const sent = JSON.stringify(body);
  assert.equal(sent.includes('himitsu-pass'), false);
  assert.match(body.messages[0].content, /色を青にして/);
  assert.match(buildRequest({ text: 'a', config, availableWidgets: ['WIN数', '目標バー'] }), /この配信者が使えるウィジェット: WIN数、目標バー/);
  assert.match(buildRequest({ text: 'a', config, focus: { section: 'wins', id: 'default' } }), /wins\.default/);

  const filtered = checkChanges([
    { op: 'set', path: 'wins.default.goal', value: 10 },
    { op: 'set', path: 'cutins.default.minCoins', value: 100 },
  ], { allowedSections: ['wins', 'theme'] });
  assert.deepEqual(filtered.errors, []);
  assert.equal(filtered.changes.length, 1);
  assert.equal(filtered.ignored, 1);

  // 起動し直しても残る。キーを消すと使えなくなる
  assert.equal(createAi({ dir }).state().tail, 'abcd');
  assert.equal(ai.update({ key: '' }).set, false);
});

test('たのむ → 反映 → 元に戻す。1日の回数を超えたら断り、使えない配信者にも断る', async () => {
  const dir = tmp();
  const file = path.join(dir, 'config.yaml');
  const proposal = { reply: '色を青にします', changes: [{ op: 'merge', path: 'theme', value_json: '{"accent":"#3FA9F5"}', label: '色を青に' }] };
  const ai = createAi({ dir, makeClient: () => fakeClient(proposal) });
  ai.update({ key: 'sk-ant-test-0000000000abcd', dailyLimit: 2 });
  let allowed = true;
  const rt = createRuntime({ id: 't1', store: cfg.createStore(file), dataDir: dir, mediaDirs: [], ai, entitled: (f) => (f === 'ai' ? allowed : f !== 'cutins') });
  const app = express();
  app.use(express.json());
  app.use(rt.router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const call = async (p, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return { status: res.status, ...(await res.json()) };
  };
  try {
    const before = fs.readFileSync(file, 'utf8');
    assert.deepEqual((await call('/api/ai/state')).left, 2);
    const asked = await call('/api/ai/ask', { text: '色を青にして', focus: { section: 'theme' } });
    assert.equal(asked.status, 200);
    assert.deepEqual(asked.errors, []);
    assert.equal(asked.state.left, 1);
    assert.equal(fs.readFileSync(file, 'utf8'), before); // たのんだだけでは変わらない

    const applied = await call('/api/ai/apply', { changes: asked.changes });
    assert.equal(applied.status, 200);
    assert.equal(applied.config.theme.accent, '#3FA9F5');
    assert.equal(applied.state.canUndo, true);
    assert.equal((await call('/api/ai/apply', { changes: [{ op: 'set', path: 'minecraft.host', value: 'evil' }] })).status, 400);
    const unavailable = await call('/api/ai/apply', { changes: [{ op: 'set', path: 'cutins.default.minCoins', value: 100 }] });
    assert.equal(unavailable.status, 400);
    assert.equal(unavailable.error, 'それはこのツールではできません。');

    const undone = await call('/api/ai/undo', {});
    assert.equal(undone.status, 200);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal((await call('/api/ai/undo', {})).status, 400);

    // 反映のあとに別の変更が入ったら、元に戻さない（その変更まで消さない）
    await call('/api/ai/apply', { changes: asked.changes });
    cfg.createStore(file).setValue('theme.scale', 2);
    assert.equal((await call('/api/ai/state')).canUndo, false);
    assert.equal((await call('/api/ai/undo', {})).status, 409);
    assert.equal(cfg.createStore(file).load().config.theme.scale, 2);
    assert.equal(cfg.createStore(file).load().config.theme.accent, '#3FA9F5');

    assert.equal((await call('/api/ai/ask', { text: '' })).status, 400);
    assert.equal((await call('/api/ai/ask', { text: 'あ'.repeat(601) })).status, 400);
    assert.equal((await call('/api/ai/ask', { text: 'もう1回' })).status, 200);
    assert.equal((await call('/api/ai/ask', { text: '3回目' })).status, 429);

    allowed = false;
    assert.equal((await call('/api/ai/state')).available, false);
    assert.equal((await call('/api/ai/ask', { text: 'x' })).status, 403);
    assert.equal((await call('/api/ai/apply', { changes: asked.changes })).status, 403);
  } finally {
    server.close();
    await rt.close();
  }
});

test('OpenAI と同じ形の API（Space Bunny など）: キーは AI ごとに分け、返事の JSON を読む', async () => {
  const dir = tmp();
  const calls = [];
  const reply = { reply: '色を青にします', changes: [{ op: 'merge', path: 'theme', value: { accent: '#3FA9F5' }, label: '色を青に' }] };
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) });
    // 1回目は「JSON で返す指定を知らない」API のふりをする
    if (calls.length === 1) return new Response('{"error":"unknown response_format"}', { status: 400 });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '```json\n' + JSON.stringify(reply) + '\n```' } }] }), { status: 200 });
  };
  const ai = createAi({ dir, fetchImpl });
  ai.update({ key: 'sk-ant-claude-0000000000aaaa' });
  // AI を切り替えると、前の AI のキーは使わない
  let st = ai.update({ provider: 'spacebunny' });
  assert.deepEqual({ provider: st.provider, set: st.set, ready: st.ready, model: st.model, baseUrl: st.baseUrl }, { provider: 'spacebunny', set: false, ready: false, model: 'space-bunny-alpha', baseUrl: 'https://spacebunnymodel.com/api/v1' });
  st = ai.update({ key: 'sb_live_0000000000000000bbbb', extra: 'TNT と爆発の演出は使わない' });
  assert.deepEqual({ set: st.set, ready: st.ready, tail: st.tail }, { set: true, ready: true, tail: 'bbbb' });

  const config = cfg.parseText(fs.readFileSync(cfg.EXAMPLE_PATH, 'utf8')).config;
  const out = await ai.ask({ text: '色を青にして', config });
  assert.deepEqual(out.changes, [{ op: 'merge', path: 'theme', value: { accent: '#3FA9F5' }, label: '色を青に' }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://spacebunnymodel.com/api/v1/chat/completions');
  assert.equal(calls[1].auth, 'Bearer sb_live_0000000000000000bbbb');
  assert.equal(calls[0].body.response_format.type, 'json_object');
  assert.equal(calls[1].body.response_format, undefined);
  assert.match(calls[1].body.messages[0].content, /TNT と爆発の演出は使わない/);
  assert.equal(JSON.stringify(calls).includes('sk-ant-claude'), false);

  // 自分で場所を入れる API は、場所とモデルが入るまで使えない
  st = ai.update({ provider: 'openai', key: 'key-0000000000000000cccc' });
  assert.equal(st.ready, false);
  assert.throws(() => ai.update({ baseUrl: 'http://example.com/v1' }), /https/);
  assert.equal(ai.update({ baseUrl: 'https://example.com/v1', model: 'some-model' }).ready, true);
  assert.equal(ai.update({ provider: 'claude' }).tail, 'aaaa');
});

test('返事の読み取りと、AI への指示', () => {
  assert.deepEqual(parseReply('はい。\n{"reply":"a","changes":[]}\n以上です'), { reply: 'a', changes: [] });
  assert.equal(parseReply('JSON ではない返事'), null);
  assert.equal(parseReply('[1,2]'), null);
  const forJson = buildSystem({ reference: 'REF', extra: 'ついか' });
  assert.match(forJson, /# 返す形/);
  assert.match(forJson, /# 管理者からの追加の指示[^#]*ついか/);
  assert.match(forJson, /"value":\{"accent":"#3FA9F5"\}/);
  assert.ok(forJson.trim().endsWith('REF'));
  const forClaude = buildSystem({ reference: 'REF', valueAsText: true });
  assert.equal(forClaude.includes('# 返す形'), false);
  assert.match(forClaude, /"value_json":"\{\\"accent\\":\\"#3FA9F5\\"\}"/);
});

test('確かめて問題が出た案は、AI に伝えて1回だけ直してもらう', async () => {
  const dir = tmp();
  const bodies = [];
  const answers = [
    { reply: '派手にします', changes: [{ op: 'merge', path: 'wins.default', value: { power: 2, shake: 3 }, label: '演出を強く' }] },
    { reply: '派手にします', changes: [{ op: 'merge', path: 'wins.default', value: { power: 2 }, label: '演出を強く' }] },
  ];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answers[bodies.length - 1]) } }] }), { status: 200 });
  };
  const ai = createAi({ dir, fetchImpl });
  ai.update({ provider: 'spacebunny', key: 'sb_live_0000000000000000bbbb' });
  const text = fs.readFileSync(cfg.EXAMPLE_PATH, 'utf8');
  const out = await ai.ask({ text: 'もっと派手に', config: cfg.parseText(text).config, check: (changes) => cfg.applyChanges(text, changes) });
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].messages.at(-1).content, /shake/);
  assert.equal(bodies[1].messages.at(-2).role, 'assistant');
  assert.deepEqual(out.changes[0].value, { power: 2 });
  assert.deepEqual([out.errors, out.warnings], [[], []]);
});
