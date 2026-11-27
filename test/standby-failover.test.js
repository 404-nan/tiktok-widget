// 待機機の同期と公開先の切替を、偽の本番・Cloudflare で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRoute } from '../deploy/standby/standby-route.mjs';

const script = path.resolve(import.meta.dirname, '../deploy/standby/standby.sh');
const recordId = 'a'.repeat(32);
const primary = '11111111-1111-1111-1111-111111111111';
const standby = '22222222-2222-2222-2222-222222222222';
const marker = '33333333-3333-3333-3333-333333333333';
const tunnel = (id) => id + '.cfargotunnel.com';
const tunnelToken = (id) => Buffer.from(JSON.stringify({ t: id })).toString('base64');
const settings = {
  PUBLIC_HOST: 'widget.example.test', STANDBY_PROBE_HOST: 'probe.example.test',
  CF_DNS_RECORD_ID: recordId, CF_ZONE_ID: 'b'.repeat(32), CF_API_TOKEN: 'fixture-dns',
  PRIMARY_TUNNEL_ID: primary, STANDBY_TUNNEL_ID: standby, TUNNEL_TOKEN: tunnelToken(standby),
};

function router(options = {}) {
  let current = options.current ?? tunnel(primary);
  let edits = 0;
  const request = async (url, requestOptions) => {
    const { hostname, pathname, searchParams } = new URL(url);
    if (hostname === 'api.cloudflare.com') {
      assert.equal(pathname, `/client/v4/zones/${settings.CF_ZONE_ID}/dns_records/${recordId}`);
      assert.equal(requestOptions.headers.authorization, 'Bearer fixture-dns');
      if (requestOptions.method === 'PATCH') {
        assert.deepEqual(JSON.parse(requestOptions.body), { content: tunnel(standby) });
        current = tunnel(standby);
        edits++;
      }
      return Response.json({
        success: true, result: { id: recordId, type: 'CNAME', proxied: true, name: settings.PUBLIC_HOST, content: current },
      });
    }
    assert.ok(searchParams.has('standby-check'));
    assert.equal(requestOptions.headers.authorization, undefined);
    if (pathname === '/healthz') {
      if (!options.primaryUp && current === tunnel(primary)) {
        return new Response('unavailable', { status: 530, headers: { 'cf-ray': 'fixture' } });
      }
      return Response.json({ ok: true, live: options.primaryUp ? 1 : 0 });
    }
    if (hostname === settings.STANDBY_PROBE_HOST && options.badCanary) return new Response('not found', { status: 404 });
    if (hostname === settings.PUBLIC_HOST && options.badPublicMarker) return new Response('old origin');
    return new Response(marker);
  };
  return { route: createRoute({ env: { ...settings, ...options.env }, request, pause: async () => {} }), edits: () => edits };
}

test('公開停止を確認し、待機機の固有応答を検証して同じURLを一度だけ切り替える', async () => {
  const { route, edits } = router();
  assert.equal(await route.preflight(), 'primary');
  await route.switchRoute(marker);
  assert.equal(await route.preflight(), 'standby');
  await route.switchRoute(marker);
  assert.equal(edits(), 1);
});

test('旧本番が稼働中・別のトンネル・待機機が未確認なら公開先を変更しない', async () => {
  const live = router({ primaryUp: true });
  await assert.rejects(live.route.preflight(), /公開停止/);
  await assert.rejects(live.route.switchRoute(marker), /公開停止/);
  const wrongRecord = router({ current: tunnel(marker) });
  await assert.rejects(wrongRecord.route.preflight(), /未知のトンネル/);
  const wrongToken = router({ env: { TUNNEL_TOKEN: tunnelToken(primary) } });
  await assert.rejects(wrongToken.route.preflight(), /トークン.*一致しません/);
  const down = router({ badCanary: true });
  await assert.rejects(down.route.switchRoute(marker), /待機機固有/);
  assert.deepEqual([live.edits(), wrongRecord.edits(), wrongToken.edits(), down.edits()], [0, 0, 0, 0]);
});

test('DNS更新後に別のサーバーが返答しても成功扱いや自動巻き戻しにしない', async () => {
  const { route, edits } = router({ badPublicMarker: true });
  await assert.rejects(route.switchRoute(marker), /待機機固有/);
  assert.equal(edits(), 1);
});

