// 口の地図（docs/API-INVENTORY.md）が古くならないための見張り。
// コードに登録された経路と AI の道具が、全部一覧に載っていることを確かめる。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const inventory = readFileSync(join(root, 'docs/API-INVENTORY.md'), 'utf8');

function sourceFiles() {
  const files = [join(root, 'server.js')];
  for (const name of readdirSync(join(root, 'src'))) {
    if (name.endsWith('.js')) files.push(join(root, 'src', name));
  }
  return files;
}

test('登録された経路は全部、API 一覧に載っている', () => {
  const missing = [];
  for (const file of sourceFiles()) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/\b(app|admin|r)\.(get|post|put|delete)\('(\/[^']*)'/g)) {
      const full = m[1] === 'admin' ? `/admin/api${m[3]}` : m[3];
      if (full === '/') continue;
      if (!inventory.includes(full)) missing.push(`${full}（${file.split('/').pop()}）`);
    }
  }
  assert.deepEqual(missing, [], `API 一覧に無い経路がある。docs/API-INVENTORY.md に足すこと: ${missing.join(', ')}`);
});

test('AI の道具は全部、API 一覧に載っている', () => {
  const aiApi = readFileSync(join(root, 'src/ai-api.js'), 'utf8');
  const missing = [];
  for (const m of aiApi.matchAll(/tool: '([a-z_]+)'/g)) {
    if (!inventory.includes(m[1])) missing.push(m[1]);
  }
  assert.deepEqual(missing, [], `API 一覧に無い AI の道具がある: ${missing.join(', ')}`);
});
