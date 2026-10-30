// カード docs/cards/puchun-gift.md の「2巡目」AC-7〜10 だけを確かめる受け入れテスト。
// AC-7 は puchun.html の本体スクリプトを、疑似の document と疑似の時計で動かして確かめる。
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, normalize, EXAMPLE_PATH } from '../../src/config.js';
import { createRuntime } from '../../src/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const entry = (extra = {}) => ({ preset: 'jackpot', ratio: 'full', texts: { main: '大当たり' }, ...extra });
const tick = () => new Promise((resolve) => setImmediate(resolve));

// ---- AC-7 ----

// puchun.html の type="module" の本体を取り出し、import を疑似の connect に置き換えて動かす。
function bootPage() {
  const html = read('public/widgets/puchun/puchun.html');
  const modules = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(modules.length, 1, 'type="module" の script が1つ');
  const code = modules[0].replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?/m, '');
  const frames = new Set();
  const created = [];
  const stat = { max: 0, overlapAtStart: 0 };
  const makeFrame = () => {
    const frame = {
      className: '', src: '', title: '', style: {},
      addEventListener() {}, removeEventListener() {}, setAttribute() {},
      remove() { frames.delete(frame); },
    };
    return frame;
  };
  const track = (frame) => {
    if (frames.size > 0) stat.overlapAtStart += 1;
    frames.add(frame);
    created.push(frame);
    stat.max = Math.max(stat.max, frames.size);
  };
  const body = {
    append(...nodes) { for (const n of nodes) track(n); },
    appendChild(n) { track(n); return n; },
    removeChild(n) { n.remove(); return n; },
  };
  const document = {
    body,
    createElement: () => makeFrame(),
    querySelectorAll: () => [...frames],
    querySelector: () => [...frames][0] ?? null,
    getElementById: () => null,
    addEventListener() {},
  };
  let handlers = null;
  const connect = (h) => { handlers = h; };
  const location = { search: '', pathname: '/widgets/puchun/puchun.html' };
  new Function('connect', 'document', 'location', 'window', code)(connect, document, location, { addEventListener() {}, location });
  assert.ok(handlers?.puchun, 'puchun の受け口がある');
  return { send: (play) => handlers.puchun({ type: 'puchun', play }), frames, created, stat };
}

test('AC-7 ×200 が一度に届いても、演出の iframe は常に1個以下で、200本すべてが流れ終わる', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const page = bootPage();
    for (let i = 0; i < 200; i += 1) page.send({ preset: 'jackpot', ratio: 'full', texts: { main: `#${i}` } });
    await tick();
    assert.ok(page.stat.max <= 1, `同時に ${page.stat.max} 個`);
    // 1本は最長 8 秒ほど。200本 + 余裕のぶんまで、疑似の時計を進める。
    const limit = 200 * 12000;
    for (let ms = 0; ms < limit && (page.created.length < 200 || page.frames.size > 0); ms += 250) {
      mock.timers.tick(250);
      await tick();
      assert.ok(page.stat.max <= 1, `同時に ${page.stat.max} 個`);
    }
    assert.equal(page.created.length, 200, '200本すべてが始まる');
    assert.equal(page.frames.size, 0, '最後の演出も終わって片づく');
    assert.equal(page.stat.overlapAtStart, 0, '前の演出が終わる前に次を始めない');
    const mains = page.created.map((f) => new URLSearchParams(f.src.split('?')[1]).get('main'));
    assert.deepEqual(mains, Array.from({ length: 200 }, (_, i) => `#${i}`), '届いた順に流す');
  } finally {
    mock.timers.reset();
  }
});

// ---- AC-8 ----

function boot(entitled) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-puchun-r2-'));
  const file = path.join(dir, 'config.yaml');
  fs.copyFileSync(EXAMPLE_PATH, file);
  const store = createStore(file);
  const saved = store.setValue('puchuns.a', entry({ gifts: ['Rose'] }));
  assert.equal(saved.ok, true, JSON.stringify(saved.errors));
  const rt = createRuntime({ id: 'p1', store, dataDir: dir, mediaDirs: [], entitled });
  const sent = [];
  const orig = rt.hub.broadcast.bind(rt.hub);
  rt.hub.broadcast = (m) => { sent.push(m); orig(m); };
  return { rt, dir, sent };
}
const rose = (count = 1) => ({ kind: 'gift', user: { id: 'u1', name: 'たろう' }, gift: { name: 'Rose', id: '9', count }, totalDiamonds: 10 * count });

