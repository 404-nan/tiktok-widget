// 本番前レビューの再現テスト。公開画面へ届く形と runtime の操作経路を確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Hub } from '../../src/hub.js';
import { StepupEngine } from '../../src/stepup.js';
import { SwarmEngine } from '../../src/swarm.js';
import { defaultsFor } from '../../src/schema.js';
import { normalize, createStore } from '../../src/config.js';
import { createRuntime } from '../../src/runtime.js';

const root = process.cwd();
const gift = (coins = 100) => ({
  kind: 'gift',
  user: { id: 'u1', name: 'たろう' },
  gift: { id: '5655', name: 'Rose', count: 1 },
  totalDiamonds: coins,
});

function sentBy(engine, hub, event) {
  const sent = [];
  hub.broadcast = (message) => sent.push(message);
  hub.publish(event);
  return sent.at(-1);
}

test('レビュー再現: 設定が実際の stepup/swarm 配信メッセージに含まれる', () => {
  const stepHub = new Hub();
  const stepup = new StepupEngine(stepHub);
  stepup.setConfig({ ...defaultsFor('stepup'), edge: 'left', sound: false, volume: 0.2, step1Text: 'はじめ' });
  const stepMessage = sentBy(stepup, stepHub, gift());
  assert.equal(stepMessage.stepup.edge, 'left');
  assert.equal(stepMessage.stepup.sound, false);
  assert.equal(stepMessage.event.volume, 0.2);
  assert.equal(stepMessage.event.text, 'はじめ');
  stepup.close();

  const swarmHub = new Hub();
  const swarm = new SwarmEngine(swarmHub);
  swarm.setConfig({ ...defaultsFor('swarm'), text: '祭', sound: false, volume: 0.2, threshold: 1, scale: 'custom' });
  const swarmMessage = sentBy(swarm, swarmHub, gift(1));
  assert.equal(swarmMessage.swarm.text, '祭');
  assert.equal(swarmMessage.event.text, '祭');
  assert.equal(swarmMessage.event.sound, false);
  swarm.close();
});

test('レビュー再現: 待機中の画面を隠し、残り時間をゲージにする実装がある', () => {
  const html = fs.readFileSync(path.join(root, 'public/widgets/stepup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public/widgets/stepup.js'), 'utf8');
  assert.match(html, /\.active \.stack/);
  assert.match(script, /endsAt/);
  assert.match(script, /className\s*=\s*[^;]*active/);
});

test('レビュー再現: start は実ラウンドを始め、未知の操作は実行しない', () => {
  const hub = new Hub();
  const stepup = new StepupEngine(hub);
  stepup.setConfig(defaultsFor('stepup'));
  assert.equal(stepup.start().active, true);
  stepup.close();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-pre-ship-'));
  const runtime = createRuntime({ store: createStore(path.join(dir, 'config.yaml')), dataDir: path.join(dir, 'data'), mediaDirs: [path.join(dir, 'media')] });
  try {
    assert.equal(runtime.performControl('stepup', 'typo').status, 400);
    assert.equal(runtime.performControl('swarm', 'typo').status, 400);
  } finally {
    return runtime.close().then(() => fs.rmSync(dir, { recursive: true, force: true }));
  }
});

test('レビュー再現: swarm の表示文字は1〜2文字に制限する', () => {
  const invalid = normalize({ swarm: { text: '長すぎる文字' } });
  assert.ok(invalid.errors.some((error) => error.includes('swarm.text')));
});

test('レビュー再現: カードの演出フックが公開画面にある', () => {
  const source = ['stepup.html', 'stepup.js', 'swarm.html', 'swarm.js']
    .map((file) => fs.readFileSync(path.join(root, 'public/widgets', file), 'utf8')).join('\n');
  for (const token of ['freeze', 'confetti', 'shake', 'rumble']) assert.match(source, new RegExp(token));
});
