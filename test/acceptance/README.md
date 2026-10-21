# test/acceptance/

カードに書かれた完成条件を、利用者から見える動きとして確かめます。

| ファイル | 何をするか |
| --- | --- |
| `dareba.test.js` | ダレ場の判定、進行、停止、テスト送信の受け入れ条件を確かめる |

## つながり

`test/README.md` から呼ばれ、`npm test` の一部として実行されます。
# test/acceptance

docs/cards/ の「完成の条件」(AC)を、そのまま確かめるテスト置き場です。実装より先に書き、最初は失敗します。

| ファイル | 何をするか |
|---|---|
| `guard.test.js` | dev/guard カードの AC(1人用の操作を本番で使わせない)の確認 |
| `guard-round2.test.js` | guard の 2 巡目レビューで足した確認 |
| `guard-round3.test.js` | guard の 3 巡目レビューで足した確認 |
| `obs.test.js` | obs カード(docs/cards/obs.md)の AC-1〜AC-13。偽の obs-websocket と vm 上のページで確かめる。AC-14 は `npm test` 全体で見る |

- 実行: `node --test test/acceptance/`
- 使うもの: `test/helpers/guard-harness.js`(guard 用)、`src/`・`public/widgets/`・`bin/tw.js`・`mcp/server.js`(読むだけ)
- obs.test.js は、まだ無い `public/widgets/obs-bridge.js`・`lib/sha256.js` などを読むため、実装前は失敗する
