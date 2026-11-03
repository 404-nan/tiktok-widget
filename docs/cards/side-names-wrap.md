# side-names-wrap: ダッシュボードの左の列の名前を切らない。幅390の「見本を出す」のスイッチの形を直す
for: raikone-users
仕事の種類: 直す
見た目が変わるか: 変わる

なぜ要るか(配信者): 幅1280の左の列で、名前が途中で切れて読めない(「パチンコ演」「ダレ場の小」「ステップア」「ギフト別サ」。写真 artifacts/shots/url-first-choice-1280-closed.png)。初めての人は、何の項目か押すまで分からない。幅390の URL の画面では、「見本を出す」のスイッチが横長にならず丸い枠に崩れている(同じ場所の url-first-choice-390-closed.png)。
前提(確かめた): 切れている原因は public/dashboard/style.css の `@media (min-width: 900px)` の「左の列: 文字は1行」の `[data-mode=simple] .side-item span { white-space: nowrap; overflow: hidden; text-overflow: clip; }`。前の規則の `white-space: normal` をこれが打ち消している。左の列は幅84px で、一番長い名前は「最後の一投とエンドロール」(12字)。`.side` は幅1280で overflow-y が hidden。スイッチの本来の形は同じファイルの `.sample-control > .check input[type=checkbox]`(幅44・高さ26)。崩れる原因はまだ確かめていない。kind-ui を読む。開発 3940 と本番 3939 は触らない。テストは url-first-choice.test.js と同じく、空いた番号と一時のデータで起動する。
触ってよい: public/dashboard/style.css public/dashboard/README.md README.md CHANGELOG.md test/acceptance/side-names-wrap.test.js artifacts/shots/*

## 完成の条件
テストは本物のブラウザで測る。
- AC-1 幅1280で、全部のウィジェットを左の列に出した状態で、見えている `.side-item` の文字は全部切れない(`span` の scrollWidth が clientWidth 以下、scrollHeight が clientHeight 以下)。文字は折り返し、省略記号も使わない。名前の文字そのものは変えない。
- AC-2 高さ720の窓でも、左の列の全部の項目と「使い方」「設定」に、スクロールすれば届く(一番下の項目を scrollIntoView すると窓の中に入る)。
- AC-3 幅390の URL の画面で、「見本を出す」のスイッチは幅44・高さ26。押すとオンになり、もう一度押すとオフに戻る。
- AC-4 幅390と幅1280で、ページが横にはみ出さない。幅390の下のタブの見た目と文字は今のまま。
- AC-5 既存のテストが全部通る。

## 作らないもの
名前の変更、左の列の幅の変更、ほかの画面のスイッチの直し、ダッシュボードの作り直し。

## 証拠
幅1280の左の列の写真(全部のウィジェットを出した状態)と、幅390の URL の画面の写真を artifacts/shots/ に置く。レビュー役は写真で、切れた名前が無いことと、スイッチが横長であることを確かめる。LIVE Studio には関係しない。

## 2巡目(レビューで見つかったもの)
- なし(`docs/reviews/side-names-wrap-1.md` の指摘は、証拠の写真の撮り直し(今の「証拠」の条件のまま満たせばよい)、テストの書き方(AC-1)、下端のフェード(style.css:1907 で幅900以上は消えていて、幅1280で測ると `mask-image: none`。一番下の項目も読めた)で、本番で壊れる・落ちる・鍵が漏れる・データが消える・Discord の決まりを破るものは無かった)
