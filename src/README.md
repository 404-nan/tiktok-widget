# src/

サーバー側の設定定義、イベント集計、ウィジェットの状態、外部操作を置く場所です。

| ファイル | 役目 |
| --- | --- |
| `push-button.js` | コメントといいねを押し数へ集計し、結果を WebSocket で配る |
| `schema.js` | `pushButtons` を含む設定項目・初期値・日本語説明を定義する |
| `runtime.js` | 押しボタンを起動し、HTTP 操作とテナント制限をつなぐ |
| `hub.js` | イベントを集め、配信中のテストを本番集計から分ける |
| `admin.js` | CLI と MCP から押しボタンを操作する共通入口 |
| `cheer.js` | いいねをため、満タンと次の目標を WebSocket で配る（記録しない） |
| `ai-api.js` / `ai-mcp.js` | AI 用の操作入口に応援ゲージを足す |

`server.js` が `runtime.js` を起動し、`runtime.js` が `hub.js` のイベントを `push-button.js` へ渡します。
`runtime.js` は `cheer.js` にいいねイベントを渡し、公開画面が状態を表示します。
