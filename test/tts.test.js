import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSpeechText, fillTemplate, createTtsState, decideTts, VOICE_TYPES } from '../public/widgets/lib/tts.js';

const base = {
  chatOn: true, chatVoiceType: 'normal', chatRate: 1.1, chatPitch: 1, chatVolume: 1,
  chatScope: 'all', chatMode: 'all', chatName: true, chatTemplate: '{name}さん、{text}',
  giftOn: true, giftVoiceType: 'high', giftRate: 1.1, giftPitch: 1, giftVolume: 1,
  giftMinCoins: 0, giftTemplate: '{name}さん、{gift}ありがとう！',
  followOn: true, followTemplate: '{name}さん、フォローありがとう！',
  joinOn: false, joinTemplate: '{name}さん、いらっしゃい',
  unlockOn: false, unlockMinutes: 30,
  ngWords: [], skipBadWords: true, cooldownSec: 10, maxChars: 60, maxQueue: 5,
};
const chat = (user, text, extra = {}) => ({ kind: 'chat', user: { id: user, name: 'さくら' }, text, ...extra });
const gift = (user, coins = 1, extra = {}) => ({ kind: 'gift', user: { id: user, name: 'さくら' }, gift: { name: 'Rose', nameJa: 'バラ', count: 1 }, coins, ...extra });

test('整形: URLと絵文字を落とし、www を わら にする', () => {
  assert.equal(cleanSpeechText('みて https://example.com すごいwww'), 'みて すごい わら');
  assert.equal(cleanSpeechText('88888'), 'ぱちぱち');
});

test('整形: 最大文字数で切って以下略を付ける（繰り返しの圧縮が先）', () => {
  const out = cleanSpeechText('あいうえおかきくけこさしすせそ', 10);
  assert.equal(out, 'あいうえおかきくけこ' + '、以下略');
  assert.equal(cleanSpeechText('あ'.repeat(20), 10), 'あああ');
});

test('型の差し込み', () => {
  assert.equal(fillTemplate('{name}さん、{text}', { name: 'たろう', text: 'やあ' }), 'たろうさん、やあ');
});

test('コメントは型どおり読む。テスト印は読まない', () => {
  const st = createTtsState();
  const r = decideTts(chat('u1', 'こんばんは'), base, st, 1000);
  assert.equal(r.speak.text, 'さくらさん、こんばんは');
  assert.equal(r.speak.channel, 'chat');
  assert.ok(decideTts(chat('u1', 'やあ', { test: true }), base, createTtsState(), 1000).skip);
});

test('悪口とNGワードは読まない（穏当な言葉は巻き込まない）', () => {
  const st = createTtsState();
  assert.equal(decideTts(chat('u1', 'おい死ねよ'), base, st, 1000).skip, '悪口を含む');
  assert.equal(decideTts(chat('u2', 'シネマの話しよう'), base, st, 1000).speak.text, 'さくらさん、シネマの話しよう');
  const p = { ...base, ngWords: ['内緒'] };
  assert.equal(decideTts(chat('u3', 'これは内緒ね'), p, st, 1000).skip, 'NGワードを含む');
});

test('クールダウン中は同じ人を読まない', () => {
  const st = createTtsState();
  assert.ok(decideTts(chat('u1', 'いち'), base, st, 1000).speak);
  assert.equal(decideTts(chat('u1', 'に'), base, st, 5000).skip, 'クールダウン中');
  assert.ok(decideTts(chat('u1', 'さん'), base, st, 12000).speak);
});

test('範囲の絞り: ギフトした人だけのとき、ギフト後は読める', () => {
  const st = createTtsState();
  const p = { ...base, chatScope: 'gifter' };
  assert.equal(decideTts(chat('u1', 'やあ'), p, st, 1000).skip, 'ギフトした人だけ読む設定');
  decideTts(gift('u1'), p, st, 1000);
  assert.ok(decideTts(chat('u1', 'やあ'), p, st, 20000).speak);
});

test('コマンドだけ読む設定', () => {
  const st = createTtsState();
  const p = { ...base, chatMode: 'cmd' };
  assert.equal(decideTts(chat('u1', 'ふつうの文'), p, st, 1000).skip, 'コマンドだけ読む設定');
  assert.ok(decideTts(chat('u1', '!おみくじ'), p, st, 1000).speak);
});

test('ギフト: 最低コイン未満は読まないが、送った人の記録は残る', () => {
  const st = createTtsState();
  const p = { ...base, giftMinCoins: 100 };
  assert.equal(decideTts(gift('u1', 1), p, st, 1000).skip, '最低コイン未満');
  assert.ok(st.gifters.has('u1'));
  const r = decideTts(gift('u1', 1000), p, st, 2000);
  assert.equal(r.speak.text, 'さくらさん、バラありがとう！');
  assert.equal(r.speak.channel, 'gift');
  assert.ok(r.speak.voice.pitch > 1, '声の型 high で高さが上がる');
});

