# test/

Node.js の標準テストランナーで、サーバーの処理と公開画面の契約を確かめる。

| ファイル | 何をするか |
| --- | --- |
| `acceptance/visitors.test.js` | 実際の visitors map、設定変更、再起動、匿名化、保存期間、テスト送信、ウィジェットの完成条件を確かめる |
| `acceptance/` | カード単位の受け入れテストを置く |

## つながり

- 使うもの: `src/` と `public/widgets/`
- 使われ方: `npm test`（実行時のコードからは使わない）
