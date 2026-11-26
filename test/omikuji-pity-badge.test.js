// おみくじの天井バッジ: 状態の pityLeft（天井まであと何回）を、数値のときだけ「あと◯回」で出す。
// 実物と同じ public/widgets/gacha.js を、DOM の代わりに最小の入れ物を渡して動かして確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../public/widgets/gacha.js', import.meta.url), 'utf8');

// おみくじの画面を最小限まねる。要素は id で引ける入れ物だけ
function loadOmikuji() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id,
        textContent: '',
        hidden: true,
        style: { setProperty() {} },
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {},
        removeAttribute() {},
        appendChild() {},
      });
    }
    return els.get(id);
  };
  let socket = null;
  const sandbox = {
    document: {
      body: { getAttribute: () => 'omikuji', classList: { add() {}, remove() {}, contains: () => false } },
      getElementById: (id) => el(id),
      querySelector: () => null,
      createElement: () => ({ setAttribute() {}, appendChild() {}, style: {}, classList: { add() {} } }),
    },
    location: { pathname: '/widgets/omikuji.html', search: '', protocol: 'http:', host: '127.0.0.1:3939' },
    WebSocket: class { constructor() { socket = this; } },
    XMLHttpRequest: class { open() {} send() {} },
    setInterval: () => 0,
    clearInterval() {},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(new URL('../public/widgets/lib/replay-socket.js', import.meta.url), 'utf8'), sandbox);
  vm.runInNewContext(code, sandbox);
  return {
    badge: el('pityBadge'),
    count: el('pityLeft'),
    send: (msg) => socket.onmessage({ data: JSON.stringify(msg) }),
  };
}

test('pityLeft が数値のときは、残り回数のバッジを出す（0 でも出す）', () => {
  const { badge, count, send } = loadOmikuji();
  assert.equal(badge.hidden, true, '状態が来るまでは出さない');
  send({ type: 'omikuji', phase: 'idle', pityLeft: 3 });
  assert.equal(badge.hidden, false);
  assert.equal(count.textContent, '3');
  send({ type: 'omikuji', phase: 'reveal', pityLeft: 0 });
  assert.equal(badge.hidden, false, '0 のときも「あと0回」を出す');
  assert.equal(count.textContent, '0');
});

test('pityLeft が null や未定義、数値でないときは出さない', () => {
  const { badge, count, send } = loadOmikuji();
  send({ type: 'omikuji', phase: 'idle', pityLeft: 2 });
  assert.equal(badge.hidden, false);
  send({ type: 'omikuji', phase: 'idle', pityLeft: null });
  assert.equal(badge.hidden, true, 'null になったら引っ込める');
  send({ type: 'omikuji', phase: 'idle' });
  assert.equal(badge.hidden, true, '未定義でも出さない');
  send({ type: 'omikuji', phase: 'idle', pityLeft: '3' });
  assert.equal(badge.hidden, true, '文字列は数値ではない');
  assert.equal(count.textContent, '2', '数の表示は最後に来た数値のまま');
});
