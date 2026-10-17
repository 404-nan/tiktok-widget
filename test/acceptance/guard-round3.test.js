// tw-guard 3巡目(カード docs/cards/tw-guard.md の「3巡目」)の受け入れテスト。
// AC-8: 1人用環境で TW_SERVER の送り先が hosted だと分かった test_event / tw test は、
//       リクエストを送らず日本語で理由を返す。
// AC-9: TW_SERVER の /api/me が 5xx などの異常な応答を返したときは、hosted か判定
//       できないまま /api/control を送信せず、今までどおりのエラーを返す。
// 本物の本番には触らない。hosted の送り先は一時ディレクトリの設定で起動した実物の server.js。

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { callTool, localScenario, runCliWithCode, startHostedServer, startProxy, withMcp } from '../helpers/guard-harness.js';

const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const REMOTE_HINT = (text) =>
  String(text)
    .split('\n')
    .some((line) => line.includes('/ai/v1') && line.includes('TW_SERVER') && line.includes('TW_AI_TOKEN'));

// --- AC-8: hosted だと分かった送り先への test_event ---

test('AC-8 MCP: 1人用で送り先が hosted の本番サーバーのとき、test_event はリクエストを送らず日本語の理由を返す', async () => {
  const s = localScenario();
  const hosted = await startHostedServer(s);
  await hosted.ready;
  const proxy = startProxy(hosted.target);
  const proxyUrl = await proxy.served();
  try {
    await withMcp({ ...s.env, TW_SERVER: proxyUrl }, async ({ request }) => {
      const result = await callTool(request, 'test_event', { kind: 'gift', giftName: 'Rose' });
      assert.ok(result.isError, `test_event: 拒否として返っていません: ${JSON.stringify(result.text)}`);
      assert.ok(KANA_RE.test(result.text), `test_event: 日本語の理由がありません: ${JSON.stringify(result.text)}`);
    });
    const sends = proxy.hits.filter((h) => h.url.startsWith('/api/simulate'));
    assert.equal(sends.length, 0, `test_event が本番の /api/simulate に送られました: ${JSON.stringify(proxy.hits)}`);
  } finally {
    await proxy.stop();
    hosted.child.kill();
    await new Promise((resolve) => hosted.child.once('exit', resolve));
  }
});

test('AC-8 CLI: 1人用で送り先が hosted の本番サーバーのとき、tw test はリクエストを送らず日本語の理由を出す', async () => {
  const s = localScenario();
  const hosted = await startHostedServer(s);
  await hosted.ready;
  const proxy = startProxy(hosted.target);
  const proxyUrl = await proxy.served();
  try {
    const { out } = await runCliWithCode(['test', 'gift', 'Rose', '1'], { ...s.env, TW_SERVER: proxyUrl });
    assert.ok(KANA_RE.test(out), `tw test: 日本語の理由が出ていません\n${out}`);
    const sends = proxy.hits.filter((h) => h.url.startsWith('/api/simulate'));
    assert.equal(sends.length, 0, `tw test が本番の /api/simulate に送られました: ${JSON.stringify(proxy.hits)}\n${out}`);
  } finally {
    await proxy.stop();
    hosted.child.kill();
    await new Promise((resolve) => hosted.child.once('exit', resolve));
  }
});

// --- AC-9: /api/me が異常な応答のときは /api/control を送らず今までどおりのエラー ---

/** /api/me が 5xx を返し、その他も 5xx を返す記録用サーバー */
function startBrokenMeServer() {
  const hits = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url });
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: '点検中です' }));
    });
  });
  return {
    hits,
    start: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    stop: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

// 「今までどおりのエラー」= ガードの拒否(リモートモードの代替方法を書いた理由)ではなく、
// サーバーの状態をそのまま伝える通常のエラー。点検中 / HTTP 50x / 接続できません のどれかの形。
const PLAIN_ERROR_RE = /接続できません|HTTP\s*\d{3}|点検中です/;

test('AC-9 MCP: /api/me が 5xx のとき、spin_roulette は /api/control を送らず今までどおりのエラーを返す', async () => {
  const s = localScenario();
  const rec = startBrokenMeServer();
  const url = await rec.start();
  try {
    await withMcp({ ...s.env, TW_SERVER: url }, async ({ request }) => {
      const result = await callTool(request, 'spin_roulette', {});
      assert.ok(result.isError, `spin_roulette: エラーになっていません: ${JSON.stringify(result.text)}`);
      assert.ok(PLAIN_ERROR_RE.test(result.text), `spin_roulette: 今までどおりのエラーではありません(ガードの拒否など別の文): ${JSON.stringify(result.text)}`);
      assert.ok(!REMOTE_HINT(result.text), `spin_roulette: 判定できないのにガードの拒否を返しています: ${JSON.stringify(result.text)}`);
    });
    const spins = rec.hits.filter((h) => h.method === 'POST' && h.url.startsWith('/api/control'));
    assert.equal(spins.length, 0, `spin_roulette が判定できないまま /api/control を送信しました: ${JSON.stringify(rec.hits)}`);
  } finally {
    await rec.stop();
  }
});

test('AC-9 CLI: /api/me が 5xx のとき、tw spin は /api/control を送らず今までどおりのエラーを出す', async () => {
  const s = localScenario();
  const rec = startBrokenMeServer();
  const url = await rec.start();
  try {
    const { code, out } = await runCliWithCode(['spin'], { ...s.env, TW_SERVER: url });
    assert.ok(code !== 0, `tw spin: エラーとして終わっていません(終了コード ${code})\n${out}`);
    assert.ok(PLAIN_ERROR_RE.test(out), `tw spin: 今までどおりのエラーではありません(ガードの拒否など別の文)\n${out}`);
    assert.ok(!REMOTE_HINT(out), `tw spin: 判定できないのにガードの拒否を返しています\n${out}`);
    const spins = rec.hits.filter((h) => h.method === 'POST' && h.url.startsWith('/api/control'));
    assert.equal(spins.length, 0, `tw spin が判定できないまま /api/control を送信しました: ${JSON.stringify(rec.hits)}\n${out}`);
  } finally {
    await rec.stop();
  }
});
