import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { giftDisplayName, giftOverlayText, rouletteTriggerText, timerTriggerText, giftNamesDocument } from '../src/gift-display.js';
import { giftMatches } from '../src/gifts.js';
import { hintFor } from '../public/widgets/lib/roulette.js';
import { giftLabel } from '../public/widgets/lib/overlay.js';

const doc = giftNamesDocument();
globalThis.installGiftNames(doc);

const ENGLISH = /Heart Me|Doughnut|Rose/;

const cases = [
  ['Heart Me', 'ハートミー'],
  ['heart me', 'ハートミー'],
  ['HEART ME', 'ハートミー'],
  ['7934', 'ハートミー'],
  [{ id: '7934' }, 'ハートミー'],
  [{ id: '7934', name: 'Something Else', nameJa: '別の名前' }, 'ハートミー'],
  ['Doughnut', 'ドーナッツ'],
  ['doughnut', 'ドーナッツ'],
  [{ id: '5879', name: 'Doughnut' }, 'ドーナッツ'],
  ['Rose', 'バラ'],
  ['rose', 'バラ'],
  [{ id: '5655', name: 'Rose' }, 'バラ'],
  // GiftID が英語名より先
  [{ id: '5655', name: 'Doughnut' }, 'バラ'],
  [{ id: '0', name: 'Heart Me' }, 'ハートミー'],
  ['Brand New Gift', 'Brand New Gift'],
  [{ id: '999999999', name: 'Brand New Gift' }, 'Brand New Gift'],
  ['バラ', 'バラ'],
  [null, 'Gift'],
  ['', 'Gift'],
];

test('知っているギフトの表示名は日本語（サーバー）', () => {
  for (const [gift, ja] of cases) assert.equal(giftDisplayName(gift), ja, JSON.stringify(gift));
  assert.equal(giftDisplayName({ id: '1', name: 'Rose', nameJa: 'ローズ' }), 'バラ');
});

test('ブラウザの表示名はサーバーと同じ引き方', () => {
  for (const [gift, ja] of cases) {
    assert.equal(globalThis.giftDisplayName(gift), ja, JSON.stringify(gift));
    assert.equal(giftLabel(gift), ja, JSON.stringify(gift));
  }
});

test('判定は英語名・ID のまま（表示だけ変える）', () => {
  const gift = { id: '5655', name: 'Rose', nameJa: null };
  assert.equal(gift.name, 'Rose');
  assert.equal(giftMatches(gift, ['Rose']), true);
  assert.equal(giftMatches(gift, ['5655']), true);
  assert.equal(giftMatches(gift, ['バラ']), false);
  assert.equal(giftDisplayName(gift), 'バラ');
});

test('ルーレットの案内は知っているギフトを日本語だけで出す', () => {
  const rule = { gifts: ['Doughnut'], minCoins: 100, maxCoins: 0, events: [], name: 'ガチャ' };
  const text = rouletteTriggerText(rule);
  assert.equal(text, 'ドーナッツ / 100コイン以上のギフトでガチャ');
  assert.doesNotMatch(text, ENGLISH);
  assert.equal(globalThis.rouletteTriggerText(rule), text);

  const many = { gifts: ['Heart Me', 'Rose', 'Doughnut'], minCoins: 0, maxCoins: 0, events: ['follow'], name: 'ガチャ' };
  const joined = rouletteTriggerText(many);
  assert.equal(joined, 'ハートミー・バラ・ドーナッツ / フォローでガチャ');
  assert.doesNotMatch(joined, ENGLISH);

  // 自分で書いた案内文はそのまま
  assert.equal(rouletteTriggerText({ hint: 'そのまま出す', gifts: ['Rose'], name: 'ガチャ' }), 'そのまま出す');
});

test('延長タイマーの案内は知っているギフトを日本語だけで出す', () => {
  const timer = {
    rules: [
      { gifts: ['Rose'], seconds: 0 },
      { gifts: ['Doughnut'], seconds: 30 },
      { gifts: ['Heart Me'], seconds: 10 },
      { gifts: ['Rose'], seconds: 5 },
    ],
  };
  const text = timerTriggerText(timer);
  assert.equal(text, 'ドーナッツ / ハートミー');
  assert.doesNotMatch(text, ENGLISH);
  assert.equal(globalThis.timerTriggerText(timer), text);
});

test('オーバーレイに出す文（カットイン・ルーレットの案内）に英語のギフト名が残らない', () => {
  assert.equal(giftOverlayText({ name: 'Doughnut', id: '5879', count: 2 }), 'ドーナッツ ×2');
  assert.equal(globalThis.giftOverlayText({ name: 'Heart Me', count: 1 }), 'ハートミー ×1');

  const hint = hintFor({ gifts: ['Doughnut', 'Rose'], minCoins: 100, maxCoins: 0, events: [], name: 'ガチャ', hint: '' });
  assert.equal(hint, 'ドーナッツ・バラ / 100コイン以上のギフトでガチャ');
  assert.doesNotMatch(hint, ENGLISH);
  assert.equal(giftLabel({ id: '7934', name: 'Heart Me' }), 'ハートミー');
  assert.equal(giftLabel('Doughnut'), 'ドーナッツ');
});

test('ブラウザ用スクリプトは古い Chromium でも読める書き方', () => {
  const src = fs.readFileSync(new URL('../public/widgets/lib/gift-name.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\.at\s*\(/);
  assert.doesNotMatch(code, /\breplaceAll\b/);
  assert.doesNotMatch(code, /\bawait\b/);
  assert.doesNotMatch(code, /\?\./);
  assert.doesNotMatch(code, /=>/);
  assert.doesNotMatch(code, /\b(let|const)\b/);
  assert.doesNotMatch(code, /`/);
  assert.match(src, /function giftDisplayName/);
  assert.match(src, /function rouletteTriggerText/);
  assert.match(src, /function timerTriggerText/);
});
