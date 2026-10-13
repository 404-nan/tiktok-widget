import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPinLogin, readCookie, LIMITS } from '../src/pinlogin.js';
import { Tenants } from '../src/tenants.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-pin-'));
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, add: (ms) => (t += ms) };
};

test('配信者を追加すると短い ID と 4桁の数字ができ、作り直すと数字と版が変わる', () => {
  const t = new Tenants({ dir: tmp() });
  const a = t.create({ name: 'A' });
  assert.match(a.pin, /^\d{4}$/);
  assert.match(a.shortId, /^[a-z2-9]{6}$/);
  assert.equal(t.byShortId(a.shortId).id, a.id);
  assert.equal(t.byShortId('nope'), null);
  const old = a.pinVer;
  t.repin(a.id);
  assert.equal(a.pinVer, old + 1);
  const again = new Tenants({ dir: t.dir });
  assert.equal(again.get(a.id).pin, a.pin);
});

test('前の形のファイルにも、読み込んだときに短い ID と数字が足される', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'tenants.json'), JSON.stringify({ tenants: [{ id: 'old', name: '前から', key: 'k'.repeat(24), obsKey: 'o'.repeat(24), enabled: true, widgets: ['alerts', 'chats', 'goals'], access: {} }] }));
  new Tenants({ dir });
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'tenants.json'), 'utf8')).tenants[0];
  assert.match(saved.pin, /^\d{4}$/);
  assert.ok(saved.shortId);
  assert.equal(saved.key, 'k'.repeat(24)); // 今までの鍵はそのまま
});

test('正しい数字で開け、5回間違えると15分止まり、止まっている間は正しい数字でもだめ', () => {
  const c = clock();
  const p = createPinLogin({ dir: tmp(), now: c.now });
  const t = { id: 'a', pin: '0427', pinVer: 1 };
  assert.equal(p.check(t, '0427', '1.1.1.1').ok, true);
  for (let i = 1; i <= 4; i++) assert.deepEqual(p.check(t, '1111', `9.9.9.${i}`), { ok: false, reason: 'wrong', left: 5 - i });
  assert.equal(p.check(t, '1111', '9.9.9.5').reason, 'locked');
  assert.equal(p.check(t, '0427', '1.1.1.1').reason, 'locked');
  c.add(LIMITS.tenant.lockMs + 1);
  assert.equal(p.check(t, '0427', '1.1.1.1').ok, true);
});

test('同じ場所（IP）から何人分も試すと、その場所が止まる', () => {
  const p = createPinLogin({ dir: tmp() });
  for (let i = 0; i < LIMITS.ip.max; i++) p.check({ id: `t${i}`, pin: '0000', pinVer: 1 }, '1234', '6.6.6.6');
  assert.equal(p.check({ id: 'new', pin: '0000', pinVer: 1 }, '0000', '6.6.6.6').reason, 'locked');
  assert.equal(p.check({ id: 'new', pin: '0000', pinVer: 1 }, '0000', '7.7.7.7').ok, true);
});

test('ばらばらの場所から一斉に試されると、全体で止まる', () => {
  const p = createPinLogin({ dir: tmp(), limits: { ...LIMITS, global: { max: 10, windowMs: 60_000, lockMs: 60_000 } } });
  for (let i = 0; i < 10; i++) p.check({ id: `t${i}`, pin: '0000', pinVer: 1 }, '1234', `10.0.0.${i}`);
  assert.equal(p.check({ id: 'x', pin: '0000', pinVer: 1 }, '0000', '8.8.8.8').reason, 'locked');
});

test('ない短い ID を何度も試しても場所ごとに止まる', () => {
  const p = createPinLogin({ dir: tmp() });
  let until = 0;
  for (let i = 0; i < LIMITS.ip.max; i++) until = p.miss('5.5.5.5');
  assert.ok(until > 0);
});

test('クッキーは署名つきで、ほかの配信者・作り直した後・書き換えたものは通らない', () => {
  const dir = tmp();
  const p = createPinLogin({ dir });
  const t = { id: 'a', pin: '0427', pinVer: 1 };
  const v = p.cookieFor(t);
  assert.equal(p.cookieOk(t, v), true);
  assert.equal(createPinLogin({ dir }).cookieOk(t, v), true); // 再起動しても使える
  assert.equal(p.cookieOk({ ...t, id: 'b' }, v), false);
  assert.equal(p.cookieOk({ ...t, pinVer: 2 }, v), false);
  assert.equal(p.cookieOk(t, v.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'))), false);
  assert.equal(p.cookieOk(t, 'a.1.99999999999999.x'), false);
  assert.equal(readCookie(`x=1; twd_ab=${encodeURIComponent(v)}`, 'twd_ab'), v);
});
