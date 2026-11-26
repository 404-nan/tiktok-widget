// 管理 API のエラー一覧と詳細を、合言葉の内側で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startLocalServer } from '../scripts/perf/lib/process.mjs';

function jstDay(ms) {
  const shifted = new Date(ms + 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function row({ ts, fingerprint, kind, message, repeat = 0, tenant = 'tabc123' }) {
  return {
    ts,
    service: 'raikone',
    env: 'dev',
    version: '1.4.1',
    level: 'error',
    kind,
    where: { file: 'src/tiktok.js', fn: 'connect', line: 231 },
    message,
    cause: '',
    stack: ['at connect (src/tiktok.js:231:13)'],
    context: { tenant, widget: 'omikuji', op: 'gifts.refresh' },
    fingerprint,
    ...(repeat ? { repeat } : {}),
  };
}

test('/admin/api/errors は合言葉が必要で、種類ごとの集計と fingerprint の詳細を返す', async () => {
  const server = await startLocalServer(process.cwd());
  try {
    const now = Date.now();
    const dir = path.join(server.dataDir, 'errors');
    fs.mkdirSync(dir, { recursive: true });
    const rows = [
      row({ ts: new Date(now - 60_000).toISOString(), fingerprint: 'aaaaaaaabbbb', kind: 'tiktok.connect', message: '古い失敗' }),
      row({ ts: new Date(now - 10_000).toISOString(), fingerprint: 'bbbbbbbbcccc', kind: 'store.write', message: '新しい失敗', repeat: 2 }),
    ];
    fs.writeFileSync(path.join(dir, `errors-${jstDay(now)}.jsonl`), rows.map((line) => JSON.stringify(line)).join('\n') + '\n', { mode: 0o600 });

    const denied = await fetch(`${server.baseUrl}/admin/api/errors?range=24h`);
    assert.equal(denied.status, 401);

    const token = fs.readFileSync(path.join(server.dataDir, 'admin-token.txt'), 'utf8').trim();
    const headers = { 'x-admin-token': token };
    const res = await fetch(`${server.baseUrl}/admin/api/errors?range=24h`, { headers });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.groups.length, 2);
    assert.equal(body.total, 4); // 新しい失敗は本体1回 + repeat 2回、古い失敗1回
    assert.ok(body.generatedAt);
    assert.equal(body.groups[0].kind, 'store.write');
    assert.equal(body.groups[0].count, 3);
    assert.equal(body.groups[0].status, 'open');
    assert.equal(body.groups[1].kind, 'tiktok.connect');

    const detail = await fetch(`${server.baseUrl}/admin/api/errors/bbbbbbbbcccc?limit=50`, { headers });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.rows.length, 1);
    assert.equal(detailBody.rows[0].message, '新しい失敗');
    assert.deepEqual(detailBody.rows[0].stack, ['at connect (src/tiktok.js:231:13)']);
    assert.equal(detailBody.rows[0].context.tenant, 'tabc123');
  } finally {
    await server.stop();
  }
});
