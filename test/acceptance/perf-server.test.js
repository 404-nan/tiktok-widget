import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER_TOOL = path.join(repoRoot, 'scripts', 'perf', 'server.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-perf-ac-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// 道具が使う一時ディレクトリも tmp の下に寄せ、後片付けを見られるようにする
const work = path.join(tmp, 'work');
fs.mkdirSync(work);
const jsonPath = path.join(tmp, 'server.json');
const run = spawnSync(process.execPath, [SERVER_TOOL, '--quick', '--json', jsonPath], {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: 120000,
  env: { ...process.env, TMPDIR: work, TEMP: work, TMP: work },
});

const findKeys = (v, out = []) => {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push([k, x]); findKeys(x, out); }
  return out;
};

test('AC-2 server.mjs --quick が終了コード 0 か 1 で終わる', () => {
  assert.ok([0, 1].includes(run.status), 'status=' + run.status + ' ' + run.stderr);
  assert.ok(run.stdout.trim().length > 0, '表が出ていない: ' + run.stderr);
});

test('AC-2 表にイベント処理量・メモリ・WebSocket の送信量・書き込みが出る', () => {
  for (const word of ['イベント', 'メモリ', 'WebSocket', '書き込み']) {
    assert.ok(run.stdout.includes(word), '表に「' + word + '」が無い:\n' + run.stdout);
  }
});

test('AC-2 JSON に1イベントあたりの送信バイトが入っている', () => {
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const hit = findKeys(json).find(([k, v]) => /byte/i.test(k) && /per.?event/i.test(k) && typeof v === 'number' && v > 0);
  assert.ok(hit, '1イベントあたりの送信バイト(数値)のキーが無い');
});

test('AC-2 一時ディレクトリだけを使い、後片付けされる', () => {
  assert.ok(fs.existsSync(jsonPath), '道具が動いていない');
  assert.deepEqual(fs.readdirSync(work), []);
});
