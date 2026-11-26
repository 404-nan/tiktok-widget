// 起動した時の製品版数とコミットを返す窓口。git コマンドは呼ばず、
// 公開リポジトリの .git をファイルとして読むだけにして起動を軽く保つ。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_VERSION } from './version.js';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));

function readTrimmed(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

function resolveInside(base, name) {
  return path.resolve(base, name);
}

function gitDirectory(root) {
  const dotGit = path.join(root, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return dotGit;
  } catch {
    return null;
  }
  const text = readTrimmed(dotGit);
  if (!text?.startsWith('gitdir:')) return null;
  return resolveInside(root, text.slice('gitdir:'.length).trim());
}

function commonDirectory(gitdir) {
  const common = readTrimmed(path.join(gitdir, 'commondir'));
  return common ? resolveInside(gitdir, common) : gitdir;
}

function readRef(gitdirs, ref) {
  for (const dir of gitdirs) {
    const direct = readTrimmed(path.join(dir, ...ref.split('/')));
    if (direct) return direct.split(/\s+/, 1)[0];
  }
  for (const dir of gitdirs) {
    const packed = readTrimmed(path.join(dir, 'packed-refs'));
    if (!packed) continue;
    for (const line of packed.split('\n')) {
      if (!line || line.startsWith('#') || line.startsWith('^')) continue;
      const [commit, name] = line.trim().split(/\s+/, 2);
      if (name === ref) return commit;
    }
  }
  return null;
}

export function readCommitFromGit(root = defaultRoot) {
  try {
    const gitdir = gitDirectory(root);
    if (!gitdir) return null;
    const common = commonDirectory(gitdir);
    const gitdirs = [...new Set([gitdir, common])];
    let head = null;
    for (const dir of gitdirs) {
      head = readTrimmed(path.join(dir, 'HEAD'));
      if (head) break;
    }
    if (!head) return null;
    const commit = head.startsWith('ref:') ? readRef(gitdirs, head.slice(4).trim()) : head;
    return /^[0-9a-f]{40,64}$/i.test(commit ?? '') ? commit : null;
  } catch {
    return null;
  }
}

export function buildInfo({ env = process.env, root = defaultRoot } = {}) {
  const forced = typeof env.TW_COMMIT === 'string' ? env.TW_COMMIT.trim() : '';
  return {
    version: PRODUCT_VERSION,
    commit: forced || readCommitFromGit(root),
  };
}

export const BUILD_INFO = buildInfo();
