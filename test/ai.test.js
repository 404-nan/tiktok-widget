import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import * as cfg from '../src/config.js';
import { createAi, checkChanges, buildRequest } from '../src/ai.js';
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
  assert.equal(ok.changes[1].label, 'wins.default');
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
  assert.match(next.text, /^# TikTok LIVE ウィジェットの設定/);
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
  assert.match(buildRequest({ text: 'a', config, focus: { section: 'wins', id: 'default' } }), /wins\.default/);

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
  const rt = createRuntime({ id: 't1', store: cfg.createStore(file), dataDir: dir, mediaDirs: [], ai, entitled: (f) => (f === 'ai' ? allowed : true) });
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
