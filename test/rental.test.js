import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RentalState, rentalForHandle, shouldAutoConnect } from '../src/rental.js';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-rental-'));
  const base = Date.parse('2026-10-12T12:00:00Z');
  const reservations = [
    { id: 'before', userId: '1', start: new Date(base + 6 * 60_000).toISOString(), end: new Date(base + 66 * 60_000).toISOString(), status: 'confirmed' },
    { id: 'now', userId: '1', start: new Date(base - 4 * 60_000).toISOString(), end: new Date(base + 56 * 60_000).toISOString(), status: 'confirmed' },
    { id: 'next', userId: '2', start: new Date(base + 2 * 3600_000).toISOString(), end: new Date(base + 3 * 3600_000).toISOString(), status: 'tentative' },
    { id: 'cancelled', userId: '1', start: new Date(base - 30 * 60_000).toISOString(), end: new Date(base + 30 * 60_000).toISOString(), status: 'cancelled' },
    { id: 'ended', userId: '1', start: new Date(base - 3 * 3600_000).toISOString(), end: new Date(base - 2 * 3600_000).toISOString(), status: 'done' },
  ];
  fs.writeFileSync(path.join(dir, 'reservations.json'), JSON.stringify({ reservations }));
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify({ 1: { userId: '1', handle: 'MiXeD' }, 2: { userId: '2' } }));
  fs.writeFileSync(path.join(dir, 'servers.json'), JSON.stringify({ servers: [{ id: 's1' }] }));
  return { dir, base };
}

test('貸し出しの枠を開始5分前・最中・終了後で判定する', () => {
  const { dir, base } = fixture();
  const state = new RentalState({ dir, interval: 60_000 });
  state.refresh(base);
  assert.equal(state.snapshot.now.id, 'now');
  assert.equal(state.snapshot.next.id, 'before');
  assert.equal(state.forHandle('mixed', base).now.id, 'now');
  assert.equal(state.forHandle('MIXED', base + 67 * 60_000).now, null);
  assert.equal(state.forHandle('missing', base).now, null);
  state.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('同じ TikTok の ID を持つ人が2人いても枠を返す', () => {
  const { dir, base } = fixture();
  const state = new RentalState({ dir, interval: 60_000 });
  const matched = rentalForHandle(state.snapshot, 'mixed', base);
  assert.equal(matched.now.id, 'now');
  state.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('貸し出しファイルが壊れたときは前の結果を使う', () => {
  const { dir, base } = fixture();
  const state = new RentalState({ dir, interval: 60_000 });
  const before = state.snapshot;
  fs.writeFileSync(path.join(dir, 'accounts.json'), '{');
  state.refresh(base);
  assert.equal(state.snapshot, before);
  state.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('自動接続は枠内・待ち時間・回数・手動切断を守る', () => {
  const slot = { id: 'x', start: 1_000_000, end: 2_000_000 };
  assert.equal(shouldAutoConnect({ now: 700_000, slot, status: { mode: 'idle' } }), true);
  assert.equal(shouldAutoConnect({ now: 800_000, slot, status: { mode: 'idle' }, lastAttempt: 700_000 }), false);
  assert.equal(shouldAutoConnect({ now: 1_000_000, slot, status: { mode: 'live' } }), false);
  assert.equal(shouldAutoConnect({ now: 1_000_000, slot, status: { mode: 'error' }, attempts: 40 }), false);
  assert.equal(shouldAutoConnect({ now: 1_000_000, slot, status: { mode: 'error' }, manuallyStopped: true }), false);
});
