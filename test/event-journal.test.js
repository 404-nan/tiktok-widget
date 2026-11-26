// 先書き日誌の重複除去と、配信の区切り（reset）後の復元を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../src/runtime.js';
import { createStore } from '../src/config.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-event-journal-'));
const gift = (key, user, coins) => ({
  kind: 'gift',
  eventId: key,
  user: { id: user, name: user },
  gift: { id: 'gift-test', name: 'Journal test gift', diamonds: coins, count: 1 },
  totalDiamonds: coins,
});

function runtime(dir) {
  return createRuntime({ id: 'test', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
}

test('同じキーのギフトは日誌復元後も二重に数えない', async () => {
  const dir = tmp();
  const first = runtime(dir);
  try {
    first.hub.publish(gift('same-key', 'Viewer A', 7));
    first.hub.publish(gift('same-key', 'Viewer A', 7));
    assert.equal(first.hub.state.gifts, 1);
    assert.equal(first.hub.state.diamonds, 7);
  } finally {
    await first.close();
  }

  // 状態保存が無くても、日誌のキーで再送分を捨てる。
  fs.rmSync(path.join(dir, 'live-state.json'), { force: true });
  const second = runtime(dir);
  try {
    assert.equal(second.hub.state.gifts, 1);
    second.hub.publish(gift('same-key', 'Viewer A', 7));
    assert.equal(second.hub.state.gifts, 1);
    assert.equal(second.hub.state.diamonds, 7);
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('配信の区切りで epoch と連番が新しくなり、保存が無くても前の配信を数え直さない', async () => {
  const dir = tmp();
  const first = runtime(dir);
  const firstEpoch = first.hub.epoch;
  try {
    first.hub.publish(gift('old-live', 'Viewer Old', 7));
    first.hub.reset();
    assert.notEqual(first.hub.epoch, firstEpoch);
    assert.equal(first.hub.seq, 0);
    first.hub.publish(gift('new-live', 'Viewer New', 5));
  } finally {
    await first.close();
  }

  // 正常終了の状態保存を消し、日誌だけから復元する。
  fs.rmSync(path.join(dir, 'live-state.json'), { force: true });
  const second = runtime(dir);
  try {
    assert.equal(second.hub.epoch, first.hub.epoch);
    assert.equal(second.hub.state.gifts, 1);
    assert.equal(second.hub.state.diamonds, 5);
    assert.deepEqual(second.hub.state.topGifters.map((row) => row.user.name), ['Viewer New']);
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reset 直後に新しいイベントが無くても、日誌だけの復元では前の配信へ戻らない', async () => {
  const dir = tmp();
  const first = runtime(dir);
  const resetEpoch = { value: null };
  try {
    first.hub.publish(gift('before-reset', 'Viewer Old', 7));
    first.hub.reset();
    resetEpoch.value = first.hub.epoch;
  } finally {
    await first.close();
  }

  fs.rmSync(path.join(dir, 'live-state.json'), { force: true });
  const second = runtime(dir);
  try {
    assert.equal(second.hub.epoch, resetEpoch.value);
    assert.equal(second.hub.state.gifts, 0);
    assert.equal(second.hub.state.diamonds, 0);
    assert.equal(second.hub.seq, 0);
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('配婚前のテストイベントを復元したときは汚れ印も戻り、live で数を捨てる', async () => {
  const dir = tmp();
  const first = runtime(dir);
  const firstEpoch = first.hub.epoch;
  try {
    first.hub.publish({ ...gift('pre-live-test', 'Viewer Test', 3), test: true });
    assert.equal(first.hub.state.gifts, 1);
  } finally {
    await first.close();
  }

  const second = runtime(dir);
  try {
    assert.equal(second.hub.state.gifts, 1);
    assert.equal(second.hub.testDirty, true);
    second.hub.setStatus({ mode: 'live', roomId: 'room-after-test' });
    assert.equal(second.hub.state.gifts, 0);
    assert.notEqual(second.hub.epoch, firstEpoch);
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('日誌だけの復元でも、別の room の配信には前の数を持ち込まない', async () => {
  const dir = tmp();
  const first = runtime(dir);
  try {
    first.hub.setStatus({ mode: 'live', roomId: 'room-a' });
    first.hub.publish(gift('room-a-gift', 'Viewer A', 7));
    assert.equal(first.hub.state.gifts, 1);
  } finally {
    await first.close();
  }

  // 状態保存が無いクラッシュ相当では、起動直後はいったん日誌を戻し、
  // 実際に別 room へつないだ時点で配信の区切りを作る。
  fs.rmSync(path.join(dir, 'live-state.json'), { force: true });
  const second = runtime(dir);
  try {
    assert.equal(second.hub.state.gifts, 1);
    second.hub.setStatus({ mode: 'live', roomId: 'room-b' });
    assert.equal(second.hub.state.gifts, 0);
    assert.equal(second.hub.state.diamonds, 0);
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('同じキーは種類が違っても二重に流さない', async () => {
  const dir = tmp();
  const first = runtime(dir);
  try {
    const follow = first.hub.publish({ kind: 'follow', eventId: 'shared-key', user: { id: 'Viewer A', name: 'Viewer A' } });
    assert.equal(follow.accepted, true);
    const second = first.hub.publish(gift('shared-key', 'Viewer A', 7));
    assert.equal(second.duplicate, true);
    assert.equal(first.hub.state.follows, 1);
    assert.equal(first.hub.state.gifts, 0);
  } finally {
    await first.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
