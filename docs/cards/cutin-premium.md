# cutin-premium: カットインにプレミア柄・色の昇格・段階ごとの写真・RUSH 中の格上げを足す

目的: 同じカットインが「毎回ちがう」ものになり、まれに「見たことない!」が出るようにする(docs/IDEAS.md の「このあと足すとよいもの」)。オーナーが気に入っている筆の帯・木炭の縁・文字の質感はそのまま。新しい項目は既定で今と同じ見た目にする。

作るもの: `src/cutin-draw.js`(新。サーバーのくじと結果の決め方)、`public/widgets/lib/cutin-premium.js`(新。ES5。公開側の結果の決め方と柄の絵)、`public/widgets/lib/cutin.js`・`cutin.css`・`cutin-style.js`・`brush.js`・`cutin.html`・`image-cutin.html` の変更、`src/schema.js`・`public/dashboard/simple.js`・`editor.js`・`src/hub.js`・`src/runtime.js` へ少しだけ足す

完成の条件:
- AC-1 くじはサーバーで引く: kind が gift・follow・share のイベントは、配る前にサーバーで1回だけくじ `cutinDraw` を付ける。`{ premium, pattern, promote, from }` は 0 以上 1 未満の数、`seed` は 1〜900 の整数、`rush` は true か false。WebSocket のすべての接続(OBS のソースが何枚でも)に同じ値が届く。like・chat・viewers には付けない。テスト送信(test: true。配信中のテストも)にも付ける
- AC-2 RUSH 中(RUSH の状態が active)に届いたイベントは `cutinDraw.rush` が true、そうでなければ false。RUSH に突入させたギフトそのものは false(届いた時点ではまだ RUSH ではない)
- AC-3 結果の決め方は1つ: サーバーの `resolveCutin(draw, baseTier, settings)`(src/cutin-draw.js)と公開側の `CutinPremium.resolve(draw, baseTier, settings)` は、同じ入力に同じ結果 `{ tier, from, pattern }` を返す。段階の順は blue < green < red < gold < rainbow(番号 0〜4)
  - tier: `settings.rushBoost` が true で `draw.rush` が true なら baseTier の1つ上(rainbow は rainbow のまま)。それ以外は baseTier
  - pattern: `settings.premium` が true で `draw.premium < settings.premiumRate / 100` のとき、`settings.premiumPatterns` のうち使える柄(giraffe・zebra・gold)を書いた順に並べた中の `Math.floor(draw.pattern * 柄の数)` 番目。それ以外(柄が1つも無いときも)は null
  - from(昇格の入りの段階): `settings.promote` が true で、tier の番号が 1 以上で、`draw.promote < settings.promoteRate / 100` のとき、`Math.floor(draw.from * tier の番号)` 番の段階。それ以外は null。昇格しても最後の段階は tier(金額で決まる色は変えない)
  - draw が無い・数が 0〜1 の外などで壊れているとき(古いサーバー・見本・ダッシュボードのプレビュー)は `{ tier: baseTier, from: null, pattern: null }`。baseTier が段階の名前でないときは null
- AC-4 新しい設定(cutins と imageCutins の両方): `premium`(false)・`premiumRate`(1。0〜100 の %)・`premiumPatterns`([giraffe, zebra, gold])・`promote`(false)・`promoteRate`(20。0〜100 の %)・`rushBoost`(false)。imageCutins だけ: `bluePhoto`・`greenPhoto`・`redPhoto`・`goldPhoto`・`rainbowPhoto`(どれも ''。空なら photo を使う)。説明は日本語。範囲外の数・知らない柄はエラーにして直す
- AC-5 既存の設定はそのまま動く: 新しい項目の無い設定と config.example.yaml は、エラー・警告なしで読め、新しい項目は既定値になる。既定値のままなら、どんな draw でも resolveCutin は `{ tier: baseTier, from: null, pattern: null }`(今と同じ見た目)
- AC-6 プレミア柄は CSS・SVG・canvas だけで作る: `CutinPremium.paint(id, width, height, seed, unit)` は giraffe(キリン柄)・zebra(ゼブラ柄)・gold(金の流体)のそれぞれで `{ defs, fill }`(SVG の文字列)を返し、外のファイル(`http`・`<image`・`href=`)を読まない。同じ引数なら同じ文字列(OBS のソースが何枚でも同じ柄)、seed が違えば違う文字列。知らない id は null
- AC-7 画面: cutin.html と image-cutin.html は cutin-premium.js を読み込み、柄・昇格・RUSH の格上げを `e.cutinDraw` だけから決める(画面で乱数を引いて決めない)。帯の筆の形・木炭の縁・文字はそのままで、柄は帯の塗りに入る(縦長フレームは上下の縞の場所、写真の帯は縁の色の線)。昇格は揺れの途中で「ピキーン」(WebAudio で合成)と白く光り、文字・色・写真が上の段階に変わる。画像付きカットインは、その段階の写真(`<段階>Photo`)があればそれを、なければ photo を出す
- AC-8 「かんたん」: simple.js の cutins と imageCutins に「まれな演出」(premium・premiumRate・promote・promoteRate・rushBoost)を、imageCutins に「段階ごとの写真」を足し、呼び名(SIMPLE_LABELS)を付ける。premiumRate と promoteRate の単位は %。段階の写真は photo と同じく media/ の候補から選べる
- AC-9 今あるテストは全部そのまま通る(Windows の既知6件以外)。`public/widgets/lib/cutin-premium.js` は ES5 の検査(test/es5-public.test.js)に入れる

作らないもの: ボイス、テスト送信で柄や昇格を指定する口(試すときは割合を 100 にするか、URL に `?premium=1&premiumRate=100` を付ける)、段階ごとの写真の切り抜き(段階の写真は中央で切り抜く)、ギフト通知の RUSH 中の格上げ、昇格の多段(青→緑→赤と1段ずつ)
証拠: test/acceptance/cutin-premium.test.js、npm test、撮影(`C:/Users/user/lulwork/cutin-premium-shots/`。コミットしない)
