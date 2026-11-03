// カード docs/cards/giftlist-keep-names.md の AC-1〜6 と AC-7 の文書の部分を確かめる受け入れテスト。
// scripts/ と src/ の表を一時の場所に写し、fetch の偽物を差して scripts/giftlist.js を実際に動かす。ネットにはつながない。
// AC-7 の「既存のテストも全部通る」は npm test 全体の結果が証拠なので、ここでは書かない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../../', import.meta.url).pathname;

// 前の表に入れておく見本(本物の表の写しに足す)
const SEED_NAMES = {
  9100001: ['Rose', 'バラ'],          // 今の一覧では日本語名だけ違う
  9100002: ['Heart Me', 'ハートミー'], // 今の一覧では英語名・日本語名とも違う
  9100003: ['Same Gift', 'おなじ'],    // 名前は同じ。コインだけ変わる
  9100005: ['Calm Gift', 'しずか'],    // 何も変わらない
};
const SEED_COINS = { 9100001: 1, 9100002: 5, 9100003: 10, 9100005: 7 };
const API_NAMES = {
  9100001: ['Rose', 'ローズ'],
  9100002: ['Heart You', 'ハート'],
  9100003: ['Same Gift', 'おなじ'],
  9100004: ['Fresh Gift', '新鮮'],     // 表に無い新規
  9100005: ['Calm Gift', 'しずか'],
};
const API_COINS = { 9100001: 1, 9100002: 5, 9100003: 20, 9100004: 99, 9100005: 7 };

const FAKE_FETCH = `
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(process.env.FAKE_GIFTS, 'utf8'));
globalThis.fetch = async (url) => {
  const lang = new URL(String(url)).searchParams.get('webcast_language');
  const list = lang === 'en' ? data.en : data.ja;
  return { ok: true, status: 200, json: async () => ({ data: { gifts: list } }) };
};
`;

// 一時の場所を作り、giftlist.js を動かして結果を返す。api が null なら「日本語が1件も返らない」状態にする。
function run({ sameAsEn = false, api = API_NAMES, apiCoins = API_COINS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'giftlist-keep-names-'));
  try {
    cpSync(root + 'scripts', join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'public/widgets/lib'), { recursive: true });
    for (const f of ['gift-names-ja.json', 'gift-coins.json']) cpSync(root + 'src/' + f, join(dir, 'src', f));
    cpSync(root + 'public/widgets/lib/gift-names-ja.js', join(dir, 'public/widgets/lib/gift-names-ja.js'));
    const namesPath = join(dir, 'src/gift-names-ja.json');
    const coinsPath = join(dir, 'src/gift-coins.json');
    const names = JSON.parse(readFileSync(namesPath, 'utf8'));
    Object.assign(names.names, SEED_NAMES);
    writeFileSync(namesPath, JSON.stringify(names));
    const coins = JSON.parse(readFileSync(coinsPath, 'utf8'));
    Object.assign(coins.coins, SEED_COINS);
    writeFileSync(coinsPath, JSON.stringify(coins));
    const libPath = join(dir, 'public/widgets/lib/gift-names-ja.js');
    // ブラウザ用の表は、わざと古い中身にしておく
    writeFileSync(libPath, 'export default {"byId":{},"byName":{}};\n');

    const en = Object.entries(api).map(([id, p]) => ({ id: Number(id), name: p[0], diamond_count: apiCoins[id] }));
    const ja = Object.entries(api).map(([id, p]) => ({ id: Number(id), name: sameAsEn ? p[0] : p[1], diamond_count: apiCoins[id] }));
    writeFileSync(join(dir, 'gifts.json'), JSON.stringify({ en, ja }));
    writeFileSync(join(dir, 'fake-fetch.mjs'), FAKE_FETCH);

    const before = { names: readFileSync(namesPath, 'utf8'), coins: readFileSync(coinsPath, 'utf8'), lib: readFileSync(libPath, 'utf8') };
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake-fetch.mjs')).href, join(dir, 'scripts/giftlist.js')], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, FAKE_GIFTS: join(dir, 'gifts.json') },
    });
    const after = { names: readFileSync(namesPath, 'utf8'), coins: readFileSync(coinsPath, 'utf8'), lib: readFileSync(libPath, 'utf8') };
    return {
      status: r.status, stdout: r.stdout, stderr: r.stderr, before, after,
      names: JSON.parse(after.names).names,
      coins: JSON.parse(after.coins).coins,
      libUrl: pathToFileURL(libPath).href + '?t=' + Date.now(),
    };
  } finally {
    // 表の import は run の後で行うので、片付けは呼び出し側が終わってから消えるよう遅らせず、ここでは消さない
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  }
}

