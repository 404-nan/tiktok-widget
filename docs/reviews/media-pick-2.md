# レビュー: media-pick 2巡目

【直す】`public/dashboard/editor.js:772` で「使っているもの」を押すと、現在使用中ではなく一覧の最後のプリセットを開くように変わっている。既存の設定編集を壊す。
【直す】`artifacts/shots/puchun-e2e.png` がこのカードと無関係に差し替わっている。既存カードの証拠を上書きしている。
【軽い】`media-pick-round2.test.js` は写真のサイズしか確認せず、立ち絵の select が写っているかは確認しない。誤った写真でもテストが通る。
【軽い】`test/acceptance/README.md:27` に「実装前は失敗する」と残っており、現在の状態と合わない。
【軽い】`src/schema.js:389-393` の既存説明文を「青の段階で鳴らす声」などから「青の声」へ変更している。カードにない表示変更。
【軽い】カードにない `docs/reviews/media-pick-1.md` を追加している。
`npm test` は817通過・0失敗・2スキップ。