test('解錠: ギフトで一定時間だけコメントが読める', () => {
  const st = createTtsState();
  const p = { ...base, unlockOn: true, unlockMinutes: 30, cooldownSec: 0 };
  assert.equal(decideTts(chat('u1', 'やあ'), p, st, 1000).skip, '読み上げ権がない');
  decideTts(gift('u1'), p, st, 1000);
  assert.ok(decideTts(chat('u1', 'やあ'), p, st, 2000).speak);
  assert.equal(decideTts(chat('u1', 'やあ'), p, st, 1000 + 31 * 60000).skip, '読み上げ権がない');
});

test('待ち行列の上限を超えたら読まない', () => {
  const st = createTtsState();
  st.waiting = 5;
  assert.equal(decideTts(chat('u1', 'やあ'), base, st, 1000).skip, '待ち行列が上限');
});

test('フォローと入室', () => {
  const st = createTtsState();
  const r = decideTts({ kind: 'follow', user: { id: 'u9', name: 'みき' } }, base, st, 1000);
  assert.equal(r.speak.text, 'みきさん、フォローありがとう！');
  assert.ok(st.followers.has('u9'));
  assert.equal(decideTts({ kind: 'member', user: { id: 'u9', name: 'みき' } }, base, st, 1000).skip, '入室の読み上げが切');
  const p = { ...base, joinOn: true };
  assert.equal(decideTts({ kind: 'member', user: { id: 'u9', name: 'みき' } }, p, st, 1000).speak.text, 'みきさん、いらっしゃい');
});

test('声の型の表がある', () => {
  assert.deepEqual(Object.keys(VOICE_TYPES).sort(), ['fast', 'high', 'low', 'normal', 'slow']);
});

test('声の型 random: 読むたびに型が変わっても範囲内に収まる', () => {
  const st = createTtsState();
  const p = { ...base, chatVoiceType: 'random', giftVoiceType: 'random', cooldownSec: 0 };
  for (let i = 0; i < 20; i++) {
    const r = decideTts(chat('u' + i, 'てすと'), p, st, 1000 + i);
    assert.ok(r.speak);
    assert.ok(r.speak.voice.rate >= 0.5 && r.speak.voice.rate <= 2);
    assert.ok(r.speak.voice.pitch >= 0 && r.speak.voice.pitch <= 2);
  }
});

test('テスト印はギフト・フォロー・入室でも読まない', () => {
  const p = { ...base, joinOn: true };
  assert.equal(decideTts(gift('u1', 1, { test: true }), p, createTtsState(), 1000).skip, 'テスト送信は読まない');
  assert.equal(decideTts({ kind: 'follow', user: { id: 'u2', name: 'はな' }, test: true }, p, createTtsState(), 1000).skip, 'テスト送信は読まない');
  assert.equal(decideTts({ kind: 'join', user: { id: 'u3', name: 'はな' }, test: true }, p, createTtsState(), 1000).skip, 'テスト送信は読まない');
});

test('ギフト名は GiftID の日本語対応表から引く（nameJa が無くても英語名を読まない）', () => {
  const ev = { kind: 'gift', user: { id: 'u1', name: 'さくら' }, gift: { id: '5655', name: 'Rose', nameJa: null, count: 1 }, coins: 1 };
  const r = decideTts(ev, base, createTtsState(), 1000);
  assert.equal(r.speak.text, 'さくらさん、バラありがとう！');
});

test('声の数値: 高さ 0 は 0 のまま。不正な値は有限な既定値に戻る', () => {
  const st = createTtsState();
  const r0 = decideTts(chat('u1', 'てすと'), { ...base, chatPitch: 0, cooldownSec: 0 }, st, 1000);
  assert.equal(r0.speak.voice.pitch, 0);
  const rBad = decideTts(chat('u2', 'てすと'), { ...base, chatRate: 'bad', chatPitch: 'bad', chatVolume: 'bad', cooldownSec: 0 }, st, 2000);
  assert.ok(Number.isFinite(rBad.speak.voice.rate));
  assert.ok(Number.isFinite(rBad.speak.voice.pitch));
  assert.equal(rBad.speak.voice.volume, 1);
});

test('部品の設定ファイルは入口の形で、正本に声の項目がある', async () => {
  const marker = await import('../public/widgets/tts/schema.js');
  assert.equal(marker.section, 'tts');
  const { SCHEMA, defaultsFor } = await import('../src/schema.js');
  assert.ok(SCHEMA.tts.fields.chatVoiceType.values.includes('random'));
  assert.ok(SCHEMA.tts.fields.giftVoiceType.values.includes('random'));
  assert.equal(defaultsFor('tts').chatVoiceName, '');
  assert.equal(defaultsFor('tts').giftVoiceName, '');
});
