# giftlist-keep-names: ギフトの表を作り直しても、前の名前を黙って変えない
for: raikone-users
仕事の種類: 直す
見た目が変わるか: 変わらない

なぜ要るか(配信者): `scripts/giftlist.js` は TikTok の今の名前で前の名前を上書きする。11/3 の更新では3件(5879、59450、1322386)が黙って変わりかけ、画面の名前と、名前で判定している演出の設定が変わるところだった。さらにブラウザ用の表は別のスクリプトを手で走らせないと古いまま残る。
前提(確かめた): 名前の上書きは `scripts/giftlist.js` の `names[id] = [nameEn, nameJa]`。ブラウザ用の表は `scripts/build-gift-names.js` が作る。どちらも入出力の場所を `import.meta.url` からの相対で決めているので、一時の場所に写して動かせる。
触ってよい: scripts/giftlist.js scripts/README.md README.md AGENTS.md test/acceptance/giftlist-keep-names.test.mjs

## 完成の条件
テストは scripts/ と src/ の表を一時の場所に写し、`node --import <fetch の偽物>` で `giftlist.js` を実際に動かして確かめる。ネットにはつながない。
- AC-1 表にある id の名前が一覧と違っても、英語名・日本語名とも前のまま残る。
- AC-2 名前が前と違った id は、id と前の名前と今の名前を標準出力に1件1行で出す。無ければ出さない。
- AC-3 表に無い id は今まで通り足され、件数の行に新規の数が出る。
- AC-4 コインの値は今まで通り一覧の値に更新し、値が変わった id は id と前後の値を標準出力に1件1行で出す。
- AC-5 走り終わると、ブラウザ用の表 public/widgets/lib/gift-names-ja.js も新しい名前を含む形で作り直されている。
- AC-6 日本語名が1件も返らないときは今まで通り終了コード1で止まり、3つの表のどれも書き換えない。
- AC-7 既存のテストも全部通る。README.md と AGENTS.md の説明(「上書き」の所)を今の動きに直す。

## 作らないもの
名前を今の一覧へ切り替えるオプション、定期の自動更新、画面の変更、表の中身の更新。

## 証拠
回帰テストと全テストの結果。
