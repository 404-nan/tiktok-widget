import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const knowledgeDir = path.join(root, 'docs', 'knowledge');
const expected = ['README.md', 'architecture.md', 'environments.md', 'dev-flow.md', 'operating.md', 'minecraft.md', 'design.md', 'decisions.md', 'performance.md'];

function markdownFiles() {
  return ['AGENTS.md', ...expected.map((name) => path.join('docs', 'knowledge', name))];
}

function relativeLinks(text) {
  return [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1].split('#', 1)[0])
    .filter((link) => link && !/^[a-z][a-z0-9+.-]*:/i.test(link) && !link.startsWith('#'));
}

test('AGENTS.md は短く、知識文書の相対リンクは実在する', () => {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.ok(agents.split(/\r?\n/).length <= 60);
  for (const file of markdownFiles()) {
    const full = path.join(root, file);
    assert.ok(fs.existsSync(full), `${file} がありません`);
    for (const link of relativeLinks(fs.readFileSync(full, 'utf8'))) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(full), link)), `${file}: ${link} がありません`);
    }
  }
});

test('知識文書は8ファイルある', () => {
  assert.deepEqual(fs.readdirSync(knowledgeDir).filter((name) => name.endsWith('.md')).sort(), [...expected].sort());
});

test('AGENTS.md と知識文書に鍵らしい文字列がない', () => {
  const text = markdownFiles().map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(text, /sk-|ghp_|eyJ/i);
  assert.doesNotMatch(text, /[A-Za-z0-9]{40,}/);
});
