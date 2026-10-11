import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { Rcon } from '../src/rcon.js';
import { Minecraft, ruleMatches, fill, safe, varsFor } from '../src/minecraft.js';

// Minecraft の RCON と同じ手順で応答する偽のサーバー
function fakeRcon(password) {
  const received = [];
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4 && buf.length >= 4 + buf.readInt32LE(0)) {
        const len = buf.readInt32LE(0);
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.toString('utf8', 12, 4 + len - 2);
        buf = buf.subarray(4 + len);
        const reply = (rid, text) => {
          const p = Buffer.from(text, 'utf8');
          const out = Buffer.alloc(14 + p.length);
          out.writeInt32LE(10 + p.length, 0);
          out.writeInt32LE(rid, 4);
          out.writeInt32LE(0, 8);
          p.copy(out, 12);
          sock.write(out);
        };
        if (type === 3) reply(body === password ? id : -1, '');
        else {
          received.push(body);
          reply(id, `ok: ${body}`);
        }
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received })));
}

const fake = await fakeRcon('secret');
after(() => fake.server.close());

test('RCON: ログインしてコマンドを送り、返事を受け取る', async () => {
  const rcon = new Rcon({ host: '127.0.0.1', port: fake.port, password: 'secret' });
  assert.equal(await rcon.send('say こんにちは'), 'ok: say こんにちは');
  assert.equal(await rcon.send('time set day'), 'ok: time set day');
  rcon.close();
});

test('RCON: パスワードが違うとエラー', async () => {
  const rcon = new Rcon({ host: '127.0.0.1', port: fake.port, password: 'wrong' });
  await assert.rejects(rcon.send('say x'), /パスワード/);
  rcon.close();
});

test('ルールの条件', () => {
  const gift = { kind: 'gift', user: { id: 'u1' }, gift: { name: 'Rose', id: '5655', count: 3 }, totalDiamonds: 3 };
  assert.equal(ruleMatches({ gifts: ['rose'] }, gift), true);
  assert.equal(ruleMatches({ gifts: ['Lion'] }, gift), false);
  assert.equal(ruleMatches({ minCoins: 10 }, gift), false);
  assert.equal(ruleMatches({}, gift), true); // 条件なしはギフト全部
  assert.equal(ruleMatches({}, { kind: 'follow' }), false);
  assert.equal(ruleMatches({ events: ['follow'] }, { kind: 'follow', user: {} }), true);
  assert.equal(ruleMatches({ users: ['u2'] }, gift), false);
});

test('置き換えと、視聴者の名前の無害化', () => {
  assert.equal(safe('さくら"; op @a'), 'さくら op a');
  const vars = varsFor({ kind: 'gift', user: { name: 'Ken{x}' }, gift: { name: 'Rose', id: '5655', count: 2 }, totalDiamonds: 2 });
  assert.equal(fill('say {user} から {gift} ×{count}（{coins}）{unknown}', vars), 'say Kenx から Rose ×2（2）{unknown}');
});

test('ギフトでルールのコマンドを送る（perCount で個数分）', async () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const mc = new Minecraft(hub);
  mc.setConfig({
    enabled: true,
    host: '127.0.0.1',
    port: fake.port,
    password: 'secret',
    rules: [{ gifts: ['Rose'], perCount: true, commands: ['summon zombie {userId}'] }],
  });
  fake.received.length = 0;
  hub.emit('event', { kind: 'gift', user: { id: 'u1', name: 'A' }, gift: { name: 'Rose', id: '1', count: 3 }, totalDiamonds: 3 });
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(fake.received, ['summon zombie u1', 'summon zombie u1', 'summon zombie u1']);
  mc.rcon?.close();
});

test('SuperStream の演出を起こすコマンド（ルール・ギフトの受け渡し・ルーレット）', async () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const mc = new Minecraft(hub);
  mc.setConfig({
    enabled: true,
    host: '127.0.0.1',
    port: fake.port,
    password: 'secret',
    superstreamProfile: 'my_profile',
    forwardGifts: true,
    rules: [{ events: ['follow'], commands: [], superstreamAction: 'lightning' }],
  });
  fake.received.length = 0;
  hub.emit('event', { kind: 'gift', user: { id: 'u1' }, gift: { name: 'Rose', id: '5655', count: 2 }, totalDiamonds: 2 });
  hub.emit('event', { kind: 'follow', user: { id: 'u2', name: 'B' } });
  mc.onRouletteResult({ id: 'r', name: '罰' }, { label: '隕石', superstreamGift: '6001' }, null);
  await new Promise((r) => setTimeout(r, 600));
  assert.deepEqual(fake.received, [
    'ss test profile my_profile 5655',
    'ss test profile my_profile 5655',
    'ss test action my_profile lightning',
    'ss test profile my_profile 6001',
  ]);
  mc.rcon?.close();
});
