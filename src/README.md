# src/

サーバー側の状態管理・設定・外部連携を置くフォルダです。

| ファイル | 役目 |
| --- | --- |
| `combo.js` | コンボの回数・段階・終了イベント・テスト用状態を管理し、Hubへ配る |
| `runtime.js` | 配信者ごとの設定・イベント・各ウィジェットをつなぐ |
| `hub.js` | 本番イベントとテストイベントを分けて配る |
| `schema.js` | 設定項目・初期値・日本語の説明を定義する |

`runtime.js` が `combo.js` と `hub.js` を使い、`public/widgets/combo.html` が `/api/combo` と WebSocket で受け取ります。