test('AC-8 puchuns を使えない配信者では、合うギフトが来ても演出が1本も流れない', async () => {
  const on = boot(() => true);
  const off = boot((feature) => feature !== 'puchuns');
  try {
    on.rt.hub.publish(rose(3));
    assert.equal(on.sent.filter((m) => m.type === 'puchun').length, 3, '使える配信者では流れる(比べる基準)');
    off.rt.hub.publish(rose(3));
    assert.equal(off.sent.filter((m) => m.type === 'puchun').length, 0);
  } finally {
    await on.rt.close();
    await off.rt.close();
    fs.rmSync(on.dir, { recursive: true, force: true });
    fs.rmSync(off.dir, { recursive: true, force: true });
  }
});

// ---- AC-9 ----

const FIELDS = { chance: ['main', 'sub'], cutin: ['say', 'main'], jackpot: ['num', 'main', 'sub'], puchun: ['main'] };

test('AC-9 演出の fields にあるキーの字(文字列)は保存できる', () => {
  for (const [preset, keys] of Object.entries(FIELDS)) {
    const texts = Object.fromEntries(keys.map((k) => [k, 'あ']));
    assert.deepEqual(normalize({ puchuns: { a: entry({ preset, texts }) } }).errors, [], preset);
  }
});

test('AC-9 fields に無いキー(play・ratio・preset・t・hold など)は保存が断られる', () => {
  for (const key of ['play', 'ratio', 'preset', 't', 'hold', 'loop', 'char', 'post', 'scale', 'w', 'h', 'nowarm', 'reduced', 'eyes']) {
    const { errors } = normalize({ puchuns: { a: entry({ texts: { main: '大当たり', [key]: '1' } }) } });
    assert.ok(errors.some((e) => e.includes('puchuns')), `${key} が通ってしまう`);
  }
  // 別の演出のキーも、選んだ演出に無ければ断る
  assert.ok(normalize({ puchuns: { a: entry({ preset: 'puchun', texts: { say: 'いくぞ!' } }) } }).errors.length > 0);
  assert.ok(normalize({ puchuns: { a: entry({ preset: 'chance', texts: { num: '777' } }) } }).errors.length > 0);
});

test('AC-9 文字列でない値は保存が断られる', () => {
  for (const bad of [5, true, { a: 1 }, ['x'], null]) {
    const { errors } = normalize({ puchuns: { a: entry({ texts: { main: bad } }) } });
    assert.ok(errors.some((e) => e.includes('puchuns')), JSON.stringify(bad));
  }
});

test('AC-9 断られた保存は、設定ファイルに残らない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-puchun-r2-'));
  try {
    const store = createStore(path.join(dir, 'config.yaml'));
    const r = store.setValue('puchuns.a', entry({ texts: { main: '大当たり', play: '1' } }));
    assert.equal(r.ok, false);
    assert.deepEqual(store.load().config.puchuns, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- AC-10 ----

test('AC-10 字が20字を超えると保存が断られ、20字までは保存できる', () => {
  for (const [preset, keys] of Object.entries(FIELDS)) {
    for (const key of keys) {
      assert.deepEqual(normalize({ puchuns: { a: entry({ preset, texts: { [key]: 'あ'.repeat(20) } }) } }).errors, [], `${preset}.${key} 20字`);
      const { errors } = normalize({ puchuns: { a: entry({ preset, texts: { [key]: 'あ'.repeat(21) } }) } });
      assert.ok(errors.some((e) => e.includes('puchuns')), `${preset}.${key} 21字が通ってしまう`);
    }
  }
});

test('AC-10 20字を超える保存は、設定ファイルに残らない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-puchun-r2-'));
  try {
    const store = createStore(path.join(dir, 'config.yaml'));
    const r = store.setValue('puchuns.a', entry({ texts: { main: 'あ'.repeat(21) } }));
    assert.equal(r.ok, false);
    assert.deepEqual(store.load().config.puchuns, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
