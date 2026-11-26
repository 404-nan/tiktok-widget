// 公開ウィジェットの HTML が、twReplaySocket を使うスクリプトより先に replay-socket.js を読むことを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const widgetsRoot = path.resolve(import.meta.dirname, '../public/widgets');

function htmlFiles(dir = widgetsRoot) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...htmlFiles(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(file);
  }
  return files.sort();
}

// フォルダ型の画面は /widgets/<名前>.html で開く。ブラウザから見た相対パスは、この住所を基準に解く。
function pageUrl(file) {
  const rel = path.relative(widgetsRoot, file).split(path.sep).join('/');
  const parts = rel.split('/');
  if (parts.length === 2 && parts[1] === 'index.html') return `http://widgets.test/widgets/${parts[0]}.html`;
  return `http://widgets.test/widgets/${rel}`;
}

function scriptFile(src, baseUrl) {
  const url = new URL(src, baseUrl);
  if (url.origin !== 'http://widgets.test' || !url.pathname.startsWith('/widgets/')) return null;
  const rel = decodeURIComponent(url.pathname.slice('/widgets/'.length));
  const direct = path.join(widgetsRoot, rel);
  if (fs.existsSync(direct)) return direct;
  const alias = rel.match(/^([A-Za-z0-9_-]+)\.js$/);
  if (alias) {
    const folded = path.join(widgetsRoot, alias[1], `${alias[1]}.js`);
    if (fs.existsSync(folded)) return folded;
  }
  return null;
}

function scriptEntries(file) {
  const html = fs.readFileSync(file, 'utf8');
  const baseUrl = pageUrl(file);
  const entries = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1];
    const inline = match[2];
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
    let text = inline;
    if (src) {
      const resolved = scriptFile(src, baseUrl);
      text = resolved ? fs.readFileSync(resolved, 'utf8') : '';
    }
    entries.push({ src, text });
  }
  return entries;
}

test('twReplaySocket を使う HTML は replay-socket.js を先に読んでいる', () => {
  const missing = [];
  for (const file of htmlFiles()) {
    let loaded = false;
    for (const entry of scriptEntries(file)) {
      const isReplaySocket = entry.src != null && /(^|\/)lib\/replay-socket\.js(?:[?#].*)?$/.test(entry.src);
      if (isReplaySocket) {
        loaded = true;
        continue;
      }
      if (!loaded && entry.text.includes('twReplaySocket')) {
        missing.push(`${path.relative(widgetsRoot, file)} (${entry.src ?? 'inline script'})`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
