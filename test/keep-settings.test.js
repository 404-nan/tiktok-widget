import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Tenants } from '../src/tenants.js';
import { createStore } from '../src/config.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-keep-'));

test('更新（作り直し・読み直し）しても、配信者の設定はそのまま残る', () => {
  const dir = tmp();
  const t = new Tenants({ dir });
  const a = t.create({ name: 'A' });
  const file = path.join(t.dataDir(a.id), 'config.yaml');
  const store = createStore(file);
  store.load();
  const items = [{ label: '歌う', weight: 2, image: 'media/uploads/x.png' }, '変顔*3', 'セーフ'];
  assert.equal(store.setValue(['roulettes', 'mine'], { name: '自分の', gifts: ['Rose'], items }).ok, true);
  const before = fs.readFileSync(file, 'utf8');
  // サーバーを作り直す（git pull して再起動したのと同じ）
  const again = new Tenants({ dir });
  const after = createStore(path.join(again.dataDir(a.id), 'config.yaml')).load();
  assert.equal(fs.readFileSync(file, 'utf8'), before); // 読んだだけでは書き換えない
  assert.deepEqual(after.doc.toJS().roulettes.mine.items, items);
  // 新しい項目は読み込んだときに既定値で補うだけ（ファイルには書かない）
  assert.equal(after.config.roulettes.mine.duration > 0, true);
  assert.equal(again.get(a.id).pin, a.pin);
  assert.equal(again.get(a.id).key, a.key);
});

test('起動のたびに data/backups/ に設定を写す', () => {
  const dir = tmp();
  const t = new Tenants({ dir });
  const a = t.create({ name: 'A' });
  createStore(path.join(t.dataDir(a.id), 'config.yaml')).setValue(['alerts', 'default', 'duration'], 9);
  const again = new Tenants({ dir });
  assert.ok(again.backupDir);
  assert.ok(fs.existsSync(path.join(again.backupDir, 'tenants.json')));
  assert.match(fs.readFileSync(path.join(again.backupDir, 'tenants', a.id, 'config.yaml'), 'utf8'), /duration: 9/);
});

test('設定の置き場（data/・config.yaml）は Git に入らない', () => {
  const out = execFileSync('git', ['check-ignore', 'data/tenants.json', 'data/tenants/x/config.yaml', 'config.yaml', 'media/uploads/a.png'], { encoding: 'utf8' });
  assert.equal(out.trim().split('\n').length, 4);
});
