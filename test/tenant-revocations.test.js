// The independent credential journal must win over an older standby snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Tenants } from '../src/tenants.js';
import { openTenantRevocations } from '../src/tenant-revocations.js';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'tw-revocations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = {
    accountId: 'b'.repeat(32), databaseId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    apiToken: 'fixture-d1', encryptionKey: Buffer.alloc(32, 20).toString('base64url'),
  };
  const file = join(dir, 'config.json');
  await writeFile(file, JSON.stringify(config), { mode: 0o600 });
  const env = { TW_TENANT_REVOCATIONS_CONFIG: file };
  const rows = [];
  const status = { read: 200, write: 200 };
  const request = async (url, options) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`);
    assert.equal(options.headers.authorization, 'Bearer fixture-d1');
    const { sql, params } = JSON.parse(options.body);
    let result;
    if (sql.startsWith('SELECT')) {
      if (status.read !== 200) return Response.json({}, { status: status.read });
      result = { results: rows.filter((row) => row.seq > params[0]).slice(0, params[1]) };
    } else {
      assert.match(sql, /VALUES \(\?, \?\)/);
      if (status.write !== 200) return Response.json({}, { status: status.write });
      rows.push({ seq: rows.length + 1, tenant_id: params[0], payload: params[1] });
      result = { results: [], meta: { changes: 1 } };
    }
    return Response.json({ success: true, result: [{ success: true, ...result }] });
  };
  return { dir, rows, status, config, file, env, request };
}

test('待機機は古い同期データより失効台帳を優先し、有効なOBS URLを変えない', async (t) => {
  const { dir, env, request, rows } = await fixture(t);
  const primary = join(dir, 'primary');
  const standby = join(dir, 'standby');
  const store = await openTenantRevocations(primary, { env, request });
  const live = new Tenants({ dir: primary, revocations: store });
  const account = live.create({ name: 'fixture' });
  const removed = live.create({ name: 'remove fixture' });
  const disabled = live.create({ name: 'disable fixture' });
  const { key: previous, obsKey: unchanged, pinVer: previousPinVersion } = account;
  await cp(primary, standby, { recursive: true });

  await Promise.all([live.rekey(account.id, 'key'), live.repin(account.id), live.remove(removed.id),
    live.updateFromAdmin(disabled.id, { enabled: false })]);
  assert.equal(rows.length, 4);
  assert.ok(rows.every(({ payload }) => !payload.includes(account.key) && !payload.includes(previous)));

  const latest = await openTenantRevocations(standby, {
    env: { ...env, TW_REQUIRE_TENANT_REVOCATIONS: '1' }, request,
  });
  const restored = new Tenants({ dir: standby, revocations: latest });
  assert.equal(restored.get(account.id).key, account.key);
  assert.equal(restored.byKey(previous), null);
  assert.equal(restored.byKey(unchanged)?.role, 'obs');
  assert.equal(restored.get(account.id).pinVer, previousPinVersion + 1);
  assert.equal(restored.byShortId(removed.shortId), null);
  assert.equal(restored.get(disabled.id).enabled, false);
});

test('失効台帳を確認できなければ、待機機は起動せず本番は未記録の鍵変更を確定しない', async (t) => {
  const { dir, env, request, rows, status, config, file } = await fixture(t);
  const data = join(dir, 'data');
  const other = join(dir, 'other');
  await mkdir(other);
  const required = { ...env, TW_REQUIRE_TENANT_REVOCATIONS: '1' };
  await assert.rejects(openTenantRevocations(other, { env: required, request }), /同期データ/);
  const ledger = await openTenantRevocations(data, { env, request });
  const live = new Tenants({ dir: data, revocations: ledger });
  const account = live.create({ name: 'fixture' });
  const previous = account.key;
  await assert.rejects(openTenantRevocations(data, { env: {}, request }), /設定ファイル/);
  status.read = status.write = 503;
  await assert.rejects(live.rekey(account.id, 'key'), /書き込み.*503/);
  assert.equal(live.get(account.id).key, previous);
  assert.equal(rows.length, 0);
  await assert.rejects(openTenantRevocations(data, { env: required, request }), /読み込み.*503/);
  status.read = status.write = 200;
  await live.rekey(account.id, 'key');
  await writeFile(file, JSON.stringify({ ...config, encryptionKey: Buffer.alloc(32, 21).toString('base64url') }));
  await assert.rejects(openTenantRevocations(data, { env: required, request }), /一致しません/);
  await writeFile(file, JSON.stringify(config));
  rows[0].payload = Buffer.alloc(30).toString('base64url');
  await assert.rejects(openTenantRevocations(data, { env: required, request }), /復号できません/);
});

test('待機機への切替後も削除した配信者の紹介コードは使えない', async (t) => {
  const { dir, env, request } = await fixture(t);
  const primary = join(dir, 'primary');
  const standby = join(dir, 'standby');
  const live = new Tenants({ dir: primary, revocations: await openTenantRevocations(primary, { env, request }) });
  const referrer = live.create({ name: 'deleted fixture' });
  const referee = live.create({ name: 'remaining fixture' });
  const code = live.issueReferralCode(referrer.id);
  await cp(primary, standby, { recursive: true });
  await live.remove(referrer.id);

  const restored = new Tenants({ dir: standby, revocations: await openTenantRevocations(standby, { env, request }) });
  assert.equal(restored.get(referrer.id), null);
  assert.throws(() => restored.applyReferral(referee.id, code), /紹介コードは見つかりません/);
});
