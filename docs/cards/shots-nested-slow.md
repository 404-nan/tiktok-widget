# shots-nested-slow: npm test の中で npm test 全部をもう1回走らせない

for: incidents
仕事の種類: 直す(小さく)
見た目が変わるか: 変わらない

目的: `test/acceptance/shots-tmp.test.js` の AC-3 が、一時の写しの中で `npm test` を丸ごともう1回走らせている。全体テストの時間がほぼ2倍になり、負荷が高いとき integrate が時間切れで落ちる(2026-10-31 19時、integrate raikone が20分以上かかった)。配信者への出荷が遅れる。

前提(今のコード):
- `test/acceptance/shots-tmp.test.js` の AC-3 テストが `spawnSync('npm', ['test'], { cwd: 写し })` で全体を走らせる
- AC-1 の2つは puchun-e2e だけを走らせる(軽い)。これは残す
- repo が汚れたら loop integrate が「未コミット」で止まるので、ふだんの見張りはそこにある

## 完成の条件
- AC-1 ふだんの `npm test` では、写しの中で全体の `npm test` を走らせない。shots-tmp の AC-3 は環境変数 `SHOTS_TMP_FULL=1` のときだけ走る(無いときは skip と理由が出る)
- AC-2 `SHOTS_TMP_FULL=1 node --test test/acceptance/shots-tmp.test.js` では今まで通り AC-3 が走って通る
- AC-3 受け入れテスト(新規 `test/acceptance/shots-nested-slow.test.js`)で、`SHOTS_TMP_FULL` が無いとき shots-tmp の AC-3 が skip になることを確かめる(直す前は落ちる)
- AC-4 `test/acceptance/README.md` に、全体を写して確かめたいときの走らせ方を1行書く
- AC-5 `npm test` が全部通る。直す前と後の `npm test` のかかった時間を証拠に書く

## 触ってよいファイル
- `test/acceptance/shots-tmp.test.js`、新規 `test/acceptance/shots-nested-slow.test.js`、`test/acceptance/README.md`、`CHANGELOG.md`

## 作らないもの
- 他のテストの書き換え、autopilot・loop 側の変更、思いつき箱(ideas.md)の書き換え

証拠: 新しいテストが直す前に落ち、直した後に通る出力。直す前と後の `npm test` のかかった時間
