// 性能改善の受け入れ条件。連打後の履歴が従来の JSON 形式で保存されることを確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../../src/hub.js';
import { History } from '../../src/history.js';

test('AC-3/AC-6: 連打の履歴は保存回数を増やさず、今までの JSON 形を保つ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-perf-history-'));
  const hub = new Hub();
  const history = new History(hub, dir);
  clearInterval(history.timer);
  let writes = 0;
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = (...args) => { writes += 1; return originalWrite(...args); };
  try {
    hub.setStatus({ mode: 'demo' });
    for (let i = 0; i < 5000; i += 1) {
      hub.publish({ kind: 'gift', user: { id: `u${i % 20}`, name: `利用者${i % 20}` }, gift: { id: '1', name: 'Rose', diamonds: 1, count: 1 }, totalDiamonds: 1, test: true });
    }
    hub.setStatus({ mode: 'idle' });
  } finally {
    fs.writeFileSync = originalWrite;
  }
  assert.equal(writes, 1);
  const files = fs.readdirSync(dir, { withFileTypes: true });
  assert.equal(files.length, 1);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, files[0].name), 'utf8'));
  assert.equal(saved.totals.gifts, 5000);
  assert.ok(Array.isArray(saved.timeline));
  fs.rmSync(dir, { recursive: true, force: true });
});
