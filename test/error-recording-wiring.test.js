// journal に残している console.warn/error の場所では、同じ失敗を JSONL のエラー記録にも残す。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = ['server.js', ...fs.readdirSync(path.join(root, 'src')).filter((name) => name.endsWith('.js')).map((name) => path.join('src', name))];

test('console.warn/error のある場所は errorLog へも記録する（error-log 自身の再帰防止だけ例外）', () => {
  const missing = [];
  for (const rel of files) {
    if (rel === 'src/error-log.js') continue; // 記録失敗を記録し続ける無限ループを防ぐ場所
    const lines = fs.readFileSync(path.join(root, rel), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/console\.(warn|error)\s*\(/.test(line)) return;
      const around = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 5)).join('\n');
      if (!/recordError\s*\(|errorLog\.record\s*\(/.test(around)) missing.push(`${rel}:${index + 1}`);
    });
  }
  assert.deepEqual(missing, []);
});

test('プランの申し込みは、読み書きの失敗を plan.request.io、通知の失敗を plan.request.notify に残す', () => {
  const source = fs.readFileSync(path.join(root, 'src/plan-requests.js'), 'utf8');
  assert.match(source, /recordError\(err, \{ kind: 'plan\.request\.io'/);
  assert.match(source, /recordError\(err, \{ kind: 'plan\.request\.io', level: 'warn'/);
  assert.match(source, /recordError\(err, \{ kind: 'plan\.request\.notify'/);
});
