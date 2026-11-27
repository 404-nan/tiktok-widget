// Snapshots are not an authority for revoked URLs. Commit encrypted credential changes to D1 before applying them locally.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const identity = /^[a-f0-9]{64}$/;
const credential = /^[A-Za-z0-9_-]{24}$/;
const tenantId = /^[A-Za-z0-9_-]{1,64}$/;
const pageSize = 100;

export class TenantRevocationError extends Error {}

function check(condition, message) {
  if (!condition) throw new TenantRevocationError(message);
}

function validateChange(id, change) {
  check(tenantId.test(id ?? '') && change && typeof change === 'object' &&
    !Array.isArray(change), '失効記録の配信者または内容の形式が不正です。');
  const names = Object.keys(change);
  const keys = names.length > 0 && names.every((name) =>
    (name === 'key' || name === 'obsKey') && credential.test(change[name] ?? ''));
  const pin = names.length === 2 && /^\d{4}$/.test(change.pin ?? '') &&
    Number.isSafeInteger(change.pinVer) && change.pinVer > 0;
  const removed = names.length === 1 && change.removed === true;
  const enabled = names.length === 1 && typeof change.enabled === 'boolean';
  check(keys || pin || removed || enabled, '失効記録の変更項目が不正です。');
}

function aad(id) {
  return Buffer.from(`tiktok-widget-tenant-revocation-v1:${id}`);
}

function encrypt(id, change, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(id));
  const data = Buffer.concat([cipher.update(JSON.stringify(change), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64url');
}

function decrypt(id, value, key) {
  try {
    const blob = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
    cipher.setAuthTag(blob.subarray(12, 28));
    cipher.setAAD(aad(id));
    return JSON.parse(Buffer.concat([cipher.update(blob.subarray(28)), cipher.final()]).toString('utf8'));
  } catch {
    throw new TenantRevocationError('失効記録を復号できません。台帳と暗号鍵を確認してください。');
  }
}

export async function readRevocationIdentity(dir) {
  let value;
  try {
    value = await readFile(join(dir, 'tenant-revocations.id'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new TenantRevocationError('失効台帳の識別記録を読めません。');
  }
  check(identity.test(value.trim()), '失効台帳の識別記録が不正です。');
  return value.trim();
}

export async function openTenantRevocations(dir, { env = process.env, request = fetch } = {}) {
  const file = env.TW_TENANT_REVOCATIONS_CONFIG;
  const savedIdentity = await readRevocationIdentity(dir);
  const required = env.TW_REQUIRE_TENANT_REVOCATIONS === '1';
  if (required) check(savedIdentity, '本番で失効台帳を有効にした同期データが必要です。');
  if (!file && !savedIdentity && !required) return null;
  check(file && isAbsolute(file), '失効台帳の設定ファイルの絶対パスが必要です。');
  let config;
  try {
    const stat = await lstat(file);
    check(stat.isFile() && (stat.mode & 0o077) === 0, '失効台帳の設定は権限 0600 のファイルが必要です。');
    config = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof TenantRevocationError) throw error;
    throw new TenantRevocationError('失効台帳の設定ファイルを読めません。');
  }
  const { accountId, databaseId, apiToken, encryptionKey } = config ?? {};
  check(/^[a-f0-9]{32}$/.test(accountId ?? '') && uuid.test(databaseId ?? '') &&
    typeof apiToken === 'string' && apiToken.trim() && /^[A-Za-z0-9_-]{43}$/.test(encryptionKey ?? ''),
  '失効台帳のアカウント、DB、API トークンまたは暗号鍵が不正です。');
  const key = Buffer.from(encryptionKey, 'base64url');
  check(key.length === 32 && key.toString('base64url') === encryptionKey, '失効台帳の暗号鍵が不正です。');
  const id = createHash('sha256').update(`${accountId}:${databaseId}:`).update(key).digest('hex');
  check(!savedIdentity || savedIdentity === id, '同期データと失効台帳または暗号鍵が一致しません。');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function query(sql, params, op) {
    let reply;
    let body;
    try {
      reply = await request(url, {
        method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(5_000),
      });
      body = await reply.json();
    } catch {
      throw new TenantRevocationError(`失効台帳の${op}に失敗しました（接続・応答エラー）。`);
    }
    const result = body?.result?.[0];
    check(reply.ok && body?.success === true && result?.success === true && Array.isArray(result.results),
      `失効台帳の${op}に失敗しました（HTTP ${reply.status}）。`);
    return result;
  }

  const changes = new Map();
  let cursor = 0;
  for (;;) {
    const { results } = await query(
      'SELECT seq, tenant_id, payload FROM tenant_revocations WHERE seq > ? ORDER BY seq LIMIT ?',
      [cursor, pageSize], '読み込み');
    check(results.length <= pageSize, '失効台帳のページサイズが不正です。');
    for (const row of results) {
      check(Number.isSafeInteger(row?.seq) && row.seq > cursor, '失効台帳の記録順が不正です。');
      const change = decrypt(row.tenant_id, row.payload, key);
      validateChange(row.tenant_id, change);
      changes.set(row.tenant_id, { ...changes.get(row.tenant_id), ...change });
      cursor = row.seq;
    }
    if (results.length < pageSize) break;
  }
  if (!savedIdentity) {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'tenant-revocations.id'), `${id}\n`, { mode: 0o600, flag: 'wx' });
    } catch {
      throw new TenantRevocationError('失効台帳の識別記録を書き込めません。');
    }
  }
  return {
    changes,
    async record(tenant, change) {
      validateChange(tenant, change);
      const result = await query('INSERT INTO tenant_revocations (tenant_id, payload) VALUES (?, ?)',
        [tenant, encrypt(tenant, change, key)], '書き込み');
      check(result.meta?.changes === 1, '失効台帳の書き込み件数を確認できません。');
    },
  };
}
