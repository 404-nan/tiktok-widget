// AI 用のトークン。値は発行したときだけ返し、ファイルには sha256 だけを残す。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SCOPES = ['read', 'write', 'operate', 'test', 'admin'];
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;

const safeText = (value, max) => String(value ?? '').trim().slice(0, max);

export function hashToken(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest();
}

function hashesEqual(storedHex, digest) {
  let stored;
  try {
    stored = Buffer.from(String(storedHex ?? ''), 'hex');
  } catch {
    return false;
  }
  if (stored.length !== digest.length) return false;
  return crypto.timingSafeEqual(stored, digest);
}

export function publicToken(token) {
  return {
    id: token.id,
    name: token.name,
    tenants: [...token.tenants],
    scopes: [...token.scopes],
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt ?? null,
  };
}

function checkTenants(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!list) throw new Error('配信者は id の一覧で指定してください');
  const tenants = [];
  for (const item of list) {
    const id = String(item ?? '').trim();
    if (!id) continue;
    if (!/^[A-Za-z0-9_*-]{1,64}$/.test(id)) throw new Error('配信者の id の形が正しくありません');
    if (!tenants.includes(id)) tenants.push(id);
  }
  if (!tenants.length) throw new Error('使える配信者を1人以上指定してください');
  return tenants;
}

function checkScopes(value) {
  const list = value == null ? ['read'] : Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!list) throw new Error('権限は一覧で指定してください');
  const scopes = [];
  for (const item of list) {
    const scope = String(item ?? '').trim();
    if (!scope) continue;
    if (!SCOPES.includes(scope)) throw new Error('権限は 読む・設定を変える・操作する・テスト送信・配信者の設定 のどれかです');
    if (!scopes.includes(scope)) scopes.push(scope);
  }
  if (!scopes.length) throw new Error('権限を1つ以上選んでください');
  return scopes;
}

export class AiTokenStore {
  constructor({ dir, file = path.join(dir, 'ai-tokens.json') }) {
    this.dir = dir;
    this.file = file;
    this.tokens = [];
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.tokens = Array.isArray(data.tokens) ? data.tokens.filter((token) => token && token.id && token.hash) : [];
      fs.chmodSync(this.file, 0o600);
    } catch {
      this.tokens = [];
    }
    return this.list();
  }

  list() {
    return this.tokens.map((token) => publicToken(token));
  }

  issue({ name, tenants, scopes, days = DEFAULT_DAYS, expiresAt = null, now = Date.now() } = {}) {
    const tokenName = safeText(name, 80);
    if (!tokenName) throw new Error('名前を入れてください');
    let expiry = expiresAt;
    if (expiry == null) {
      const span = Number(days);
      if (!Number.isInteger(span) || span < 1 || span > 366) throw new Error('期限は 1 日から 366 日までです');
      expiry = new Date(now + span * DAY_MS).toISOString();
    } else {
      const parsed = Date.parse(expiry);
      if (!Number.isFinite(parsed)) throw new Error('期限の形が正しくありません');
      expiry = new Date(parsed).toISOString();
    }
    const value = `twai_${crypto.randomBytes(32).toString('hex')}`;
    const token = {
      id: crypto.randomBytes(8).toString('hex'),
      name: tokenName,
      tenants: checkTenants(tenants),
      scopes: checkScopes(scopes),
      expiresAt: expiry,
      createdAt: new Date(now).toISOString(),
      lastUsedAt: null,
      hash: hashToken(value).toString('hex'),
    };
    this.tokens.push(token);
    this.save();
    return { token: publicToken(token), value };
  }

  revoke(id) {
    const before = this.tokens.length;
    this.tokens = this.tokens.filter((token) => token.id !== id);
    if (before === this.tokens.length) throw new Error('そのトークンは見つかりません');
    this.save();
    return true;
  }

  /**
   * 値を照合する。期限切れは expired。見つからなければ null。
   * 保存してある要約と、timingSafeEqual で比べる。
   */
  authenticate(value, now = Date.now()) {
    const digest = hashToken(value);
    const dummy = hashToken('twai_dummy');
    let found = null;
    const rows = this.tokens.length ? this.tokens : [{ hash: dummy.toString('hex') }];
    for (const token of rows) {
      if (hashesEqual(token.hash, digest)) found = token;
    }
    if (!found || !found.id) return null;
    if (Date.parse(found.expiresAt) <= now) return { expired: true, token: publicToken(found) };
    found.lastUsedAt = new Date(now).toISOString();
    this.save();
    return { expired: false, token: found };
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const body = `${JSON.stringify({ tokens: this.tokens.map((token) => ({ ...token })) }, null, 2)}\n`;
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
  }
}
