// おみくじのまとめ引きの回数を、設定 tenCount で変えられることの確認。
// 既定は10で今まで通り。tenGifts（専用ギフト）の回数と、tenBatch（まとめ）の境目が tenCount に追随する。
// 前面の札の文言も、結果の件数に追随する（実物の public/widgets/gacha.js を最小の DOM で動かして確かめる）。
// 検品の直し: 設定の説明文に回数の固定数字が残っていないこと、結果が最大30件でも札が舞台に収まることも確かめる。
// 収まりは、10連の表示がフリップ表示（試作v3）に変わったため、フリップ側の寸法（舞台 480x360・行は均等割り）で計算する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Gacha } from '../src/gacha.js';
import { SCHEMA, defaultsFor } from '../src/schema.js';

function setup(over = {}, random = () => 0.999) {
  const omikuji = new Gacha({ broadcast: () => {} }, { name: 'omikuji', random });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, displayMode: 'short', ...over });
  return omikuji;
}

const rose = (over = {}) => ({
  kind: 'gift',
  totalDiamonds: 10,
  gift: { id: '1', name: 'Rose' },
  user: { id: 'u1', name: 'ゆず' },
  ...over,
});

function tickUntil(t, omikuji, phase, max = 40) {
  for (let i = 0; i < max && omikuji.phase !== phase; i++) t.mock.timers.tick(500);
  return omikuji.phase;
}

test('schema の既定: tenCount は 10、最小 2・最大 30', () => {
  const f = SCHEMA.omikuji.fields.tenCount;
  assert.equal(f.type, 'number');
  assert.equal(f.default, 10);
  assert.equal(f.min, 2);
  assert.equal(f.max, 30);
  assert.equal(defaultsFor('omikuji').tenCount, 10);
});

test('tenCount=11 なら、専用ギフト（tenGifts）のまとめ引きは11件', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup({ tenGifts: ['TenRose'], tenCount: 11 });
  omikuji.onEvent(rose({ gift: { id: '2', name: 'TenRose' } }));
  assert.equal(omikuji.phase, 'ten');
  assert.equal(omikuji.snapshot().results.length, 11);
  omikuji.close();
});

test('tenCount を書かなければ、まとめ引きは今まで通り10件', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const omikuji = setup({ tenGifts: ['TenRose'] });
  omikuji.onEvent(rose({ gift: { id: '2', name: 'TenRose' } }));
  assert.equal(omikuji.snapshot().results.length, 10);
  omikuji.close();
});

test('まとめ引きを見せる長さは回数に比例する（既定の10は今までと同じ 6000ms）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const eleven = setup({ tenGifts: ['TenRose'], tenCount: 11 });
  eleven.onEvent(rose({ gift: { id: '2', name: 'TenRose' } }));
  assert.equal(eleven.snapshot().durations.revealMs, 6600);
  eleven.close();

  const plain = setup({ tenGifts: ['TenRose'] });
  plain.onEvent(rose({ gift: { id: '2', name: 'TenRose' } }));
  assert.equal(plain.snapshot().durations.revealMs, 6000);
  plain.close();
});

test('連打のまとめの境目は tenCount に追随する（10回では11連にせず、11回で11連）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const ten = setup({ tenBatch: true, tenCount: 11 });
  ten.onEvent(rose({ totalDiamonds: 100, gift: { id: '1', name: 'Rose', count: 10 } }));
  assert.equal(ten.phase, 'rolling', '10回では11連にならず、単発のまま');
  assert.equal(ten.snapshot().results, null);
  ten.close();

  const eleven = setup({ tenBatch: true, tenCount: 11 });
  eleven.onEvent(rose({ totalDiamonds: 110, gift: { id: '1', name: 'Rose', count: 11 } }));
  assert.equal(eleven.phase, 'ten');
  assert.equal(eleven.snapshot().results.length, 11);
  eleven.close();
});

test('待ちに同じ視聴者の分が tenCount 回たまったら、その回数のまとめ引きにする', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  // 10件では11連にまとまらない
  const ten = setup({ tenBatch: true, tenCount: 11 });
  ten.onEvent(rose());
  for (let i = 0; i < 10; i++) ten.onEvent(rose());
  assert.equal(ten.snapshot().pending, 10);
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    t.mock.timers.tick(500);
    seen.add(ten.phase);
  }
  assert.ok(!seen.has('ten'), '10件では11連にまとまらない');
  ten.close();

  // 11件なら11連
  const eleven = setup({ tenBatch: true, tenCount: 11 });
  eleven.onEvent(rose());
  for (let i = 0; i < 11; i++) eleven.onEvent(rose());
  assert.equal(tickUntil(t, eleven, 'ten'), 'ten');
  assert.equal(eleven.snapshot().results.length, 11);
  eleven.close();
});

// --- 前面: まとめ引きの札の文言 ---
// public/widgets/gacha.js が要る最小限の画面の代わり（omikuji-ten-flip.test.js と同じ形）
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

