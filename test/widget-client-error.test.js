// 配信画面から来る clientError を、画面側は控えめに送り、サーバー側は信じすぎず記録する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createClientErrorReporter } from '../public/widgets/lib/overlay.js';
import { localScenario, startHostedServer } from './helpers/guard-harness.js';

test('画面側の clientError は同じ文を1回だけ送り、1画面10件までにする', () => {
  const sent = [];
  const reporter = createClientErrorReporter({ widget: 'omikuji', send: (msg) => sent.push(msg) });
  for (let i = 0; i < 12; i += 1) reporter.report({ message: `失敗${i}`, source: 'widgets/omikuji/index.html', line: i, col: 1 });
  reporter.report({ message: '失敗0', source: 'widgets/omikuji/index.html', line: 0, col: 1 });
  assert.equal(sent.length, 10);
  assert.equal(sent.filter((msg) => msg.message === '失敗0').length, 1);
  assert.ok(sent.every((msg) => msg.type === 'clientError' && msg.widget === 'omikuji'));
});

function errorRows(dataDir) {
  const dir = path.join(dataDir, 'errors');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^errors-.*\.jsonl$/.test(name))
    .flatMap((name) => fs.readFileSync(path.join(dir, name), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)));
}

async function waitForRows(dataDir, count, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    const rows = errorRows(dataDir);
    if (rows.length >= count) return rows;
    if (Date.now() - started > timeoutMs) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('message', () => resolve(ws));
    ws.once('error', reject);
  });
}

function keyFromUrl(url, suffix) {
  const match = String(url).match(/\/t\/([^/]+)\//);
  assert.ok(match, `${suffix} から鍵の形が取れません`);
  return match[1];
}

test('サーバーは OBS 用接続からの clientError だけを、長さを切り伏せて widget.client として記録する', async () => {
  const scenario = localScenario();
  const hosted = await startHostedServer(scenario);
  const base = await hosted.ready;
  const child = hosted.child;
  try {
    const token = fs.readFileSync(path.join(scenario.dataDir, 'admin-token.txt'), 'utf8').trim();
    const created = await fetch(`${base}/admin/api/tenants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ name: 'エラー確認用' }),
    });
    assert.equal(created.status, 200);
    const { tenant } = await created.json();
    const ownerKey = keyFromUrl(tenant.urls.dashboard, 'dashboard');
    const obsKey = keyFromUrl(tenant.urls.obs, 'obs');

    const obs = await openSocket(`${base.replace('http', 'ws')}/t/${obsKey}/ws`);
    const longMessage = `${'x'.repeat(330)} token=secret123 /t/${obsKey}/widgets/ user@example.com`;
    obs.send(JSON.stringify({ type: 'clientError', widget: 'omikuji', message: longMessage, source: `widgets/omikuji/index.html${'s'.repeat(220)}`, line: 12, col: 3 }));

    const owner = await openSocket(`${base.replace('http', 'ws')}/t/${ownerKey}/ws`);
    owner.send(JSON.stringify({ type: 'clientError', widget: 'owner-only', message: '受けない', source: 'x', line: 1, col: 1 }));
    const preview = await openSocket(`${base.replace('http', 'ws')}/t/${obsKey}/ws?preview=1`);
    preview.send(JSON.stringify({ type: 'clientError', widget: 'preview-only', message: '受けない', source: 'x', line: 1, col: 1 }));

    const rows = await waitForRows(scenario.dataDir, 1);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.kind, 'widget.client');
    assert.equal(row.context.tenant, tenant.id);
    assert.equal(row.context.widget, 'omikuji');
    assert.ok(row.message.length <= 300);
    assert.ok(row.where.file.length <= 200);
    assert.equal(row.where.line, 12);
    const text = JSON.stringify(row);
    assert.equal(text.includes('secret123'), false);
    assert.equal(text.includes(obsKey), false);
    assert.equal(text.includes('user@example.com'), false);
    assert.equal(text.includes('owner-only'), false);
    assert.equal(text.includes('preview-only'), false);
    obs.close();
    owner.close();
    preview.close();
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) await new Promise((resolve) => child.once('exit', resolve));
  }
});