test('初回以降も同期し、壊れた同期と古いデータで待機機を昇格させない', (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'tw-failover-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, 'standby');
  const source = path.join(root, 'primary');
  const bin = path.join(root, '.local/bin');
  const files = (...parts) => path.join(base, ...parts);
  const sourceData = (...p) => path.join(source, 'data', ...p);
  const write = (p, text) => fs.writeFileSync(p, text);
  const commit = 'e'.repeat(40);
  const rsync = execFileSync('sh', ['-c', 'command -v rsync'], { encoding: 'utf8' }).trim();
  fs.mkdirSync(base, { mode: 0o700 });
  fs.mkdirSync(sourceData('backups'), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  write(files('deps.commit'), commit + '\n');
  write(sourceData('admin-token.txt'), 'fixture-admin');
  const tenants = JSON.stringify({ tenants: [{ id: 'fixture-tenant' }] });
  write(sourceData('tenants.json'), tenants);
  write(sourceData('gift-log.txt'), 'old');
  write(sourceData('backups/ignored'), 'fixture');
  write(sourceData('partial.tmp-123'), 'unfinished');
  write(path.join(source, '.env'), 'not part of the backup');
  write(path.join(source, 'config.yaml'), 'fixture: true');
  const executable = (name, code) => fs.writeFileSync(path.join(bin, name), '#!/bin/bash\n' + code, { mode: 0o700 });
  executable('ssh', '[[ -z $TUNNEL_TOKEN && -z $CF_API_TOKEN ]] || exit 96; printf "%s\\n" "$FIXTURE_REF"');
  executable('rsync', [
    '[[ -z $TUNNEL_TOKEN && -z $CF_API_TOKEN ]] || exit 95',
    '[[ $FIXTURE_TRANSFER_FAIL != 1 ]] || exit 23',
    'args=()',
    'for a in "$@"; do',
    '  if [[ $a == primary.example.test:* ]]; then a="$FIXTURE_SOURCE/"; fi',
    '  args+=("$a")',
    'done',
    'exec "' + rsync + '" "${args[@]}"',
  ].join('\n'));
  const mock = path.join(root, 'mock.mjs');
  write(mock, `
    const { PUBLIC_HOST, CF_DNS_RECORD_ID } = process.env;
    globalThis.fetch = async (url) => {
      if (new URL(url).hostname !== 'api.cloudflare.com') {
        return new Response('unavailable', { status: 530, headers: { 'cf-ray': 'fixture' } });
      }
      return Response.json({ success: true, result: {
        name: PUBLIC_HOST, id: CF_DNS_RECORD_ID, type: 'CNAME', proxied: true, content: '${tunnel(primary)}'
      } });
    };
  `);
  const env = {
    ...process.env, ...settings, HOME: root, STANDBY_DIR: base, PRIMARY_SSH: 'primary.example.test',
    NODE_OPTIONS: `--import=${mock}`, FIXTURE_SOURCE: source, FIXTURE_REF: commit,
  };
  const verify = (args, status = 0, extra) => {
    const res = spawnSync('bash', [script, ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 15_000 });
    assert.equal(res.status, status, res.error?.message ?? res.stdout + res.stderr);
    assert.doesNotMatch(res.stdout + res.stderr, /fixture-admin|fixture-dns/);
    return res.stdout + res.stderr;
  };
  verify(['sync']);
  const first = fs.readlinkSync(files('current'));
  for (const name of ['.env', 'data/backups', 'data/partial.tmp-123']) assert.ok(!fs.existsSync(files(first, name)));
  assert.match(verify(['sync'], 1, { FIXTURE_TRANSFER_FAIL: '1' }), /standby\/sync\/transfer.*23/);
  assert.equal(fs.readlinkSync(files('current')), first);
  write(sourceData('tenants.json'), 'corrupt');
  assert.match(verify(['sync'], 1), /standby\/sync\/validate/);
  assert.equal(fs.readlinkSync(files('current')), first);
  write(sourceData('tenants.json'), tenants);
  write(sourceData('gift-log.txt'), 'newer');
  verify(['sync']);
  assert.notEqual(fs.readlinkSync(files('current')), first);
  assert.equal(fs.readFileSync(files('current/data/gift-log.txt'), 'utf8'), 'newer');
  write(files('current/stamp'), `1 ${commit}\n`);
  assert.match(verify(['promote', '--primary-fenced'], 1), /期限外/);
  assert.equal(fs.existsSync(files('data')), false);
  verify(['promote'], 1);
  write(files('promoted'), `${marker} ${commit}\n`);
  assert.match(verify(['sync'], 0, { FIXTURE_TRANSFER_FAIL: '1' }), /旧本番からは同期しません/);
});
