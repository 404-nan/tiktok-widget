// 実ランタイムの状態を使い、デモや待機を配信中の人数に入れないことを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { liveCount } from '../src/healthz.js';

test('demo と idle は healthz の live に入らない', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-healthz-modes-'));
  const runtime = createRuntime({
    id: 'local',
    store: createStore(path.join(dataDir, 'config.yaml')),
    dataDir,
    mediaDirs: [dataDir],
  });
  try {
    runtime.hub.setStatus({ mode: 'demo' });
    assert.equal(liveCount({ local: runtime }), 0);
    runtime.hub.setStatus({ mode: 'idle' });
    assert.equal(liveCount({ local: runtime }), 0);
    runtime.hub.setStatus({ mode: 'live' });
    assert.equal(liveCount({ local: runtime }), 1);
  } finally {
    await runtime.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('手動切断・配信終了のあとは再接続猶予を数えない', async () => {
  let now = 1_000_000;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-healthz-grace-'));
  const runtime = createRuntime({
    id: 'local',
    store: createStore(path.join(dataDir, 'config.yaml')),
    dataDir,
    mediaDirs: [dataDir],
    now: () => now,
  });
  try {
    runtime.hub.setStatus({ mode: 'live' });
    runtime.hub.setStatus({ mode: 'idle' });
    runtime.hub.setStatus({ mode: 'connecting' });
    assert.equal(liveCount({ local: runtime }), 0);

    runtime.hub.setStatus({ mode: 'live' });
    runtime.hub.setStatus({ mode: 'ended' });
    runtime.hub.setStatus({ mode: 'error' });
    assert.equal(liveCount({ local: runtime }), 0);
  } finally {
    await runtime.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('最後に live だった時刻から15分後は再接続中を数えない', async () => {
  let now = 1_000_000;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-healthz-expiry-'));
  const runtime = createRuntime({
    id: 'local',
    store: createStore(path.join(dataDir, 'config.yaml')),
    dataDir,
    mediaDirs: [dataDir],
    now: () => now,
  });
  try {
    runtime.hub.setStatus({ mode: 'live' });
    runtime.hub.setStatus({ mode: 'connecting' });
    assert.equal(liveCount({ local: runtime }), 1);
    now += 15 * 60 * 1000;
    assert.equal(liveCount({ local: runtime }), 0);
  } finally {
    await runtime.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
