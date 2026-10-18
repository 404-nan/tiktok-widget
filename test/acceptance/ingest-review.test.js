// ingest 3巡目レビューのHTTP境界を確かめる受け入れテスト。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHostedServer } from '../helpers/guard-harness.js';

const roots = [];
const children = [];
after(() => {
  for (const child of children) child.kill();
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

test('文字列の null / undefined を鍵として送っても、専用403ではなく404になる', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-review-http-'));
  roots.push(root);
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'config.yaml'), '');
  fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({
    tenants: [{ id: 'aaa', name: 'A', key: 'a'.repeat(24), obsKey: 'b'.repeat(24), enabled: true, widgets: [], access: {} }],
    global: { access: {} },
  }));
  const env = { TW_CONFIG: path.join(root, 'config.yaml'), TW_DATA: dataDir, TW_ENV: 'dev', TW_RESUME_CONNECT: '0', TW_ADMIN_TOKEN: 'test-admin-token' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const server = await startHostedServer({ env });
    children.push(server.child);
    const base = await server.ready;
    try {
      for (const key of ['null', 'undefined']) {
        const res = await fetch(`${base}/in/${key}`, { method: 'POST', body: '{}' });
        assert.equal(res.status, 404, key);
      }
      return;
    } catch (error) {
      server.child.kill();
      if (attempt === 2) throw error;
    }
  }
});
