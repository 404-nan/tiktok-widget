# scripts/perf/

一時サーバーとChrome headlessを使い、ウィジェットとサーバーの負荷を同じ条件で測るフォルダです。`src/` と `public/` のコードは計測のために変更しません。

| ファイル / フォルダ | 役目 |
| --- | --- |
| `widgets.mjs` | 11個のウィジェットをChromeで測り、日本語の表とJSONを出す |
| `server.mjs` | 一時サーバーへイベントを送り、処理速度・メモリ・WebSocket・記録量を測る |
| `limits.json` | CPU・ヒープ・フレーム・サーバーの上限を持つ |
| `lib/` | 引数、Chrome/CDP、一時サーバー、判定、出力の共通部品 |

## 使われるところ

受け入れテスト `test/acceptance/perf-*.test.js` から呼ばれます。詳しい条件と数字の読み方は [`docs/knowledge/performance.md`](../../docs/knowledge/performance.md) を見てください。
