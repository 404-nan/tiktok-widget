# cutin-voice: カットインの段階ごとに、配信者が入れた声を鳴らす

for: 北極星
仕事の種類: 作る(小さく)
見た目が変わるか: 変わらない(設定の項目が5つ増えるだけ。ウィジェットの絵は変えない)

目的: パチンコの「激アツ！」「確定ー！」の声は、色と同じくらい期待度を伝える。配信者が自分の声を段階ごとに入れられると、同じカットインでも「その人の配信の演出」になり、使い続ける理由になる(`docs/IDEAS.md` の「ボイス」、まだ無い)。

前提(今のコード):
- 音声はもう「メディア」に入れられ、ID(`mediaId`)で呼べる。ギフト別サウンド(`SCHEMA.giftSounds`、`public/widgets/sounds.js`)がその使い方の手本。新しい置き場やアップロードは作らない
- カットインの段階は `public/widgets/lib/cutin.js` が決める(青・緑・赤・金・虹。昇格 `promote` のときは最後の段階)
- `giftSounds` の `minCoins` で近いことはできるが、昇格・RUSH の1段上げ・ルーレットの当たりで段階が変わると声と色がずれる。だから声はカットインの側で、決まった段階に合わせて鳴らす

## 作るもの
- `src/schema.js` の `cutinFields` に `blueVoice`・`greenVoice`・`redVoice`・`goldVoice`・`rainbowVoice`(どれも `mediaId` の文字。空なら鳴らさない。既定は空)と `voiceVolume`(0〜1、既定 0.8)
- `public/widgets/lib/cutin.js`: 文字が叩きつけられる瞬間に、その段階の声を1回鳴らす。昇格のときは最後の段階の声だけ(途中の段階の声は鳴らさない)。虹のフリーズのときは明ける瞬間。音声の URL の作り方は `sounds.js` と同じものを使い回す
- 通常カットインと画像付きカットインの両方で効く(共通の `cutinFields` と `cutin.js` なので1か所)

## 触ってよいファイル
- `src/schema.js`(`cutinFields` に足すだけ)、`public/widgets/lib/cutin.js`、必要なら `public/widgets/sounds.js` から URL を作る小さな関数を `public/widgets/lib/` に移して両方から使う
- 新規 `test/cutin-voice.test.js`、`test/README.md`、`public/widgets/lib/README.md`、`src/README.md`、`docs/IDEAS.md`(「ボイス」に ✅)

## 触らないファイル
- `config.yaml`、`data/`、メディアのアップロードと保存、ダッシュボードの見た目、`src/billing.js`、ほかのウィジェット

## 完成の条件
- AC-1 声の項目が全部空(既定)なら、今までと同じに動き、音声を1つも読み込まない(テストで確かめる)
- AC-2 `redVoice` に mediaId を入れ、赤のカットインを出すと、その音声が1回だけ鳴る。ほかの段階では鳴らない
- AC-3 昇格(青→赤)のとき、鳴るのは `redVoice` だけで、`blueVoice` は鳴らない
- AC-4 存在しない mediaId でも、カットインは止まらず最後まで出る(声だけ鳴らない)
- AC-5 AC-2〜4 のテストは、この変更を入れる前のコードでは落ちる(落ちることを1回確かめ、その出力を証拠に書く)
- AC-6 `npm test` が全部通る
- AC-7 dev(dev.lul.works、3940)で、メディアに入れた音声を `redVoice` にして、ダッシュボードの「ためしに動かす」で赤のカットインを出し、ウィジェットのページで音声の再生が始まったこと(playwright で `audio`/`Audio` の再生の記録か、ネットワークで音声の URL を読んだ記録)を確かめる
- AC-8 `src/README.md`・`public/widgets/lib/README.md`・`test/README.md` を同じ変更で直す

## 証拠
- `npm test` の最後の数行(通った数・失敗0)
- AC-5 の「直す前は落ちた」出力の数行
- AC-7 の記録(再生か読み込みの1行)と、そのときのウィジェットのスクリーンショット 1枚(`artifacts/shots/cutin-voice.png`)
- 鳴らす場所の diff の要約1行(どの関数のどこで鳴らすか)

## 状態と失敗時
- 本番(3939)では試さない。配信中の再起動はしない
- 自動再生が止められて鳴らない環境(ブラウザの決まり)は、このカードでは扱わない。OBS のブラウザソースでは鳴る前提(ほかの効果音と同じ)
- 声の録り方の案内やダッシュボードでの選びやすい画面は、別のカードにする

## 2巡目(レビューで見つかったもの)
- なし(`docs/reviews/cutin-voice-1.md` の指摘は、証拠の出し忘れ(AC-5・AC-7。今の条件のまま満たせばよい)、テストの書き方(AC-2 の虹)、カード外の `package.json` 変更で、本番で壊れる・落ちる・鍵が漏れる・データが消える・Discord の決まりを破るものは無かった)
