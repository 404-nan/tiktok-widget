// tw-guard 2巡目(カード docs/cards/tw-guard.md の「2巡目」)の受け入れテスト。
// AC-6: TW_SERVER で hosted の本番サーバーを送り先にしたローカルモードの spin_roulette は、
//       認証なし API(/api/control)を通じて実行されず、日本語で理由を返す。
// AC-7: tw unset の引数がないとき、未処理例外で落ちず、日本語の理由で終了コード 1。
// 本物の本番には触らない。hosted の送り先は一時ディレクトリの設定で起動した実物の server.js。

import test from 'node:test';
import assert from 'node:assert/strict';
import { callTool, localScenario, runCliWithCode, startHostedServer, startProxy, withMcp } from '../helpers/guard-harness.js';

const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

// --- AC-6: hosted の本番サーバーを送り先にしたローカルモードの spin_roulette ---
// hosted と判定の仕方は実装に任せるため、送り先は TW_HOSTED=1 で起動した実物の server.js にする。
// 記録用のプロキシを挟んで、/api/control への POST(認証なし API)が届いていないことを確かめる。

test('AC-6 MCP: 送り先が hosted の本番サーバーでも、ローカルモードの spin_roulette は認証なし API を通じずに日本語の理由を返す', async () => {
  const s = localScenario();
  const hosted = await startHostedServer(s);
  await hosted.ready;
  const proxy = startProxy(hosted.target);
  const proxyUrl = await proxy.served();
  try {
    await withMcp({ ...s.env, TW_SERVER: proxyUrl }, async ({ request }) => {
      const result = await callTool(request, 'spin_roulette', {});
      assert.ok(result.isError, `spin_roulette: 拒否として返っていません: ${JSON.stringify(result.text)}`);
      assert.ok(KANA_RE.test(result.text), `spin_roulette: 日本語の理由がありません: ${JSON.stringify(result.text)}`);
    });
    const spins = proxy.hits.filter((h) => h.method === 'POST' && h.url.startsWith('/api/control'));
    assert.equal(spins.length, 0, `spin_roulette が本番の認証なし API(/api/control)を通じて実行されました: ${JSON.stringify(proxy.hits)}`);
  } finally {
    await proxy.stop();
    hosted.child.kill();
    await new Promise((resolve) => hosted.child.once('exit', resolve));
  }
});

test('AC-7 CLI: tw unset に引数がないとき、未処理例外で落ちずに日本語の理由を出して終了コード 1', async () => {
  const s = localScenario();
  const { code, out } = await runCliWithCode(['unset'], s.env);
  assert.equal(code, 1, `tw unset: 終了コードが 1 ではありません(実際: ${code})\n${out}`);
  assert.ok(KANA_RE.test(out), `tw unset: 使い方や不足している引数の日本語の理由がありません\n${out}`);
  assert.ok(!/node:internal|UnhandledPromiseRejection|ReferenceError|SyntaxError|at\s+.*\(.+:\d+:\d+\)/.test(out), `tw unset: 未処理例外で落ちています\n${out}`);
});
