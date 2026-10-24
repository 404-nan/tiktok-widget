import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PreparationStore } from '../src/preparation.js';

test('準備の印は時刻を一度だけ保存し、再起動後も読める', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-preparation-'));
  const file = path.join(dir, 'preparation.json');
  let now = 100;
  const first = new PreparationStore(file, () => now);
  assert.equal(first.mark('widgetAt'), true);
  now = 200;
  assert.equal(first.mark('widgetAt'), false);
  first.mark('testedAt');
  first.setAutoConnect(false);
  const second = new PreparationStore(file, () => now);
  assert.deepEqual(second.snapshot(), { selectedAt: null, widgetAt: 100, testedAt: 200, liveAt: null, autoConnect: false });
});
