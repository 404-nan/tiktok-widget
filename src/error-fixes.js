// 直したエラーの印（docs/error-fixes.json）を読み書きし、再発防止テストがあるか検査する。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ERROR_FIXES_FILE = path.join(repoRoot, 'docs', 'error-fixes.json');

function fixesPath(root = repoRoot, file = null) {
  return file ?? path.join(root, 'docs', 'error-fixes.json');
}

/** 直した印の一覧を読む。無い・壊れているときは空（管理画面を止めない） */
export function readErrorFixes({ root = repoRoot, file = null } = {}) {
  try {
    const data = JSON.parse(fs.readFileSync(fixesPath(root, file), 'utf8'));
    return Array.isArray(data?.fixes) ? data.fixes : [];
  } catch {
    return [];
  }
}

/** 直した印を正本へ書く。書き換えは一時ファイルからの差し替えで行う */
export function writeErrorFixes(fixes, { root = repoRoot, file = null } = {}) {
  const target = fixesPath(root, file);
  const rows = Array.isArray(fixes) ? fixes : fixes?.fixes;
  if (!Array.isArray(rows)) throw new Error('fixes は一覧である必要があります');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify({ fixes: rows }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, target);
}

const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const present = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * 直した印1件ずつに、必要な欄と実在する同じ名前のテストがあるか調べる。
 * 返り値は問題の説明の一覧。空なら全部そろっている。
 */
export function checkErrorFixes({ root = repoRoot, file = null } = {}) {
  const target = fixesPath(root, file);
  const errors = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    return [`docs/error-fixes.json を読めません: ${error.message}`];
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.fixes)) return ['docs/error-fixes.json は { "fixes": [] } の形である必要があります'];

  data.fixes.forEach((entry, index) => {
    const label = `fixes[${index}]`;
    for (const key of ['fingerprint', 'summary', 'fixedIn', 'fixedAt']) {
      if (!present(entry?.[key])) errors.push(`${label}: ${key} がありません`);
    }
    if (present(entry?.fingerprint) && !/^[0-9a-f]{12}$/.test(entry.fingerprint)) errors.push(`${label}: fingerprint は12文字の16進数です`);
    if (present(entry?.fixedAt) && !/^\d{4}-\d{2}-\d{2}$/.test(entry.fixedAt)) errors.push(`${label}: fixedAt は YYYY-MM-DD です`);
    if (!present(entry?.test?.file)) errors.push(`${label}: test.file がありません`);
    if (!present(entry?.test?.name)) errors.push(`${label}: test.name がありません`);
    if (!present(entry?.test?.file) || !present(entry?.test?.name)) return;

    const rel = entry.test.file;
    if (path.isAbsolute(rel) || rel.split('/').includes('..')) {
      errors.push(`${label}: test.file はリポジトリの中の相対パスにしてください`);
      return;
    }
    const testFile = path.join(root, rel);
    if (!fs.existsSync(testFile)) {
      errors.push(`${label}: 再発防止テスト ${rel} がありません`);
      return;
    }
    const text = fs.readFileSync(testFile, 'utf8');
    const name = escapeRegExp(entry.test.name);
    const hasTest = new RegExp(`\\btest\\s*\\(\\s*(['"\`])${name}\\1`).test(text);
    if (!hasTest) errors.push(`${label}: ${rel} にテスト「${entry.test.name}」がありません`);
  });
  return errors;
}
