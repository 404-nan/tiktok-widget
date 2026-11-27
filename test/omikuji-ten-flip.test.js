// おみくじ10連の「札が1枚ずつ裏から表へ返る表示」の合格条件：
// 10連はいつもこの表示（裏＝おみくじの字、表＝見出し・運勢・名前・朱印）で、1枚ずつ時間差で返る。
// 大吉の札だけ、舞台側の決まりで返る動きと金の光が長くなる。終われば印は消える。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// public/widgets/gacha.js が要る最小限の画面の代わり
function makeElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    attrs: {},
    _text: '',
    hidden: false,
    className: '',
    offsetWidth: 100,
    style: { setProperty() {} },
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) { if (force) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(child) { this.children.push(child); return child; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; },
  };
  Object.defineProperty(el, 'textContent', {
    get() {
      if (!this.children.length) return this._text;
      return this.children.map((c) => c.textContent).join('');
    },
    set(v) { this._text = String(v); this.children = []; },
  });
  return el;
}

function loadWidget() {
  const byId = new Map();
  const body = makeElement('body');
  body.getAttribute = (k) => (k === 'data-kind' ? 'omikuji' : null);
  const document = {
    body,
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeElement());
      return byId.get(id);
    },
    createElement(tag) { return makeElement(tag); },
    querySelector() { return null; },
  };
  const sockets = [];
  class FakeWebSocket {
    constructor(url) { this.url = url; sockets.push(this); }
  }
  class FakeXHR {
    open() {}
    send() {}
  }
  const sandbox = {
    document,
    location: { pathname: '/widgets/omikuji.html', search: '', protocol: 'http:', host: 'localhost' },
    WebSocket: FakeWebSocket,
    XMLHttpRequest: FakeXHR,
    setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener() {},
    innerWidth: 640, innerHeight: 500,
  };
  vm.runInNewContext(read('public/widgets/gacha.js'), sandbox);
  const ws = sockets[sockets.length - 1];
  const send = (data) => ws.onmessage({ data: JSON.stringify({ type: 'omikuji', durations: { rollMs: 0, revealMs: 6000, doneMs: 1200 }, ...data }) });
  return { byId, send };
}

const tier = (id, label) => ({ tier: { id, label }, stick: 1, forced: false });
const plainResults = [tier('kichi', '吉'), tier('suekichi', '末吉'), tier('kyo', '凶'), tier('chukichi', '中吉'), tier('shokichi', '小吉'), tier('kichi', '吉'), tier('suekichi', '末吉'), tier('daikyo', '大凶'), tier('kichi', '吉'), tier('chukichi', '中吉')];
const goldResults = [...plainResults];
goldResults[4] = tier('daikichi', '大吉');
const trigger = { kind: 'gift', user: { id: 'u1', name: 'ためし太郎' } };

test('10連は大吉が無くても裏から表へ返る札で並び、1枚ずつ時間差で返る', () => {
  const { byId, send } = loadWidget();
  send({ phase: 'ten', results: plainResults, trigger });
  const stage = byId.get('stage');
  assert.equal(stage.getAttribute('data-ten'), 'flip');
  const cells = byId.get('ten').children;
  assert.equal(cells.length, 10);
  const flip = cells[0].children[0];
  assert.equal(flip.className, 'flip');
  assert.equal(flip.style.animationDelay, '0.05s');
  assert.equal(cells[9].children[0].style.animationDelay, '4.1s');
  const [back, front] = flip.children;
  assert.equal(back.className, 'face back');
  assert.equal(back.children[0].textContent, 'おみくじ');
  assert.equal(front.className, 'face front');
  const [head, result, foot, seal] = front.children;
  assert.equal(head.textContent, 'おみくじ');
  assert.equal(result.textContent, '吉');
  assert.equal(result.className, 'm-result len1');
  assert.equal(foot.textContent, 'ためし太郎');
  assert.equal(seal.className, 'm-seal');
  // 終了の段階でも返った札のまま。待機に戻ると印も札も消える
  send({ phase: 'done', results: plainResults, trigger });
  assert.equal(stage.getAttribute('data-ten'), 'flip');
  send({ phase: 'idle', results: null, trigger: null });
  assert.equal(stage.getAttribute('data-ten'), null);
  assert.equal(byId.get('ten').children.length, 0);
  assert.equal(byId.get('ten').hidden, true);
});

test('大吉の札は data-tier が大吉で、表の運勢も大吉', () => {
  const { byId, send } = loadWidget();
  send({ phase: 'ten', results: goldResults, trigger });
  const cells = byId.get('ten').children;
  assert.equal(cells[4].getAttribute('data-tier'), 'daikichi');
  assert.equal(cells[4].children[0].children[1].children[1].textContent, '大吉');
  assert.equal(cells[0].getAttribute('data-tier'), 'kichi');
});

test('舞台側の決まり：横4:縦3と回転の動き、大吉だけ長く見せる決まりが omikuji の画面にある', () => {
  const html = read('public/widgets/omikuji/index.html');
  assert.match(html, /\.stage\[data-ten="flip"\] \{ width: 480px; height: 360px; \}/);
  assert.match(html, /@keyframes tenflip/);
  assert.match(html, /\.stage\[data-ten="flip"\] \.ten \{ inset: 54px 10px 10px;/);
  // 大吉の札だけ：返る動きが通常（.55s）より長く、金の光の明滅が付く
  assert.match(html, /\.stage\[data-ten="flip"\] \.ten-slip\[data-tier="daikichi"\] \.flip \{ animation-duration: 1\.15s; \}/);
  assert.match(html, /\.stage\[data-ten="flip"\] \.ten-slip\[data-tier="daikichi"\] \.face\.front \{ animation: tenglow 1\.6s ease-in-out infinite alternate; \}/);
  assert.match(html, /@keyframes tenglow \{ from \{ box-shadow: 0 8px 18px rgba\(0, 0, 0, \.34\), 0 0 14px rgba\(255, 196, 0, \.35\); \} to \{ box-shadow: 0 8px 18px rgba\(0, 0, 0, \.34\), 0 0 34px rgba\(255, 196, 0, \.75\); \} \}/);
  // 画面と説明を同じ形に保つ（2026-11-25 に本番ファイルでだけ消された分）
  const widgetsReadme = read('public/widgets/README.md');
  assert.match(widgetsReadme, /大吉の札だけ、返る動きと金の光を長くして見せる/);
});
