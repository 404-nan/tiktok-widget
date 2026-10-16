import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GachaViewerStore } from '../src/gacha-viewers.js';
import * as mod from '../src/gacha-viewers.js';

const Manager = Object.values(mod).find((v) => typeof v === 'function' && v !== GachaViewerStore && v.prototype && 'onStatus' in v.prototype);

test('再起動後に同じ roomId へ再接続しても無料回は戻らず、roomId が変わったら戻る', { timeout: 5000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gacha-room-'));
  const file = path.join(dir, 'gacha-viewers.json');
  const make = () => {
    const store = new GachaViewerStore(file, { debounceMs: 0 });
    const m = new Manager(store, { now: Date.now });
    if (typeof m.setConfig === 'function') m.setConfig({ enabled: true, resetMode: 'stream', freePerReset: 1 });
    return { store, m };
  };
  let { store, m } = make();
  m.onStatus({ mode: 'live', roomId: 'R1' }, { mode: 'connecting' });
  const v = store.get('u1', 'ゆうと');
  v.free.used = 1;
  store.changed();
  store.flush();
  m.close?.();
  // 再起動
  ({ store, m } = make());
  m.onStatus({ mode: 'connecting' }, { mode: 'idle' });
  m.onStatus({ mode: 'live', roomId: 'R1' }, { mode: 'connecting' });
  assert.equal(store.get('u1').free.used, 1);
  // 新しい配信
  m.onStatus({ mode: 'ended' }, { mode: 'live' });
  m.onStatus({ mode: 'connecting' }, { mode: 'ended' });
  m.onStatus({ mode: 'live', roomId: 'R2' }, { mode: 'connecting' });
  assert.equal(store.get('u1').free.used, 0);
  m.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});
