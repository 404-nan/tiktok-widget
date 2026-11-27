// テストプロセスが os.tmpdir() の下に mkdtemp で作ったフォルダを覚え、終了時に消す。
// 調べたいときは TW_KEEP_TEST_TMP=1 で残せる。名前の形で探さず、そのプロセスが作った物だけを消す。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// テストの中から直接起こした node にも効くように、子プロセスへ環境変数で引き継ぐ。
const self = fileURLToPath(import.meta.url);
const optionPath = /\s/.test(self) ? JSON.stringify(self) : self;
if (!process.env.NODE_OPTIONS?.includes(self)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--import ${optionPath}`].filter(Boolean).join(' ');
}

const made = new Set();
const rmSync = fs.rmSync;

function remember(dir) {
  if (typeof dir !== 'string') return;
  const tmp = path.resolve(os.tmpdir());
  const full = path.resolve(dir);
  if (full === tmp || full.startsWith(`${tmp}${path.sep}`)) made.add(full);
}

const mkdtempSync = fs.mkdtempSync;
fs.mkdtempSync = function (...args) {
  const dir = mkdtempSync.apply(this, args);
  remember(dir);
  return dir;
};

const mkdtemp = fs.mkdtemp;
fs.mkdtemp = function (...args) {
  const callback = args.at(-1);
  if (typeof callback === 'function') {
    args[args.length - 1] = (error, dir) => {
      if (!error) remember(dir);
      callback(error, dir);
    };
  }
  return mkdtemp.apply(this, args);
};

const promiseMkdtemp = fs.promises.mkdtemp;
fs.promises.mkdtemp = async function (...args) {
  const dir = await promiseMkdtemp.apply(this, args);
  remember(dir);
  return dir;
};

process.on('exit', () => {
  if (process.env.TW_KEEP_TEST_TMP === '1') return;
  // 入れ子になっていたときは深い方から試す。すでに消えていても force: true でよい。
  for (const dir of [...made].sort((a, b) => b.length - a.length)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  made.clear();
});
