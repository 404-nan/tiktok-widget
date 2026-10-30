// カード docs/cards/puchun-gift.md の AC-1〜6 を確かめる受け入れテスト。
// 設定は map 型の `puchuns`(条件ごとに1件。ルーレット・カットインと同じ持ち方)、
// 選び方と連打の展開は src/puchun.js の puchunFor / puchunPlays、という形を前提にする。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, normalize, widgetList } from '../../src/config.js';
import { defaultsFor, SCHEMA } from '../../src/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PRESETS = ['chance', 'cutin', 'jackpot', 'puchun'];
const RATIOS = ['full', '1:1', '4:3', '16:9'];

const loadModule = () => import('../../src/puchun.js');
const configOf = (puchuns) => normalize({ puchuns });
const entry = (extra = {}) => ({ preset: 'jackpot', ratio: 'full', texts: { main: '大当たり' }, ...extra });
const gift = (name, count, totalDiamonds, id = name) => ({ kind: 'gift', gift: { id, name, count }, totalDiamonds });
const asList = (map) => Object.entries(map).map(([id, e]) => ({ id, ...e }));

test('AC-1 配信ソフトに入れる URL は設定がいくつあっても1件で、/widgets/puchun/puchun.html', () => {
  const { config, errors } = configOf({ a: entry({ gifts: ['バラ'] }), b: entry({ preset: 'chance', minCoins: 100 }) });
  assert.deepEqual(errors, []);
  const rows = widgetList(config).filter((w) => w.section === 'puchuns');
  assert.equal(rows.length, 1);
  assert.match(rows[0].url, /\/widgets\/puchun\/puchun\.html/);
});

test('AC-1 ギフト名の条件が、コイン数の条件より先に選ばれる', async () => {
  const { puchunFor } = await loadModule();
  const list = asList({
    coins: entry({ preset: 'chance', minCoins: 1 }),
    named: entry({ preset: 'puchun', gifts: ['バラ'] }),
  });
  assert.equal(puchunFor(list, gift('バラ', 1, 1)).id, 'named');
  assert.equal(puchunFor(list, gift('ドーナツ', 1, 30)).id, 'coins');
});

test('AC-1 コイン数は minCoins 以上・maxCoins 以下(0 は上限なし)で選ばれ、合わなければ流れない', async () => {
  const { puchunFor } = await loadModule();
  const list = asList({
    small: entry({ preset: 'chance', minCoins: 10, maxCoins: 99 }),
    big: entry({ preset: 'puchun', minCoins: 100 }),
  });
  assert.equal(puchunFor(list, gift('x', 1, 9)), undefined);
  assert.equal(puchunFor(list, gift('x', 1, 10)).id, 'small');
  assert.equal(puchunFor(list, gift('x', 1, 99)).id, 'small');
  assert.equal(puchunFor(list, gift('x', 1, 100)).id, 'big');
  assert.equal(puchunFor(list, gift('x', 1, 99999)).id, 'big');
});

test('AC-1 ギフトの名前は日本語名や ID でも合い、ギフト以外のイベントでは選ばれない', async () => {
  const { puchunFor } = await loadModule();
  const list = asList({ a: entry({ gifts: ['バラ'] }), b: entry({ minCoins: 1 }) });
  assert.equal(puchunFor(list, { kind: 'gift', gift: { id: 'rose', name: 'Rose', nameJa: 'バラ', count: 1 }, totalDiamonds: 1 }).id, 'a');
  assert.equal(puchunFor(list, { kind: 'follow', user: { id: 'u' } }), undefined);
  assert.equal(puchunFor(list, { kind: 'chat', comment: 'こんにちは' }), undefined);
});

test('AC-2 演出は4本、比率は全画面・1:1・4:3・16:9 を保存でき、それ以外は設定エラー', () => {
  for (const preset of PRESETS) {
    for (const ratio of RATIOS) {
      const r = configOf({ a: entry({ preset, ratio }) });
      assert.deepEqual(r.errors, [], `${preset} ${ratio}`);
      assert.equal(r.config.puchuns.a.preset, preset);
      assert.equal(r.config.puchuns.a.ratio, ratio);
    }
  }
  assert.ok(configOf({ a: entry({ preset: 'sakura' }) }).errors.some((e) => e.includes('preset')));
  assert.ok(configOf({ a: entry({ ratio: '21:9' }) }).errors.some((e) => e.includes('ratio')));
});

