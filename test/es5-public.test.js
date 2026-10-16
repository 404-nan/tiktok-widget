import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'public/dashboard/dev-features.js',
  'public/widgets/media.js',
  'public/widgets/gacha.js',
  'public/widgets/slot.js',
  'public/widgets/lib/slot-core.js',
  'public/widgets/sounds.js',
];

test('新しい公開 JS は ES5 として解析できる', () => {
  for (const file of files) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotThrow(() => acorn.parse(code, { ecmaVersion: 5, sourceType: 'script' }), file);
  }
});
