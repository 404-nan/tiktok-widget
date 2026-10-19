# src/

設定検証、配信状態、管理操作などサーバー側の中心部です。

| ファイル | 役目 |
| --- | --- |
| `schema.js` | `obs`を含む設定項目・既定値・日本語説明 |
| `config.js` | 設定値とOBSルールの検証・既定値への補完 |
| `admin.js` | CLI・MCPから共通利用する操作 |

`server.js`からruntimeが使い、CLIは`bin/tw.js`、MCPは`mcp/server.js`から呼びます。
