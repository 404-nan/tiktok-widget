// 読み上げで、よくある悪口を最初から読まない(docs/cards/tts-safe-words.md)の受け入れテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultsFor } from '../../src/schema.js';
import { chatFilter, speechText } from '../../public/widgets/lib/chat.js';

const chat = (text) => ({ kind: 'chat', user: { id: 'sakura', name: 'さくら' }, text });
// ウィジェットは設定の既定値に上書きを重ねたものを渡す
const settings = (over = {}) => ({ ...defaultsFor('chats'), ...over });

test('AC-1: ttsSkipBadWords は既定 true。「死ね」は読まないが画面には出る', () => {
  assert.equal(defaultsFor('chats').ttsSkipBadWords, true);
  const p = settings();
  assert.equal(speechText(chat('お前は死ね'), p), '');
  assert.equal(chatFilter(p)(chat('お前は死ね')), true);
});

test('AC-2: ひらがな・カタカナ違いも読まない', () => {
  const p = settings();
  assert.equal(speechText(chat('しね'), p), '');
  assert.equal(speechText(chat('シネ'), p), '');
});

test('AC-3: false にすると今までどおり読む', () => {
  const p = settings({ ttsSkipBadWords: false });
  assert.equal(speechText(chat('お前は死ね'), p), 'さくらさん、お前は死ね');
  assert.equal(speechText(chat('シネ'), p), 'さくらさん、シネ');
});

test('AC-4: 悪口を含まないコメントの読み上げは変わらない', () => {
  const p = settings();
  assert.equal(speechText(chat('こんばんは'), p), 'さくらさん、こんばんは');
  assert.equal(speechText(chat('こんばんは'), settings({ ttsName: false })), 'こんばんは');
});
