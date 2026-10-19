# test/

Node.js 標準テストで、設定・サーバー API・画面に見える動きを確かめます。

| ファイル | 何をするか |
| --- | --- |
| `acceptance/templates.test.js` | 配信テンプレートの完成条件を一時設定で受け入れテストする |
| `pre-ship-review.test.js` | 本番前レビューで見つかった画面とテンプレートのつなぎ目を確認する |
| `*.test.js` | 各機能の既存テスト |

`npm test` から実行され、本番の `config.yaml` と `data/` は使いません。
