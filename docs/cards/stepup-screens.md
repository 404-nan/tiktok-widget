# stepup-screens: ステップアップの段の表示・全画面の演出と、群予告の画面(OBS に重ねるウィジェット2枚)

仕事の種類: 作り込み(見た目・演出)
見た目が変わるか: はい。**本番に出す前に、めにくんが必ず見る**(今回は「見せられる試作」まで)
順番: `stepup.md` と `swarm.md` が入った後。サーバーの `snapshot` と `stepup`/`swarm` メッセージの形はその札が正

## 作るもの
`public/widgets/stepup.html`、`public/widgets/swarm.html`(必要なら同じ場所に `stepup.js`・`swarm.js`)。ES5、CDN なし、秘密なし。

`lib/overlay.js` は ES モジュールなので使わない。`gacha.html` と `gacha.js` と同じ書き方にする(`XMLHttpRequest` と `WebSocket` を直接使い、`/t/<鍵>` の下でも動くよう `base` を付ける)。新しい JS を作ったら `test/es5-public.test.js` の `files` に1行足す。

## stepup.html(配信画面いっぱいに重ねる。1080×1920)
- 待機のときは何も映らない(`?preview=1` のときだけ見本を出す)
- 画面の `edge`(右か左)の端に**小さな段の表示**: STEP 1〜5 の5つの段が下から積み上がる。届いた段は塗られ、届いていない段は墨の枠だけ。色は 青<緑<赤<金<虹(STEP 1 青、STEP 2 緑、STEP 3 赤、STEP 4 金、STEP 5 虹)。上に残り時間のゲージと合計コイン。飾りのアイコンは置かない
- 段が上がった瞬間(`kind: 'up'`)の**全画面の演出**: 一瞬止める(暗転+無音、0.3〜0.5秒)→ 段の色で画面が染まり「STEP n」が Dela Gothic One で叩きつけられる(段が高いほど大きく・長く・揺れる)→ 送った人のアイコンと名前、ギフト名を小さく。STEP 1 は軽く(0.8秒)、STEP 4 は派手(1.8秒)。**情報は「STEP n」と送った人だけ**
- STEP 5(`kind: 'final'`)は虹の大演出: 暗転→フリーズ→放射状の虹→「虹確定」→紙吹雪。3〜4秒。終わったら段の表示も消える
- `kind: 'end'` で段の表示が静かに引く。`kind: 'preview'` は同じ演出を、状態を変えずに出す
- 点滅は1秒に3回まで。効果音は WebAudio で合成(段ごとに音程が上がる「ピ・ピ・ピ・ピン」と、STEP 5 のファンファーレ)。`sound`・`volume` に従い、ブラウザが鳴らせない状態でもエラーにしない
- 読み込み直しても `/api/stepup` から続きの段と残り時間を出す(演出は繰り返さない)。切れたら1秒後に再接続
- 暗い背景でも明るい背景でも読める。面は不透明ではっきりした色(ぼかしや意味のないグラデーションを使わない。虹だけは例外)

## swarm.html(全画面。1080×1920)
- `kind: 'swarm'` で、`gifts` のアイコン(`image` があればその画像、なければ頭文字の円)が `iconCount` 個、画面の左から右へ大群で横切る。速さ・大きさ・高さをばらつかせる。`requestAnimationFrame` の canvas か CSS で、同時120個まで軽く動くこと
- 横切りの途中で「群」(`text`)が Dela Gothic One でドンと出て、画面が一瞬揺れる。`level` が高いほど大きく・揺れる・色が 青→赤→金→虹 になる。送った人の名前は小さく3人まで
- 4秒ほどで消える。待機のときは何も映らない。`?preview=1` で見本
- 効果音は WebAudio で合成(ざわざわ→ドン)

## 共通
日本語の文字だけ。ギフト名はサーバーが日本語名で渡す(画面で訳さない)。色は 墨・白・朱・金+段の色だけ。本物の絵は使わず、CSS・SVG・canvas の試作にする。

## 完成の条件
- AC-1 `stepup.html` と `swarm.html` が `GET` で 200 を返す(OBS 用の鍵でも)。読み込む JS は ES5 として解析できる(`test/es5-public.test.js`)。外部 CDN の URL が含まれない
- AC-2 `test/acceptance/stepup-screens.test.js`: HTML と JS を読み、(a) `/ws` と `/api/stepup`・`/api/swarm` を使っている (b) `kind` の `up`・`final`・`end`・`preview`・`swarm` を扱っている (c) `?preview=1` を扱っている (d) 「STEP」「虹確定」「群」の文字がある、を確かめる(文字の確認だけの浅い検査でよい。見た目は撮影で確かめる)
- AC-3 撮影: 一時の設定ファイル(`TW_CONFIG`)でポート 4102 の一時サーバーを起こし、`/widgets/stepup.html?preview=1` と `/widgets/swarm.html?preview=1` を headless Chrome で撮る。画像は `C:/Users/user/lulwork/stepup-shots/`(コミットしない)。stepup は待機・STEP 1・STEP 3・STEP 5 を暗い背景と明るい背景で、swarm を暗い背景と明るい背景で。撮影スクリプトはコミットしない
- AC-4 撮影した画像を見て、(a) 文字が読める (b) 段の積み上がりが分かる (c) STEP 5 が他と明らかに違う (d) 飾りのアイコンや外部の素材がない、を確かめて報告に書く
- AC-5 `npm test` が通る(Windows の既知6件を除く)

## ファイルの範囲
- 触ってよい: `public/widgets/stepup.html`・`swarm.html`(新)、`stepup.js`・`swarm.js`(新、任意)、`test/es5-public.test.js`(`files` に足すだけ)、`test/acceptance/stepup-screens.test.js`(新)
- 触らない: `public/widgets/cutin*.html`・`src/cutin-style.js`・`public/widgets/lib/overlay.*`(読むだけ)・既存の他のウィジェット
- 作らない: 本物の絵や写真(めにくんのデザインを待つ)、設定の画面(`stepup.md`)

## 証拠
`test/acceptance/stepup-screens.test.js`、撮影した画像、`npm test`

## めにくんに決めてほしいこと(報告に並べる)
- 段の色(青→緑→赤→金→虹)と STEP 5 の虹で足りるか。段の表示を置く端(右か左)の既定
- 「群」を1文字の既定のままにするか
- ステップアップの既定の長さ(30秒)と、境目のプリセットが配信の規模に合うか
