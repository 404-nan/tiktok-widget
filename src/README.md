# src/

サーバー側の接続、イベント処理、設定、配信状態を担当する。来場記録は `runtime.js` から `visitors.js` を使う。

| ファイル | 何をするか |
| --- | --- |
| `visitors.js` | 配信者ごとの秘密鍵で来場者 ID を HMAC 化し、複数設定の最短保存期間・常連回数で通知と匿名記録を管理する |
| `schema.js` | `visitors` を含む設定項目・初期値・説明を定義する |
| `runtime.js` | 来場記録を起動し、設定・API・テスト送信・終了処理につなぐ |
| `demo.js` | `member` を含むテスト用イベントを作る |
| `admin.js` | CLI と MCP からテスト送信を依頼する |
| `ai-mcp.js` | AI 向け MCP のテスト送信の入力を定義する |

## つながり

- 使うもの: `hub.js` の `status` / `event` / `testEvent` / `config`、`config.js` の設定検証
- 使われるところ: `runtime.js`、`mcp/server.js`、`bin/tw.js`