test('AC-2 字はその演出のキー全部を保存して読み込める(設定ファイルへの保存を通して)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-puchun-'));
  try {
    const store = createStore(path.join(dir, 'config.yaml'));
    const texts = { num: '555', main: '超,大当たり', sub: 'ありがとう' };
    const saved = store.setValue('puchuns.a', entry({ preset: 'jackpot', ratio: '16:9', texts, gifts: ['バラ'], minCoins: 5 }));
    assert.equal(saved.ok, true, JSON.stringify(saved.errors));
    const loaded = store.load().config.puchuns.a;
    assert.equal(loaded.preset, 'jackpot');
    assert.equal(loaded.ratio, '16:9');
    assert.deepEqual(loaded.texts, texts);
    assert.deepEqual(loaded.gifts, ['バラ']);
    assert.equal(loaded.minCoins, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-2 保存した字がそのまま、流す指示に入る', async () => {
  const { puchunPlays } = await loadModule();
  const { config } = configOf({ a: entry({ preset: 'cutin', ratio: '4:3', texts: { say: 'いくぞ!', main: '激アツ' }, gifts: ['バラ'] }) });
  const plays = puchunPlays(config, gift('バラ', 1, 1));
  assert.equal(plays.length, 1);
  assert.equal(plays[0].preset, 'cutin');
  assert.equal(plays[0].ratio, '4:3');
  assert.deepEqual(plays[0].texts, { say: 'いくぞ!', main: '激アツ' });
});

test('AC-2 見本ボタン: 設定を保存せずその場で1回流すための指示を作れ、公開ページが ?preset= ?ratio= ?キー= を読む', async () => {
  const { puchunTestPlay } = await loadModule();
  const { config } = configOf({ a: entry({ preset: 'puchun', ratio: '1:1', texts: { main: 'ナイス,ギフト' } }) });
  const play = puchunTestPlay(config, 'a');
  assert.equal(play.preset, 'puchun');
  assert.equal(play.ratio, '1:1');
  assert.deepEqual(play.texts, { main: 'ナイス,ギフト' });
  const page = read('public/widgets/puchun/puchun.html');
  assert.match(page, /preset/);
  assert.match(page, /ratio/);
});

test('AC-2 ダッシュボードの画面が、演出・字・比率の入力欄を持つ', () => {
  const def = SCHEMA.puchuns;
  assert.ok(def, 'schema に puchuns が無い');
  assert.equal(def.kind, 'map');
  assert.equal(def.page, 'puchun/puchun');
  for (const key of ['preset', 'ratio', 'texts', 'gifts', 'minCoins', 'maxCoins']) assert.ok(def.fields[key], `${key} の欄が無い`);
});

test('AC-3 ×5 の連打は5回ぶん、順に流す指示になる', async () => {
  const { puchunPlays } = await loadModule();
  const { config } = configOf({ a: entry({ gifts: ['バラ'] }) });
  for (const count of [1, 2, 5, 30, 200]) {
    const plays = puchunPlays(config, gift('バラ', count, count));
    assert.equal(plays.length, count, `×${count}`);
    assert.ok(plays.every((p) => p.preset === 'jackpot' && p.texts.main === '大当たり'));
  }
});

test('AC-3 個数が無い・壊れているときは1回(0 や NaN にしない)', async () => {
  const { puchunPlays } = await loadModule();
  const { config } = configOf({ a: entry({ gifts: ['バラ'] }) });
  for (const count of [undefined, 0, 'x', NaN]) {
    assert.equal(puchunPlays(config, gift('バラ', count, 1)).length, 1, String(count));
  }
});

test('AC-3 公開ページは待ちに上限をつけず、順に流すことを README とダッシュボードの説明に書く', () => {
  const page = read('public/widgets/puchun/puchun.html');
  assert.doesNotMatch(page, /length\s*>=?\s*\d+\)\s*[^;\n]*\.shift\(\)/);
  assert.match(read('public/widgets/puchun/README.md'), /順に/);
  assert.match(SCHEMA.puchuns?.desc ?? '', /順に/);
});

test('AC-4 初めの状態は「使わない」: 設定が無ければ空で、URL も出ず、ギフトが来ても何も流れない', async () => {
  const { puchunPlays } = await loadModule();
  assert.deepEqual(defaultsFor('puchuns'), {});
  const { config, errors } = normalize({});
  assert.deepEqual(errors, []);
  assert.deepEqual(config.puchuns, {});
  assert.equal(widgetList(config).filter((w) => w.section === 'puchuns').length, 0);
  assert.deepEqual(puchunPlays(config, gift('バラ', 5, 5)), []);
});

test('AC-4 既存の設定ファイルは、puchuns が無くてもそのままエラーなく読める', () => {
  assert.deepEqual(normalize({ roulettes: { r: { items: ['a', 'b'] } } }).errors, []);
  assert.ok(!/^puchuns:/m.test(read('config.example.yaml')), '見本の設定で初めから使う状態にしない');
});

test('AC-6 一番上の README の機能の一覧に、パチンコ演出の行がある', () => {
  const table = read('README.md').split('## 機能の状態')[1]?.split('\n## ')[0] ?? '';
  const row = table.split('\n').find((line) => line.startsWith('|') && /パチンコ/.test(line));
  assert.ok(row, '機能の状態の表にパチンコ演出の行が無い');
  assert.match(row, /puchun/);
});

test('AC-6 puchun の README に、ギフトで流す設定の説明がある', () => {
  const doc = read('public/widgets/puchun/README.md');
  for (const word of ['puchuns', '比率', '16:9', '使わない', 'ギフト名', 'コイン']) {
    assert.ok(doc.includes(word), `README に「${word}」が無い`);
  }
});
