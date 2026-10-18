# test/acceptance

完成条件カード(`docs/cards/*.md`)の AC を1つずつ確かめるテスト置き場。`npm test`(`node --test`)で他のテストと一緒に走る。

## ファイル

- `guard.test.js` / `guard-round2.test.js` / `guard-round3.test.js`: `docs/cards/tw-guard.md`(1人用の操作を本番で使わせない)の AC。`../helpers/guard-harness.js` を使う
- `info-feed.test.js`: `docs/cards/info-feed.md`(ニュースティッカーと最近のサポーター)の AC。サーバー側(AC-1〜4、13、14)は `src/info-feed.js`・`src/config.js`・`src/runtime.js` を直接動かし、画面側(AC-5〜12、15、16)はソースの文字列で確かめる。実装前は失敗するのが正しい状態

## 使われ方・使うもの

- 使うもの: `src/` と `public/` の実コード、`../helpers/`
- 使われ方: `npm test` だけ。実行時のコードからは呼ばれない
