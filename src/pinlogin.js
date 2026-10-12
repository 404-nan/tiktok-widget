// 4桁の数字でダッシュボードを開く（短い URL /d/<短いID>）。
// 4桁は当てずっぽうで当たりやすいので、間違いの回数を3つの段で数えて止める:
//   配信者ごと: 5回間違えたら15分止める
//   入れてくる場所（IP）ごと: 15分に20回間違えたら15分止める
//   全体: 15分に200回間違えたら、全員の数字入力を15分止める（多くの場所から一斉に試されたとき）
// 正しく入れたら、署名付きの長く残るクッキーを渡し、次からは数字なしで開ける。
// 数字を作り直すとクッキーの版（pinVer）が変わり、前のクッキーは使えなくなる。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LIMITS = {
  tenant: { max: 5, lockMs: 15 * 60_000 },
  ip: { max: 20, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  global: { max: 200, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
};
export const COOKIE_DAYS = 180;

/** 間違いの回数を数える入れもの。key ごとに { fails, first, lockedUntil } */
class Counter {
  constructor({ max, windowMs = Infinity, lockMs }) {
    Object.assign(this, { max, windowMs, lockMs });
    this.map = new Map();
  }
  lockedUntil(key, now) {
    const e = this.map.get(key);
    return e && e.lockedUntil > now ? e.lockedUntil : 0;
  }
  fail(key, now) {
    let e = this.map.get(key);
    if (!e || (e.lockedUntil && e.lockedUntil <= now) || now - e.first > this.windowMs) e = { fails: 0, first: now, lockedUntil: 0 };
    e.fails += 1;
    if (e.fails >= this.max) e.lockedUntil = now + this.lockMs;
    this.map.set(key, e);
    // 古いものを掃除（メモリが増え続けないように）
    if (this.map.size > 5000) for (const [k, v] of this.map) if (v.lockedUntil <= now && now - v.first > Math.min(this.windowMs, 3600_000)) this.map.delete(k);
    return e;
  }
  clear(key) {
    this.map.delete(key);
  }
}

export function createPinLogin({ dir, limits = LIMITS, now = () => Date.now() }) {
  const secret = loadSecret(dir);
  const byTenant = new Counter(limits.tenant);
  const byIp = new Counter(limits.ip);
  const all = new Counter(limits.global);

  const sign = (text) => crypto.createHmac('sha256', secret).update(text).digest('base64url');

  return {
    /**
     * 数字を確かめる。返り値:
     *   { ok: true } / { ok: false, reason: 'wrong', left } / { ok: false, reason: 'locked', until }
     */
    check(tenant, pin, ip) {
      const t = now();
      const until = Math.max(byTenant.lockedUntil(tenant.id, t), byIp.lockedUntil(ip, t), all.lockedUntil('all', t));
      if (until) return { ok: false, reason: 'locked', until };
      const good = typeof pin === 'string' && /^\d{4}$/.test(pin) && crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(String(tenant.pin).padStart(4, '0')));
      if (good) {
        byTenant.clear(tenant.id);
        return { ok: true };
      }
      const e = byTenant.fail(tenant.id, t);
      byIp.fail(ip, t);
      all.fail('all', t);
      const until2 = Math.max(byTenant.lockedUntil(tenant.id, t), byIp.lockedUntil(ip, t), all.lockedUntil('all', t));
      if (until2) return { ok: false, reason: 'locked', until: until2 };
      return { ok: false, reason: 'wrong', left: limits.tenant.max - e.fails };
    },

    /** ない短い ID を試されたとき（ID の当てずっぽう探しも、場所ごと・全体の回数に入れる）。止まっていれば期限を返す */
    miss(ip) {
      const t = now();
      byIp.fail(ip, t);
      all.fail('all', t);
      return Math.max(byIp.lockedUntil(ip, t), all.lockedUntil('all', t));
    },

    /** クッキーの中身: <配信者 id>.<版>.<期限>.<署名> */
    cookieFor(tenant) {
      const exp = now() + COOKIE_DAYS * 86400_000;
      const body = `${tenant.id}.${tenant.pinVer ?? 1}.${exp}`;
      return `${body}.${sign(body)}`;
    },

    /** クッキーがこの配信者の今の数字で作られたものか */
    cookieOk(tenant, value) {
      if (typeof value !== 'string') return false;
      const parts = value.split('.');
      if (parts.length !== 4) return false;
      const [id, ver, exp, sig] = parts;
      const want = sign(`${id}.${ver}.${exp}`);
      if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
      return id === tenant.id && Number(ver) === (tenant.pinVer ?? 1) && Number(exp) > now();
    },
  };
}

// 署名の鍵は data/pin-cookie-secret.txt（なければ作る）
function loadSecret(dir) {
  const file = path.join(dir, 'pin-cookie-secret.txt');
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch {}
  const s = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${s}\n`, { mode: 0o600 });
  return s;
}

/** Cookie ヘッダーから1つ取り出す */
export function readCookie(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