const lines = (s) => s.split('\n').filter(Boolean);

test('AC-1 表にある id の名前が一覧と違っても、英語名・日本語名とも前のまま', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.names[9100001], SEED_NAMES[9100001]);
  assert.deepEqual(r.names[9100002], SEED_NAMES[9100002]);
  assert.deepEqual(r.names[9100003], SEED_NAMES[9100003]);
});

test('AC-2 名前が前と違った id は、id と前の名前と今の名前を1件1行で出す', () => {
  const r = run();
  const out = lines(r.stdout);
  const l1 = out.filter((l) => l.includes('9100001'));
  assert.equal(l1.length, 1, r.stdout);
  for (const s of ['Rose', 'バラ', 'ローズ']) assert.ok(l1[0].includes(s), l1[0]);
  const l2 = out.filter((l) => l.includes('9100002'));
  assert.equal(l2.length, 1, r.stdout);
  for (const s of ['Heart Me', 'ハートミー', 'Heart You', 'ハート']) assert.ok(l2[0].includes(s), l2[0]);
});

test('AC-2 名前が変わらないなら、その id は出さない。変わった id が1つも無ければ件数の行しか出ない', () => {
  const r = run();
  assert.ok(!lines(r.stdout).some((l) => l.includes('9100005')), r.stdout);
  const same = Object.fromEntries(Object.entries(SEED_NAMES).map(([id, p]) => [id, p]));
  const r2 = run({ api: same, apiCoins: SEED_COINS });
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(!lines(r2.stdout).some((l) => /9100\d{3}/.test(l)), r2.stdout);
  assert.equal(lines(r2.stdout).length, 1, r2.stdout);
});

test('AC-3 表に無い id は足され、件数の行に新規の数が出る', () => {
  const r = run();
  assert.deepEqual(r.names[9100004], API_NAMES[9100004]);
  assert.ok(lines(r.stdout).some((l) => /新規\s*1(?!\d)/.test(l)), r.stdout);
});

test('AC-4 コインは一覧の値に更新し、変わった id は id と前後の値を1件1行で出す', () => {
  const r = run();
  assert.equal(r.coins[9100003], 20);
  assert.equal(r.coins[9100004], 99);
  const l = lines(r.stdout).filter((x) => x.includes('9100003'));
  assert.equal(l.length, 1, r.stdout);
  assert.match(l[0], /(^|\D)10(\D|$)/);
  assert.match(l[0], /(^|\D)20(\D|$)/);
  assert.ok(!lines(r.stdout).some((x) => x.includes('9100005')), '値が変わらない id は出さない');
});

test('AC-5 走り終わると、ブラウザ用の表も新しい名前を含む形で作り直されている', async () => {
  const r = run();
  assert.notEqual(r.after.lib, r.before.lib);
  const { default: table } = await import(r.libUrl);
  assert.equal(table.byId['9100004'], '新鮮');
  assert.equal(table.byId['9100001'], 'バラ');
});

test('AC-6 日本語名が1件も返らないときは終了コード1で止まり、3つの表のどれも書き換えない', () => {
  const r = run({ sameAsEn: true });
  assert.equal(r.status, 1);
  assert.equal(r.after.names, r.before.names);
  assert.equal(r.after.coins, r.before.coins);
  assert.equal(r.after.lib, r.before.lib);
});

test('AC-7 README.md と AGENTS.md の説明が「名前は上書きしない」今の動きになっている', () => {
  const readme = readFileSync(root + 'README.md', 'utf8');
  const agents = readFileSync(root + 'AGENTS.md', 'utf8');
  assert.ok(!/GiftID で対にして上書きします/.test(readme), 'README.md に古い「上書き」の説明が残っている');
  const readmeLine = readme.split('\n').find((l) => l.includes('scripts/giftlist.js')) ?? '';
  assert.match(readmeLine, /前の名前|名前は(そのまま|変え|上書きしない|残)/);
  const agentsLine = agents.split('\n').find((l) => l.includes('scripts/giftlist.js')) ?? '';
  assert.match(agentsLine, /前の名前|名前は(そのまま|変え|上書きしない|残)/);
});
