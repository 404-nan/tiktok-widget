# test/

Node標準テストで、サーバー側の仕組みと公開画面の配線を確認します。

| ファイル | 何をするか |
| --- | --- |
| `acceptance/dareba.test.js` | ダレ場の判定、状態、停止、テスト送信の受け入れ条件を確かめる |
| `dareba-wiring.test.js` | 設定・機能一覧・ダッシュボード・公開ウィジェットの配線を確かめる |
| `acceptance/peka.test.js` | Pekaの完成条件ごとの受け入れテスト |
| `peka-wiring.test.js` | ランタイム、API、CLI、MCP、ダッシュボード、公開画面の配線テスト |
| `acceptance/throne.test.js` | 動く王座の完成条件ごとの受け入れテスト |
| `throne-wiring.test.js` | 王座の設定、操作経路、公開画面の配線テスト |
| `acceptance/ootori.test.js` | 大トリの完成条件ごとの受け入れテスト |
| `ootori-wiring.test.js` | 大トリの設定、操作経路、公開画面の配線テスト |
| `acceptance/relay-stop.test.js` | リレー停止の完成条件ごとの受け入れテスト |
| `acceptance/mc-named-sabotage.test.js` | 名前入りMinecraft妨害の安全化、状態、上限、テスト隔離を確かめる |
| `acceptance/mc-goal-alert.test.js` | ゴール距離の問い合わせ、段階警報、再武装、ゴール到達、テスト隔離を確かめる |
| `pre-ship-regressions.test.js` | 本番前レビューの実接続・再起動・二重処理の再現条件を確かめる |
| `mc-goal-alert-wiring.test.js` | ゴール接近警報の設定、ランタイム、RCON、公開画面の配線を確かめる |
| `relay-stop-wiring.test.js` | リレー停止の設定、操作経路、公開画面の配線テスト |
| `*.test.js` | 既存機能のテスト |

## つながり

テストは `npm test` で実行します。本番の `config.yaml` や `data/` は使いません。
