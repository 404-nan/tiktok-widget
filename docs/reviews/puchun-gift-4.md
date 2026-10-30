# レビュー: puchun-gift 

【直す】READMEの機能一覧がカード指定の1行ではなく2行追加されています。[README.md:38](/home/lul/tiktok-widget-wt/puchun-gift/README.md:38) [README.md:39](/home/lul/tiktok-widget-wt/puchun-gift/README.md:39)
【軽い】`puchunTestPlay` は本番コードから呼ばれず、テストだけが直接呼んでいます。実際の見本ボタンは別実装なので、不要な部品です。[src/puchun.js:34](/home/lul/tiktok-widget-wt/puchun-gift/src/puchun.js:34)
【軽い】AC-2の画面テストが schema の項目存在しか見ていません。`editor.js` の入力欄生成、見本ボタンのクリック、iframe URL を確かめていないため、画面が壊れてもテストが通ります。[test/acceptance/puchun-gift.test.js:116](/home/lul/tiktok-widget-wt/puchun-gift/test/acceptance/puchun-gift.test.js:116)
【軽い】カードに無い `docs/reviews/puchun-gift-1.md`〜`3.md` が追加されています。
`npm test` は 790件中788件成功、2件スキップ、失敗0件でした。
