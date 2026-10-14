import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'public/dashboard/dev-features.js',
  'public/widgets/media.js',
  'public/widgets/gacha.js',
  'public/widgets/sounds.js',
];

function loadAcorn() {
  const require = createRequire(import.meta.url);
  try { return require('acorn'); } catch {}
  const candidates = [
    '/home/lul/lulos/frontend/node_modules/acorn/package.json',
    '/home/lul/.hermes/hermes-agent/node_modules/acorn/package.json',
  ];
  for (const pkg of candidates) {
    if (!fs.existsSync(pkg)) continue;
    try { return createRequire(pkg)('acorn'); } catch {}
  }
  return null;
}

test('新しい公開 JS は ES5 として解析できる', () => {
  const acorn = loadAcorn();
  assert.ok(acorn, 'acorn が見つかりません');
  for (const file of files) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotThrow(() => acorn.parse(code, { ecmaVersion: 5, sourceType: 'script' }), file);
  }
});
