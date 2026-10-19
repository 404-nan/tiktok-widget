// 配信テンプレートの完成条件を、設定ファイルと HTTP API の外側から確かめる。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { test } from 'node:test';
import * as cfg from '../../src/config.js';
import { checkChanges } from '../../src/ai.js';
import { createRuntime } from '../../src/runtime.js';
import { loadTemplates } from '../../src/templates.js';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-templates-'));

function serverFor({ tenant = false, entitled = () => true } = {}) {
  const dir = tempDir();
  const file = path.join(dir, 'config.yaml');
  const state = { widgets: tenant ? ['alerts'] : null, template: null };
  const rt = createRuntime({
    id: tenant ? 'tenant-test' : 'local',
    store: cfg.createStore(file),
    dataDir: dir,
    mediaDirs: [],
    entitled,
    info: () => tenant ? { mode: 'tenant', id: 'tenant-test', widgets: state.widgets, template: state.template } : { mode: 'local' },
    setWidgets: tenant ? (widgets) => { state.widgets = widgets; } : null,
    setTemplate: tenant ? (template) => { state.template = template; } : null,
  });
  const app = express();
  app.use(express.json());
  app.use(rt.router);
  return { dir, file, rt, app, state };
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function call(server, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('3つのテンプレートは検証でき、Minecraft を変更しない', () => {
  const templates = loadTemplates();
  assert.deepEqual(Object.keys(templates).sort(), ['bakkin', 'bougai', 'endurance']);
  for (const template of Object.values(templates)) {
    assert.equal(template.id, template.id.replace(/[^a-z0-9_-]/g, ''));
    assert.ok(template.name && template.desc && template.flow);
    assert.equal(template.changes.some((change) => change.path === 'minecraft' || change.path.startsWith('minecraft.')), false);
    const checked = checkChanges(template.changes);
    assert.deepEqual(checked.errors, []);
    const result = cfg.applyChanges(fs.readFileSync(cfg.EXAMPLE_PATH, 'utf8'), checked.changes);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.warnings, []);
    assert.deepEqual([...new Set(template.changes.map((change) => change.path.split('.')[0]))].sort(), [...new Set(template.widgets)].sort());
  }
});

test('一覧・プレビュー・適用・元戻しは設定文字を守る', async () => {
  const setup = serverFor();
  const server = await listen(setup.app);
  try {
    const before = fs.readFileSync(setup.file, 'utf8');
    const listed = await call(server, '/api/templates');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 3);
    const preview = await call(server, '/api/templates/preview', { id: 'bakkin' });
    assert.equal(preview.status, 200);
    assert.equal(fs.readFileSync(setup.file, 'utf8'), before);
    assert.ok(preview.body.rows.some((row) => row.kind === 'create' || row.kind === 'change'));

    const applied = await call(server, '/api/templates/apply', { id: 'bakkin', changes: [{ op: 'delete', path: 'theme' }] });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.ok, true);
    assert.match(fs.readFileSync(setup.file, 'utf8'), /罰ゲーム/);
    const undone = await call(server, '/api/ai/undo', {});
    assert.equal(undone.status, 200);
    assert.equal(fs.readFileSync(setup.file, 'utf8'), before);
  } finally {
    server.close();
    await setup.rt.close();
  }
});

test('テナントは使うものを外さず、使えないものを skip にする', async () => {
  const setup = serverFor({ tenant: true, entitled: (section) => section !== 'cutins' });
  const server = await listen(setup.app);
  try {
    const preview = await call(server, '/api/templates/preview', { id: 'bougai' });
    assert.equal(preview.status, 200);
    assert.ok(preview.body.rows.some((row) => row.kind === 'skip' && row.section === 'cutins'));
    const applied = await call(server, '/api/templates/apply', { id: 'bougai' });
    assert.equal(applied.status, 200);
    assert.ok(setup.state.widgets.includes('alerts'));
    assert.ok(setup.state.widgets.includes('wins'));
    assert.ok(!setup.state.widgets.includes('cutins'));
    assert.equal(setup.state.template, 'bougai');
  } finally {
    server.close();
    await setup.rt.close();
  }
});

test('配信中は確認なしで変更せず、id と変更本文を信じない', async () => {
  const setup = serverFor();
  const server = await listen(setup.app);
  try {
    setup.rt.hub.setStatus({ mode: 'live' });
    const before = fs.readFileSync(setup.file, 'utf8');
    assert.equal((await call(server, '/api/templates/apply', { id: 'bougai', confirmLive: false })).status, 409);
    assert.equal(fs.readFileSync(setup.file, 'utf8'), before);
    assert.equal((await call(server, '/api/templates/apply', { id: 'unknown' })).status, 404);
    assert.equal((await call(server, '/api/templates/apply', { id: 'bougai', changes: [{ op: 'delete', path: 'theme' }], confirmLive: true })).status, 200);
    assert.ok(cfg.createStore(setup.file).load().config.wins.default);
  } finally {
    server.close();
    await setup.rt.close();
  }
});
