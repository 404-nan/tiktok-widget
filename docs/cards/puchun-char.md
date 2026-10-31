# puchun-char: パチンコ演出の立ち絵を、配信者が入れた絵にする

for: 北極星
仕事の種類: 作る(小さく)
見た目が変わるか: 変わる(立ち絵の場所に配信者の絵が出る。絵を入れていないときは「ここに立ち絵」の字が出なくなる)

目的: 今は本番の演出に仮の影と「ここに立ち絵」の字がそのまま出る(2026-10-31 の puchun-e2e の写真で確認)。配信者が自分やキャラの絵を入れられれば「その人の演出」になり、入れていない人の画面にも作りかけの字が出なくなる。

前提(今のコード):
- `public/widgets/puchun/puchun.html` はもう `?char=<画像の URL>` で立ち絵を差しかえられる(`opts.charImage`、`parts.js` の `charArt`)。ただしギフトで流すとき(`playNext` が作る iframe の URL)には char を渡していない
- 画像はもう「メディア」に入れられ、ID(`mediaId`)で `/api/media-alerts/<id>/file` から読める。声の項目(cutin-voice、`src/schema.js` の `cutinFields` の `*Voice`)が mediaId の項目の手本。新しい置き場やアップロードは作らない
- 「ここに立ち絵」の字は `parts.js` の `figure()` の最後の `fillText`

## 作るもの
- `src/schema.js` の `SCHEMA.puchuns.fields` に `charImage`(画像の mediaId の文字。空なら絵なし。既定は空)。ダッシュボードの項目は声の項目と同じ出し方
- サーバーがギフトで送る1件の指示に `charImage` を入れ、`puchun.html` の `playNext` がそれを `char=/api/media-alerts/<id>/file` として iframe に渡す
- `parts.js` の `figure()`: 「ここに立ち絵」の字を消す(影の形は残す)。見本(try.html)も同じ

## 触ってよいファイル
- `src/schema.js`、puchun の指示を作るサーバー側の1か所、`public/widgets/puchun/puchun.html`、`public/widgets/puchun/parts.js`、それぞれの README、`CHANGELOG.md`
- 新規 `test/acceptance/puchun-char.test.js`

## 触らないファイル
- `config.yaml`、`data/`、メディアのアップロードと保存、ほかのウィジェット、演出のタイミングと見本の字

## 完成の条件
- AC-1 `puchuns` の1件に `charImage` を API で保存でき、空がいつもの既定。存在しない mediaId でも演出は止まらず最後まで流れる(絵だけ影になる)
- AC-2 実ブラウザで配信ソフトの URL を開き、`charImage` に画像を入れた「キャラのカットイン」をギフトで流すと、iframe が `/api/media-alerts/<id>/file` を読み、その絵が立ち絵の場所に描かれる(drawImage の元が読み込んだ画像であることを確かめる)
- AC-3 `charImage` が空のとき、画面のどこにも「ここに立ち絵」が描かれない
- AC-4 `npm test` が全部通る

作らないもの: 絵の切り抜き・位置調整、新しい演出、テスト専用の口

## 証拠
- AC-2 の瞬間の画面 1280×720 を `artifacts/shots/puchun-char.png` に(立ち絵が見えること)
- `npm test` の最後の数行

## 状態と失敗時
- 本番(3939)の再起動・書き込みはしない。壊れていたら、直した場所と原因を1行ずつカードの末尾に書く

## 2巡目(レビューで見つかったもの)
- なし(docs/reviews/puchun-char-1.md の指摘は、証拠写真の撮り方・テストの確かめ方・好みのどれかで、本番で壊れる・落ちる・鍵が漏れる・データが消える・Discord の決まりを破るものは無かった)

## 3巡目(ルー君 2026-10-31、合格のあとに写真を見て差し戻し)
- AC-5 証拠の `artifacts/shots/puchun-char.png` が真っ黒(4255 バイト、何も写っていない)。テストは drawImage の記録だけで通っているが、画面には立ち絵が出ていない
- 調べたこと: 再生中(warming でない時)に立ち絵の絵が裏の canvas に貼られている記録はある(1.2〜2.0秒に5回)。それでも 0.3〜3.5秒の間の画面の写真は8枚とも真っ黒。puchun-e2e(jackpot・絵なし)は同じ作業場所で写る。違いは preset が cutin で charImage があること
- 直すこと: 立ち絵を入れた「キャラのカットイン」が画面に写らない原因を見つけて直す。原因を1行で書く
- AC-6 「キャラのカットイン」に charImage を入れて流し、立ち絵が見えている時刻の画面の写真を撮る。写真の中央付近に、真っ黒(#121212)でない画素が十分ある(例: 1割以上)ことをテストで確かめる。drawImage の記録だけで合格にしない
