# レビュー: media-pick 3巡目

【直す】`public/dashboard/editor.js:382`  
`active.puchuns` が `default` で、別のプリセットが最後にある場合、「使っているもの」を押すと使用中の `default` ではなく最後のプリセットが開く。AC-6 のテストは `a` の場合だけで、`default` を確かめていない。
【軽い】`test/acceptance/media-pick.test.js`  
音声5欄のうち `redVoice` しか確認していない。`blueVoice`・`greenVoice`・`goldVoice`・`rainbowVoice` が select になっていなくてもテストが通る。
【軽い】カードにない変更がある  
`artifacts/shots/puchun-e2e.png` が差し替わっている。別カードの証拠画像を上書きしている。
【軽い】カードの「触ってよいファイル」にない `docs/reviews/media-pick-1.md` と `docs/reviews/media-pick-2.md` が追加されている。
`npm test`: 820件中818通過、0失敗、2スキップ。
