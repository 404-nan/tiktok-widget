// OBS ウィジェットの接続時間を配信履歴へ記録し、統計画面の表示を確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { History } from '../src/history.js';

function setup(id = 'tenant-a') {
  let now = 1_000_000;
  const hub = new Hub();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-widget-usage-'));
  const history = new History(hub, dir, { id, now: () => now });
  clearInterval(history.timer);
  return { hub, history, setNow: (value) => { now = value; } };
}

function socket(role) {
  const listeners = {};
  return {
    role,
    readyState: 1,
    send() {},
    on(event, fn) { (listeners[event] ??= []).push(fn); },
    close() { for (const fn of listeners.close ?? []) fn(); },
  };
}

test('OBS接続の増減を重ならずに合計する', () => {
  const { hub, history, setNow } = setup();
  const first = socket('obs');
  const second = socket('obs');
  hub.addClient(first);
  hub.addClient({ ...socket('owner') });
  hub.setStatus({ mode: 'live', username: 'sakura' });
  history.current.timeline.push({ t: 0, viewers: 1 });
  setNow(1_010_000);
  hub.addClient(second);
  setNow(1_020_000);
  first.close();
  setNow(1_030_000);
  second.close();
  setNow(1_040_000);
  hub.setStatus({ mode: 'idle' });
  assert.equal(history.list()[0].widgetMs, 30_000);
});

test('ウィジェット利用は配信時間の半分以上で真になる', () => {
  const { hub, history, setNow } = setup();
  hub.setStatus({ mode: 'live', username: 'sakura' });
  history.current.timeline.push({ t: 0, viewers: 1 });
  const obs = socket('obs');
  hub.addClient(obs);
  setNow(1_060_000);
  obs.close();
  setNow(1_120_000);
  hub.setStatus({ mode: 'idle' });
  const summary = history.list()[0];
  assert.equal(summary.durationMs, 120_000);
  assert.equal(summary.widgetMs, 60_000);
  assert.equal(summary.widgetUsed, true);
});

test('ownerは数えず、localと古い記録は記録なしにする', () => {
  const local = setup('local');
  local.hub.addClient(socket('owner'));
  local.hub.setStatus({ mode: 'live', username: 'sakura' });
  local.history.current.timeline.push({ t: 0, viewers: 1 });
  local.setNow(1_010_000);
  local.hub.setStatus({ mode: 'idle' });
  assert.equal(local.history.list()[0].widgetMs, null);

  const hosted = setup();
  hosted.hub.addClient(socket('owner'));
  hosted.hub.setStatus({ mode: 'live', username: 'sakura' });
  hosted.history.current.timeline.push({ t: 0, viewers: 1 });
  hosted.setNow(1_010_000);
  hosted.hub.setStatus({ mode: 'idle' });
  const file = fs.readdirSync(hosted.history.dir)[0];
  fs.writeFileSync(path.join(hosted.history.dir, file), JSON.stringify({ ...hosted.history.get(hosted.history.list()[0].id), widgetMs: undefined }));
  assert.equal(hosted.history.list()[0].widgetMs, undefined);
});

test('統計画面にウィジェットの利用表示がある', () => {
  const script = fs.readFileSync(new URL('../public/history/history.js', import.meta.url), 'utf8');
  assert.match(script, /ウィジェット/);
  assert.match(script, /使った/);
  assert.match(script, /使っていない/);
  assert.match(script, /記録なし/);
});
