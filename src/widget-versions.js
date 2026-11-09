// ウィジェットごとの版。部品フォルダの中身と、その部品が読む共有ファイルから数える。
// 版が変われば、開いている画面は自分だけを読み直せる（部分更新の第1段）。
// 共有ファイルの読みは文章の中の参照をたどる（lib/ への参照と、同階層の共有 js/css。
// lib の中での読み込みもたどる）。_baseline（基準の絵）は版に入れない。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = new Set(['.html', '.js', '.css', '.json']);
const LIB_REF = /lib\/([A-Za-z0-9._-]+\.[A-Za-z0-9]+)/g;
const SIBLING_REF = /(?:src|href)="(?!\/|https?:|data:|#)([A-Za-z0-9._-]+\.(?:js|css))"/g;
const BARE_IMPORT = /(?:from|import)\s*\(?\s*['"](?:\.\/)?([A-Za-z0-9._-]+\.js)['"]/g;

const hashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

function listFiles(dir, base, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name === '_baseline') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(full, base, out);
    else if (ent.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

// 部品が読むファイルの一覧（public からの相対パス → 実パス）。参照は最大6段までたどる
function filesOfWidget(publicDir, id) {
  const widgetsDir = path.join(publicDir, 'widgets');
  const folder = path.join(widgetsDir, id);
  const files = new Map();
  for (const rel of listFiles(folder, widgetsDir)) files.set(path.join('widgets', rel), path.join(widgetsDir, rel));
  const readText = (abs) => {
    try {
      return TEXT_EXT.has(path.extname(abs)) ? fs.readFileSync(abs, 'utf8') : null;
    } catch {
      return null;
    }
  };
  for (let round = 0; round < 6; round++) {
    let added = 0;
    for (const [rel, abs] of [...files]) {
      const text = readText(abs);
      if (!text) continue;
      for (const m of text.matchAll(LIB_REF)) {
        const key = path.join('widgets', 'lib', m[1]);
        if (!files.has(key)) { files.set(key, path.join(widgetsDir, 'lib', m[1])); added++; }
      }
      const dir = path.dirname(rel);
      if (/^widgets\/[^/]+$/.test(dir)) {
        for (const m of text.matchAll(SIBLING_REF)) {
          const key = path.join('widgets', m[1]);
          if (!files.has(key)) { files.set(key, path.join(widgetsDir, m[1])); added++; }
        }
      }
      if (dir === path.join('widgets', 'lib') || dir === 'widgets') {
        for (const m of text.matchAll(BARE_IMPORT)) {
          const key = path.join(dir, m[1]);
          if (!files.has(key)) { files.set(key, path.join(widgetsDir, dir === 'widgets' ? m[1] : path.join('lib', m[1]))); added++; }
        }
      }
    }
    if (!added) break;
  }
  return files;
}

export function computeWidgetVersion(publicDir, id) {
  const widgetsDir = path.join(publicDir, 'widgets');
  const folder = path.join(widgetsDir, id);
  let stat;
  try {
    stat = fs.statSync(folder);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return null;
  const files = filesOfWidget(publicDir, id);
  const parts = [];
  for (const rel of [...files.keys()].sort()) {
    let content;
    try {
      content = fs.readFileSync(files.get(rel), 'utf8');
    } catch {
      continue;
    }
    parts.push(rel + ':' + hashOf(content));
  }
  if (!parts.length) return null;
  return 'v1:' + hashOf(parts.join('\n'));
}

// フォルダと共有置き場の「名前・大きさ・更新時刻」の並びで安い指紋を作り、変わったときだけ版を数え直す
export function createWidgetVersions(publicDir) {
  const widgetsDir = path.join(publicDir, 'widgets');
  const cache = new Map();
  const fingerprint = () => {
    const rows = [];
    const scan = (dir, base) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (ent.name === '_baseline') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) scan(full, base);
        else if (ent.isFile()) {
          try {
            const st = fs.statSync(full);
            rows.push(path.relative(base, full) + ':' + st.size + ':' + Math.round(st.mtimeMs));
          } catch { /* 消えた直後は次回に回す */ }
        }
      }
    };
    scan(widgetsDir, widgetsDir);
    return hashOf(rows.sort().join('\n'));
  };
  let lastFingerprint = null;
  const versionOf = (id) => {
    const fp = fingerprint();
    if (fp !== lastFingerprint) {
      cache.clear();
      lastFingerprint = fp;
    }
    if (!cache.has(id)) cache.set(id, computeWidgetVersion(publicDir, id));
    return cache.get(id);
  };
  const versionsOf = (ids) => {
    const out = {};
    for (const id of ids) {
      const v = versionOf(id);
      if (v) out[id] = v;
    }
    return out;
  };
  return { versionOf, versionsOf };
}
