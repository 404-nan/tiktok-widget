// 部品ごとの版：フォルダの中身と、その部品が読む共有ファイルが変わったときだけ版が変わる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeWidgetVersion, createWidgetVersions } from '../src/widget-versions.js';

function setup() {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-versions-'));
  const w = path.join(publicDir, 'widgets');
  const put = (rel, text) => {
    const full = path.join(w, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  };
  put('alpha/index.html', '<link href="lib/shared.css"><script src="shared.js"></script><h1>alpha</h1>');
  put('alpha/widget.json', '{}');
  put('beta/index.html', '<h1>beta</h1>');
  put('lib/shared.css', 'body{}');
  put('lib/only-alpha.js', 'export const a = 1;');
  put('shared.js', 'import "./lib/only-alpha.js";\nconsole.log("shared");');
  put('lib/unused.js', 'export const u = 0;');
  return { publicDir, put };
}

test('版は安定していて、部品のファイルが変わると変わる', () => {
  const { publicDir, put } = setup();
  const v1 = computeWidgetVersion(publicDir, 'alpha');
  assert.ok(v1?.startsWith('v1:'));
  assert.equal(computeWidgetVersion(publicDir, 'alpha'), v1);
  put('alpha/index.html', '<link href="lib/shared.css"><script src="shared.js"></script><h1>alpha2</h1>');
  assert.notEqual(computeWidgetVersion(publicDir, 'alpha'), v1);
});

test('他の部品や、読んでいない共有ファイルが変わっても版は変わらない', () => {
  const { publicDir, put } = setup();
  const v1 = computeWidgetVersion(publicDir, 'alpha');
  put('beta/index.html', '<h1>beta2</h1>');
  put('lib/unused.js', 'export const u = 1;');
  assert.equal(computeWidgetVersion(publicDir, 'alpha'), v1);
});

test('読んでいる共有ファイル（lib と同階層、lib の中での読み込みも）が変わると版が変わる', () => {
  const { publicDir, put } = setup();
  const v1 = computeWidgetVersion(publicDir, 'alpha');
  put('lib/shared.css', 'body{color:red}');
  const v2 = computeWidgetVersion(publicDir, 'alpha');
  assert.notEqual(v2, v1);
  put('lib/only-alpha.js', 'export const a = 2;');
  assert.notEqual(computeWidgetVersion(publicDir, 'alpha'), v2);
});

test('_baseline は版に入らない。無い部品は null', () => {
  const { publicDir, put } = setup();
  const v1 = computeWidgetVersion(publicDir, 'alpha');
  put('alpha/_baseline/base.png', 'PNGDATA');
  assert.equal(computeWidgetVersion(publicDir, 'alpha'), v1);
  assert.equal(computeWidgetVersion(publicDir, 'gamma'), null);
});

test('createWidgetVersions は変わったときだけ数え直し、まとめて返せる', () => {
  const { publicDir, put } = setup();
  const versions = createWidgetVersions(publicDir);
  const first = versions.versionsOf(['alpha', 'beta', 'gamma']);
  assert.ok(first.alpha && first.beta && !('gamma' in first));
  put('beta/index.html', '<h1>beta3</h1>');
  const second = versions.versionsOf(['alpha', 'beta']);
  assert.equal(second.alpha, first.alpha);
  assert.notEqual(second.beta, first.beta);
});
