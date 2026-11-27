// 本番へ接続せず、DNS 診断がトンネルと公開先の両方を確かめることを検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const check = path.resolve(import.meta.dirname, '../deploy/server/dns-check.sh');
const hosts = ['region1.v2.argotunnel.com', 'widget.lul.works'];

test('トンネルまたは公開先を名前解決できないと DNS 診断が失敗する', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-dns-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const queries = path.join(dir, 'queries');
  fs.writeFileSync(path.join(dir, 'getent'), `#!/bin/sh
[ "$1" = ahosts ] || exit 2
printf '%s\\n' "$2" >> "$QUERIES"
[ "$2" != "$FAILED_HOST" ]
`, { mode: 0o700 });

  for (const failedHost of ['', ...hosts]) {
    fs.writeFileSync(queries, '');
    const result = spawnSync('bash', [check], {
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, QUERIES: queries, FAILED_HOST: failedHost },
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.ifError(result.error);
    assert.deepEqual(fs.readFileSync(queries, 'utf8').trim().split('\n'), hosts);
    if (failedHost) {
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`DNS 異常: ${failedHost}`));
      assert.match(result.stderr, /LAN DNS \(192\.168\.11\.60\)/);
    } else {
      assert.equal(result.status, 0);
      assert.match(result.stdout, /名前を引けました/);
      assert.equal(result.stderr, '');
    }
  }
});
