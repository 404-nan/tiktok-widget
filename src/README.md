# src/

サーバー側の集計・配信・設定・履歴の部品です。

| ファイル | 役目 |
| --- | --- |
| `hub.js` | イベントを集計し、通常形式または明示された compact 差分形式で WebSocket 配信する。 |
| `history.js` | 配信履歴を一定間隔または終了時に JSON 保存する。 |
| `ws-mode.js` | WebSocket URL の compact 指定を判定する。 |
| その他の `*.js` | `server.js` から使われる各機能の実装。 |

`server.js` が起動時に runtime と一緒に読み込みます。
