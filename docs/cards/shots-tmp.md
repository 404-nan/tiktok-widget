# shots-tmp: テストを走らせても repo の中のファイルが変わらないようにする

for: incidents
仕事の種類: 直す(小さく)
見た目が変わるか: 変わらない

目的: 本番のチェックアウト(~/tiktok-widget)で誰かが `npm test` を走らせると、`test/acceptance/puchun-e2e.test.js` が `artifacts/shots/puchun-e2e.png` を上書きし、integrate が「未コミットの変更」で止まる。今日3回目(ideas.md 2026-10-31 [仕組み])。配信者への出荷が止まる。

前提(今のコード):
- `test/acceptance/puchun-e2e.test.js` 12行の `SHOT` が repo の中の `artifacts/shots/puchun-e2e.png` を指し、123行・145行で書く
- `test/acceptance/media-pick-round2.test.js` 71〜72行は `artifacts/shots/` の写真を読むだけ(書かない)。触らない

## 完成の条件
- AC-1 `puchun-e2e.test.js` は写真を、環境変数 `SHOT_DIR` があればそこへ、無ければ `os.tmpdir()` の下へ書く。repo の中には書かない
- AC-2 写真が空でないことの確かめ(今の assert)は残す
- AC-3 きれいなチェックアウトで `npm test` を走らせたあと、`git status --porcelain` が何も出さない(受け入れテストで確かめる。新規 `test/acceptance/shots-tmp.test.js`。直す前は落ちる)
- AC-4 `test/acceptance/README.md` の puchun-e2e の行の写真の場所を直す
- AC-5 `npm test` が全部通る

## 触ってよいファイル
- `test/acceptance/puchun-e2e.test.js`、新規 `test/acceptance/shots-tmp.test.js`、`test/acceptance/README.md`、`CHANGELOG.md`

## 作らないもの
- 他の受け入れテストの書き換え、`artifacts/shots/` の中の既存の写真の削除、autopilot 側の変更、思いつき箱(ideas.md)の書き換え

証拠: 新しいテストが直す前に落ち、直した後に通る出力。`npm test` のあとの `git status --porcelain` が空の出力
