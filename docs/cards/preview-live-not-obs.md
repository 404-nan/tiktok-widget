# preview-live-not-obs: 見本の「動きを確認」を外すと、見本が配信ソフトの接続として数えられるのを直す
for: 北極星
仕事の種類: 直す
見た目が変わるか: 変わらない

なぜ要るか: 配信者がダッシュボードの見本で「動きを確認」を外すだけで、まだ配信ソフトに入れていないのに「入れた」と数えられ、「配信ソフトに入れる」の案内が消える。接続の記録(obs-attempt-count)と北極星の数字も濁る。

前提: コミット 8f55682 で見本の URL に preview=live が増えた。overlay.js の接続は preview=1 / preview=live の両方を見本として扱うが、public/widgets の多くのファイルは `/[?&]preview=1/` だけを見て `/ws?preview=1` につなぐので、preview=live だとただの `/ws`(配信ソフトの接続)になる。vote.js:245 は `has('preview')` で見本の投票を出すので、「配信画面そのまま」でも見本が出る。
目的: preview=live の見本を、接続として数えない。見え方は本番と同じにする。
触ってよい: public/widgets 以下、public/widgets/README.md、test 以下の新しいテスト1つ、README.md

## 完成の条件
- AC-1 public/widgets の中で `/ws` を開くファイルは全部、URL が preview=1 でも preview=live でも `/ws?preview=1` でつなぐ。ファイルの一覧はテストが自動で集め、新しいウィジェットの見落としも落ちる形にする。
- AC-2 preview の無い URL(配信ソフトで開く URL)は今までどおりただの `/ws` でつなぐ。
- AC-3 待機の目印や見本の中身(body.preview、vote.js の見本の投票)は preview=1 のときだけ出す。preview=live では出さない。
- AC-4 新しいテスト1つで AC-1〜3 を確かめる。実サーバーで gacha.html?preview=live を開いても配信ソフトの接続(widgetAt)が付かないことも確かめる。既存の npm test も全部通る。本番 3939 は触らない。
- AC-5 public/widgets/README.md の preview の説明(52行目あたり)を preview=live も入れて直す。

## 証拠
新しいテストの結果と npm test 全体の結果。

## 途中で足した直し
dash-tests-green の AC-3 は全テストの中で全テストを走らせ、時間が倍になって pipeline の時間切れ(1500秒)で「失敗1件」と数えられ、このカードが止まった。外の npm test と同じことを確かめているだけなので外した。