function loadOmikujiFront() {
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
  vm.runInNewContext(fs.readFileSync(new URL('../public/widgets/gacha.js', import.meta.url), 'utf8'), sandbox);
  const ws = sockets[sockets.length - 1];
  const send = (data) => ws.onmessage({ data: JSON.stringify({ type: 'omikuji', ...data }) });
  return { byId, send };
}

const tenResults = (n) => Array.from({ length: n }, () => ({ tier: { id: 'kichi', label: '吉' }, stick: 1, forced: false }));
const tenTrigger = { kind: 'gift', user: { id: 'u1', name: 'ゆず' } };

test('まとめ引きの札は、実際の件数で「〜さんの◯連」と出す', () => {
  const { byId, send } = loadOmikujiFront();
  send({ phase: 'ten', trigger: tenTrigger, results: tenResults(10) });
  assert.equal(byId.get('drawWho').textContent, 'ゆず さんの10連', '既定の10は今までと同じ文言');
  send({ phase: 'ten', trigger: tenTrigger, results: tenResults(11) });
  assert.equal(byId.get('drawWho').textContent, 'ゆず さんの11連');
});

// --- 検品の直し: 説明文の固定数字を無くし、最大30件でも舞台に収める ---

test('おみくじの説明文に回数の固定数字が残っていない（tenCount 連動の言い回し）', () => {
  const fields = SCHEMA.omikuji.fields;
  for (const key of ['tenCount', 'tenBatch', 'tenGifts']) {
    assert.doesNotMatch(fields[key].desc, /\d+\s*[回連]/, `${key} の説明に回数の固定数字が残っている`);
  }
  // 節の説明は「棒は1〜10番」「次の1回」など他の話題にも数字が出るので、まとめ引きの固定数字（10連/10回）だけを見る
  assert.doesNotMatch(SCHEMA.omikuji.desc, /10\s*[回連]/, 'おみくじの説明にまとめ引きの固定数字が残っている');
  // 回数は設定 tenCount に連動する書き方にする（tenCount 自身の説明と矛盾しない）
  assert.match(fields.tenBatch.desc, /tenCount/);
  assert.match(fields.tenGifts.desc, /tenCount/);
  assert.match(SCHEMA.omikuji.desc, /tenCount/);
});

test('一番上の README のおみくじのまとめ引きの説明も、回数を固定で書かない', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const row = readme.split(/\r?\n/).find((line) => line.includes('おみくじの10連'));
  assert.ok(row, 'おみくじの10連の行がない');
  const description = row.split('|')[2] ?? '';
  assert.doesNotMatch(description, /\d+\s*[回連]/, 'README の説明に回数の固定数字が残っている');
  assert.match(description, /tenCount/);
});

const OMIKUJI_HTML = fs.readFileSync(new URL('../public/widgets/omikuji/index.html', import.meta.url), 'utf8');

test('結果が最大30件でも、札は舞台の中に収まる（フリップ表示は行を均等に縮めて収める）', () => {
  // 舞台と並びの寸法は index.html の CSS から取る（書き換わったら計算も追随する）
  const stageH = Number(/\.stage\[data-ten="flip"\] \{[^}]*\bheight:\s*(\d+)px/.exec(OMIKUJI_HTML)?.[1]);
  const flipTen = /\.stage\[data-ten="flip"\] \.ten \{([^}]*)\}/.exec(OMIKUJI_HTML)?.[1] ?? '';
  const inset = /inset:\s*(\d+)px\s+\d+px\s+(\d+)px/.exec(flipTen);
  const tenTop = Number(inset?.[1]);
  const tenBottom = Number(inset?.[2]);
  const gap = Number(/\.ten \{[^}]*\bgap:\s*(\d+)px/.exec(OMIKUJI_HTML)?.[1]);
  const cols = Number(/\.ten \{[^}]*grid-template-columns:\s*repeat\((\d+),\s*1fr\)/.exec(OMIKUJI_HTML)?.[1]);
  for (const [name, n] of [['stageH', stageH], ['tenTop', tenTop], ['tenBottom', tenBottom], ['gap', gap], ['cols', cols]]) assert.ok(Number.isFinite(n), `${name} を CSS から取れない`);
  // フリップ表示の並びは行を均等に分ける（1fr）。段が増えても並びの全体は舞台の高さに固定され、はみ出さない
  assert.match(flipTen, /grid-auto-rows:\s*1fr/, 'フリップ表示の並びが行を均等に分ける形でない');
  const area = stageH - tenTop - tenBottom;
  const rowFor = (n) => {
    const rows = Math.ceil(n / cols);
    return (area - (rows - 1) * gap) / rows;
  };
  assert.ok(rowFor(30) >= 40, `30件で1段が ${rowFor(30)}px となり、札の見出しと名前が収まらない`);
  assert.ok(rowFor(10) >= 92, '10件の札の高さが今まで（92px）より小さい');
});

