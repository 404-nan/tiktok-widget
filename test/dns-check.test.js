// 本番へ接続せず、DNS 診断がトンネルと公開先の両方を確かめることを検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const check = path.resolve(import.meta.dirname, '../deploy/server/dns-check.sh');
const hosts = ['region1.v2.argotunnel.com', 'widget.lul.works'];
const srv = '_v2-origintunneld._tcp.argotunnel.com';

test('トンネルまたは公開先を名前解決できないと DNS 診断が失敗する', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-dns-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const queries = path.join(dir, 'queries');
  fs.writeFileSync(path.join(dir, 'getent'), `#!/bin/sh
[ "$1" = ahosts ] || exit 2
printf '%s\\n' "$2" >> "$QUERIES"
[ "$2" != "$FAILED_HOST" ]
`, { mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'timeout'), `#!/bin/sh
[ "$1" = 5s ] || exit 2
shift
exec "$@"
`, { mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'resolvectl'), `#!/bin/sh
[ "$1" = --type=SRV ] && [ "$2" = query ] || exit 2
printf '%s\\n' "$3" >> "$QUERIES"
[ "$3" != "$FAILED_HOST" ] && [ "$USE_DIG" != 1 ]
`, { mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'dig'), `#!/bin/sh
[ "$1" = +noall ] && [ "$2" = +answer ] && [ "$3" = -t ] && [ "$4" = SRV ] || exit 2
printf 'dig %s\\n' "$5" >> "$QUERIES"
if [ "$5" != "$FAILED_HOST" ]; then
  printf '%s. 60 IN SRV 1 1 7844 edge.example.\\n' "$5"
fi
`, { mode: 0o700 });

  for (const [failedHost, useDig] of [['', false], ...hosts.map((host) => [host, false]), [srv, false], ['', true]]) {
    fs.writeFileSync(queries, '');
    const result = spawnSync('/bin/bash', [check], {
      env: { ...process.env, PATH: dir, QUERIES: queries, FAILED_HOST: failedHost, USE_DIG: useDig ? '1' : '0' },
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.ifError(result.error);
    const expectedQueries = [...hosts, srv, ...(useDig || failedHost === srv ? [`dig ${srv}`] : [])];
    assert.deepEqual(fs.readFileSync(queries, 'utf8').trim().split('\n'), expectedQueries);
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
