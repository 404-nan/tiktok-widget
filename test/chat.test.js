import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../src/hub.js';
import { makeEvent } from '../src/demo.js';
import { normalize } from '../src/config.js';
import { chatFilter, gifterTier, speechText } from '../public/widgets/lib/chat.js';

const chat = (text, user = { id: 'sakura', name: 'さくら' }) => ({ kind: 'chat', user, text });

test('コメント欄: NG ワード・隠すユーザー・「!」のコマンドは出さない', () => {
  const show = chatFilter({ hideWords: ['宣伝', 'SPAM'], hideUsers: ['@bot_01', 'あらし'], hideCommands: true });
  assert.equal(show(chat('こんばんは')), true);
  assert.equal(show(chat('チャンネルの宣伝です')), false);
  // 大文字小文字・全角半角の違いは同じとみなす
  assert.equal(show(chat('ｓｐａｍ だよ')), false);
  assert.equal(show(chat('hi', { id: 'bot_01', name: 'ボット' })), false);
  assert.equal(show(chat('hi', { id: 'x', name: 'あらし' })), false);
  assert.equal(show(chat('!roulette')), false);
  assert.equal(show(chat('！ルーレット')), false);
  assert.equal(show(chat('   ')), false);
  // コマンドを出す設定なら出す
  assert.equal(chatFilter({ hideCommands: false })(chat('!roulette')), true);
});

test('コメント欄: 送ったコインの合計で段階が上がる', () => {
  const p = { gifterCoins: 1, bigGifterCoins: 1000, topGifterCoins: 10000 };
  assert.equal(gifterTier(0, p), 0);
  assert.equal(gifterTier(1, p), 1);
  assert.equal(gifterTier(999, p), 1);
  assert.equal(gifterTier(1000, p), 2);
  assert.equal(gifterTier(10000, p), 3);
  // 順番が逆に書かれていても、上の段が下の段より易しくならない
  assert.equal(gifterTier(50, { gifterCoins: 100, bigGifterCoins: 10, topGifterCoins: 10 }), 0);
});

test('コメント欄: 読み上げる文を読みやすくする', () => {
  assert.equal(speechText(chat('こんばんは')), 'さくらさん、こんばんは');
  assert.equal(speechText(chat('こんばんは'), { ttsName: false }), 'こんばんは');
  assert.equal(speechText(chat('おもろいwwww')), 'さくらさん、おもろい わら');
  assert.equal(speechText(chat('88888')), 'さくらさん、ぱちぱち');
  assert.equal(speechText(chat('🎉🎉')), '');
  assert.equal(speechText(chat('見て https://example.com/x')), 'さくらさん、見て');
  // 同じ文字の続きは短く、長いコメントは途中まで
  assert.equal(speechText(chat('すごーーーーーい！！！！！！'), { ttsName: false }), 'すごーーーい！！！');
  const long = speechText(chat('あいうえお'.repeat(20)), { ttsName: false });
  assert.equal(long, `${'あいうえお'.repeat(12)}、以下略`);
});

test('コメントには、この配信でその人が送ったコインの合計が付く', () => {
  const hub = new Hub();
  hub.publish(makeEvent('chat', { user: 'さくら', text: 'こんばんは' }));
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Corgi', count: 1 }));
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Doughnut', count: 2 }));
  hub.publish(makeEvent('chat', { user: 'さくら', text: 'ギフト送ったよ' }));
  hub.publish(makeEvent('chat', { user: 'たろう', text: 'やあ' }));
  const chats = hub.recentChats;
  assert.deepEqual(
    chats.map((e) => [e.user.name, e.text, e.giftCoins]),
    [
      ['たろう', 'やあ', 0],
      ['さくら', 'ギフト送ったよ', 299 + 60],
      ['さくら', 'こんばんは', 0],
    ],
  );
  // リセット（新しい配信）で合計も最近のコメントも消える
  hub.reset();
  assert.deepEqual(hub.recentChats, []);
  hub.publish(makeEvent('chat', { user: 'さくら', text: 'また来た' }));
  assert.equal(hub.recentChats[0].giftCoins, 0);
});

test('読み込み直したコメント欄に、最近のコメントを渡す', () => {
  const hub = new Hub();
  for (let i = 0; i < 40; i++) hub.publish(makeEvent('chat', { text: `コメント${i}` }));
  hub.publish(makeEvent('like'));
  const sent = [];
  hub.addClient({ readyState: 1, send: (t) => sent.push(JSON.parse(t)), on() {} });
  const hello = sent[0];
  assert.equal(hello.type, 'hello');
  assert.equal(hello.recentChats.length, 30);
  assert.equal(hello.recentChats[0].text, 'コメント39');
});

test('コメント欄の設定: 初期値で埋まり、段階の順番がおかしいと警告する', () => {
  const ok = normalize({ chats: { default: { hideUsers: ['@bot', 'someone'] } } });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  const c = ok.config.chats.default;
  assert.equal(c.style, 'telop');
  assert.equal(c.maxItems, 8);
  assert.equal(c.tts, false);
  assert.deepEqual(c.hideUsers, ['bot', 'someone']);

  const bad = normalize({ chats: { a: { style: 'scroll', maxItems: 0, bigGifterCoins: 50000 } } });
  assert.ok(bad.errors.some((e) => e.includes('chats.a.style') && e.includes('telop / bubble')));
  assert.ok(bad.errors.some((e) => e.includes('chats.a.maxItems')));
  assert.ok(bad.warnings.some((w) => w.startsWith('chats.a:') && w.includes('topGifterCoins')));
});
