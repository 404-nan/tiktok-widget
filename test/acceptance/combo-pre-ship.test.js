// 本番前レビューの指摘を、公開ウィジェットの実スクリプトのつなぎ方で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const page = fs.readFileSync(path.join(root, 'public/widgets/combo.html'), 'utf8');
const script = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];

function element() {
  const classes = new Set();
  return {
    textContent: '',
    firstChild: null,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name),
    },
    setAttribute() {},
    appendChild(child) { this.firstChild = child; },
    removeChild() { this.firstChild = null; },
  };
}

async function browser() {
  const nodes = {
    panel: element(), waiting: element(), avatar: element(), sender: element(),
    count: element(), gift: element(), total: element(), 'end-text': element(),
  };
  const timers = [];
  const sockets = [];
  const context = {
    console,
    location: { pathname: '/widgets/combo.html', protocol: 'http:', host: '127.0.0.1:3940' },
    document: { getElementById: (id) => nodes[id] },
    window: {},
    fetch: async () => ({ ok: true, json: async () => ({ now: Date.now(), active: [], last: null }) }),
    WebSocket: function WebSocket() { sockets.push(this); },
    setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.cleared = true; },
    Date,
  };
  context.window = context;
  vm.runInNewContext(script, context, { filename: 'public/widgets/combo.html' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sockets.length, 1);
  return { nodes, timers, socket: sockets[0] };
}

function receive(socket, message) {
  socket.onmessage({ data: JSON.stringify(message) });
}

function runTimer(timers, delay) {
  const timer = timers.find((item) => item.delay === delay && !item.cleared);
  assert.ok(timer, `${delay}ms の表示タイマーがある`);
  timer.cleared = true;
  timer.callback();
}

test('レビュー1: body と stage は透明で panel だけが不透明', () => {
  assert.match(page, /body\s*\{[^}]*background\s*:\s*transparent/i);
  assert.match(page, /\.stage\s*\{[^}]*background\s*:\s*transparent/i);
  assert.match(page, /\.panel\s*\{[^}]*background\s*:\s*#111113/i);
});

test('レビュー2: 本物の WebSocket の終了イベントを同じ回数でも重複排除しない', async () => {
  const view = await browser();
  const user = { id: 'u1', name: 'たろう' };
  receive(view.socket, { type: 'combo', event: { id: 'hit-1', kind: 'hit', user, count: 2, total: 2, tier: 'blue' } });
  receive(view.socket, { type: 'combo', event: { id: 'end-1', kind: 'end', user, count: 2, total: 2, tier: 'blue' } });
  runTimer(view.timers, 1800);
  receive(view.socket, { type: 'combo', event: { id: 'end-2', kind: 'end', user, count: 2, total: 2, tier: 'blue' } });
  assert.equal(view.nodes['end-text'].textContent, 'コンボ終了');
  assert.match(page, /event\.id|event\.endedAt/);
  assert.match(page, /delete seen\[/);
});

test('レビュー2: テスト送信の終了カードも表示する', async () => {
  const view = await browser();
  const user = { id: 'test-user', name: 'テスト' };
  receive(view.socket, { type: 'combo', test: true, event: { id: 'test-hit', kind: 'hit', user, count: 2, total: 2, tier: 'blue' } });
  runTimer(view.timers, 1800);
  receive(view.socket, { type: 'combo', test: true, event: { id: 'test-end', kind: 'end', user, count: 2, total: 2, tier: 'blue' } });
  assert.equal(view.nodes['end-text'].textContent, 'コンボ終了');
});

test('レビュー3: 空の snapshot を受けたら表示中のパネルを消す', async () => {
  const view = await browser();
  receive(view.socket, { type: 'combo', event: { id: 'hit-1', kind: 'hit', user: { id: 'u1', name: 'たろう' }, count: 2, total: 2, tier: 'blue' } });
  assert.equal(view.nodes.panel.classList.contains('show'), true);
  receive(view.socket, { type: 'combo', combo: { active: [], last: null } });
  assert.equal(view.nodes.panel.classList.contains('show'), false);
  assert.equal(view.nodes.count.textContent, '');
});

test('レビュー4: live の snapshot を先に描かず、受信イベントを順番に表示する', async () => {
  const view = await browser();
  const user = { id: 'u1', name: 'たろう' };
  receive(view.socket, { type: 'combo', combo: { active: [{ user, count: 3, total: 3, tier: 'green', expiresAt: Date.now() + 10000 }], last: null }, event: { id: 'hit-1', kind: 'hit', user, count: 2, total: 2, tier: 'blue' } });
  assert.equal(view.nodes.count.textContent, '×2');
  assert.ok(page.indexOf('if (message.event) enqueue') < page.indexOf('else drawState(message.combo)'));
});
