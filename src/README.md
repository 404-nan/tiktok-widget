# src/

サーバー側の設定、イベント処理、配信状態、ウィジェットの仕組みを置くフォルダです。

| ファイル | 何をするか |
| --- | --- |
| `peka.js` | 遅れて光る告知ランプの抽選、予定時刻、点灯、待ち行列をサーバーで管理する |
| `schema.js` | 設定項目の初期値・範囲・日本語の説明を定義する |
| `runtime.js` | Pekaを含む各仕組みを起動し、APIとイベントをつなぐ |
| `hub.js` | TikTokイベントを集め、集計とWebSocket配信を行う |
| `*.js` | 配信、設定、履歴、ゲーム、外部連携などのサーバー側機能 |

Pekaは `runtime.js` から `hub.js` の `event`・`testEvent`・`reset` を購読し、`public/widgets/peka.html` へAPIとWebSocketで状態を渡します。
