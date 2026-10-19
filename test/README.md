# test/

Node標準テストで、サーバー側の仕組みと公開画面の配線を確認します。

| ファイル | 何をするか |
| --- | --- |
| `acceptance/peka.test.js` | Pekaの完成条件ごとの受け入れテスト |
| `peka-wiring.test.js` | ランタイム、API、CLI、MCP、ダッシュボード、公開画面の配線テスト |
| `acceptance/throne.test.js` | 動く王座の完成条件ごとの受け入れテスト |
| `throne-wiring.test.js` | 王座の設定、操作経路、公開画面の配線テスト |
| `acceptance/ootori.test.js` | 大トリの完成条件ごとの受け入れテスト |
| `ootori-wiring.test.js` | 大トリの設定、操作経路、公開画面の配線テスト |
| `acceptance/relay-stop.test.js` | リレー停止の完成条件ごとの受け入れテスト |
| `relay-stop-wiring.test.js` | リレー停止の設定、操作経路、公開画面の配線テスト |
| `*.test.js` | 既存機能のテスト |

テストは `npm test` で実行します。本番の `config.yaml` や `data/` は使いません。