// --- 検品の直し（2回目）: 箱だけでなく、札の中身も段の高さに収める ---
// 段が多いと結果の字（44px固定）が段より大きくなり、見出し・名前・印と重なっていた。
// 4段以上は中身を段に合わせて小さくし、見出し・名前・印を省く（3段までは今まで通り）。

function tenGeometry() {
  const stageH = Number(/\.stage\[data-ten="flip"\] \{[^}]*\bheight:\s*(\d+)px/.exec(OMIKUJI_HTML)?.[1]);
  const flipTen = /\.stage\[data-ten="flip"\] \.ten \{([^}]*)\}/.exec(OMIKUJI_HTML)?.[1] ?? '';
  const inset = /inset:\s*(\d+)px\s+\d+px\s+(\d+)px/.exec(flipTen);
  const gap = Number(/\.ten \{[^}]*\bgap:\s*(\d+)px/.exec(OMIKUJI_HTML)?.[1]);
  const cols = Number(/\.ten \{[^}]*grid-template-columns:\s*repeat\((\d+),\s*1fr\)/.exec(OMIKUJI_HTML)?.[1]);
  const area = stageH - Number(inset?.[1]) - Number(inset?.[2]);
  const rowFor = (n) => {
    const rows = Math.ceil(n / cols);
    return (area - (rows - 1) * gap) / rows;
  };
  return { cols, rowFor };
}

// 結果の字の大きさを CSS から取る（段ごとの上書きがあればそちら、無ければ既定）
function resultFontSize(rows, suffix) {
  const sel = suffix ? `\\.m-result\\.${suffix}` : '\\.m-result';
  if (rows >= 4) {
    const over = new RegExp(`\\[data-ten-rows="${rows}"\\] \\.ten-slip ${sel} \\{ font-size: (\\d+)px; \\}`).exec(OMIKUJI_HTML);
    if (over) return Number(over[1]);
  }
  const base = new RegExp(`\\.ten-slip ${sel} \\{[^}]*?font-size: (\\d+)px`).exec(OMIKUJI_HTML);
  return base ? Number(base[1]) : NaN;
}

test('結果の字の大きさは、どの件数でも1段の高さ以下（札の中身の収まり）', () => {
  const { cols, rowFor } = tenGeometry();
  for (let n = 2; n <= 30; n++) {
    const rows = Math.ceil(n / cols);
    const rowH = rowFor(n);
    for (const suffix of ['', 'len3', 'len4', 'len5', 'len6']) {
      const size = resultFontSize(rows, suffix);
      assert.ok(Number.isFinite(size), `${rows}段（${suffix || '基本'}）の字の大きさを CSS から取れない`);
      assert.ok(size <= rowH, `${n}件（${rows}段・1段 ${rowH.toFixed(1)}px）で結果の字 ${size}px が段の高さを超える`);
    }
  }
});

test('段が多いときは、結果の字を縦に積んだ高さも段に収まり、見出し・名前・印は省かれる', () => {
  const { cols, rowFor } = tenGeometry();
  const chars = { '': 2, len3: 3, len4: 4, len5: 5, len6: 6 };
  for (const rows of [4, 5, 6]) {
    const rowH = rowFor(rows * cols);
    for (const [suffix, count] of Object.entries(chars)) {
      const size = resultFontSize(rows, suffix);
      // 縦書きは1文字の高さがほぼ字の大きさ（字間 -.02em ぶん少し詰まる）
      assert.ok(size * count * 0.98 <= rowH, `${rows}段（1段 ${rowH.toFixed(1)}px）で${count}文字の結果（${size}px）が縦に積むと段からはみ出す`);
    }
    for (const part of ['m-head', 'm-foot', 'm-seal']) {
      assert.match(OMIKUJI_HTML, new RegExp(`\\[data-ten-rows="${rows}"\\] \\.ten-slip \\.${part}[^}]*display: none`), `${rows}段で ${part} を省く決まりが無い`);
    }
  }
});

test('前面は、結果の件数から段数を舞台に出す（中身を縮める決まりと対）', () => {
  const { byId, send } = loadOmikujiFront();
  send({ phase: 'ten', trigger: tenTrigger, results: tenResults(30) });
  assert.equal(byId.get('stage').getAttribute('data-ten-rows'), '6');
  send({ phase: 'ten', trigger: tenTrigger, results: tenResults(20) });
  assert.equal(byId.get('stage').getAttribute('data-ten-rows'), '4');
  send({ phase: 'ten', trigger: tenTrigger, results: tenResults(10) });
  assert.equal(byId.get('stage').getAttribute('data-ten-rows'), '2');
  send({ phase: 'ten', trigger: tenTrigger, results: null });
  assert.equal(byId.get('stage').getAttribute('data-ten-rows'), null);
});
