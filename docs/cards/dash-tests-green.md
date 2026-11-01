# dash-tests-green: 本番ブランチで落ちているダッシュボードの受け入れテスト13件を緑に戻す

for: 北極星
仕事の種類: 直す
見た目が変わるか: 変わるかもしれない(テストが正しく、画面がずれていた場合だけ)

目的: 本番ブランチ `claude/tiktok-widgets-2qpqbk` の `npm test` で13件が落ちている(2026-11-01 確認、831件合格)。全部ブラウザで画面を開くテスト。このせいで、関係のないカード(obs-attempt-count など)も「実装が緑にならない」で止まる。

落ちているファイル: test/acceptance/redesign.test.js(AC-1・3・5)、active-label.test.js、media-pick.test.js、media-pick-round2.test.js、media-pick-round3.test.js、puchun-dash-fix.test.js
例: redesign.test.js:136 「下のタブに「配信中」がありません」

前提: 198d901「ホームを「配信中に見る」にし…」以後に画面の言葉や作りが変わった可能性が高い。テストが古いのか、画面が壊れたのかを、1件ずつ原因まで追って決める(principle-fix-root-causes)。めにが決めた画面の形(ホームは「配信中に見る」)は変えない。

触ってよいファイル: public/dashboard/ 以下、上の6つのテスト、README

完成の条件:
- AC-1 上の13件が通る。理由を件ごとに1行(テストを直した/画面を直した)で証拠に書く
- AC-2 テストを消す・skip する・待ち時間を伸ばすだけ、で通したものが無い
- AC-3 `npm test` が全部通る
- AC-4 画面を直した場合は、配信者が開く URL で PC 1280 とスマホ 390 の写真を撮って証拠に付ける

作らないもの: 新しい機能、言葉の言い換え、ほかの画面の手直し
証拠: 直す前に13件落ちる出力と、直した後に全部通る出力
