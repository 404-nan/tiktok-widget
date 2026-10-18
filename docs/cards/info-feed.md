# info-feed: ニュースティッカーと最近のサポーター(最新のフォロー・ギフトの一覧をサーバーで持ち、テロップの文法で2つのウィジェットに出す)

仕事の種類: 作り込み(新しいサーバーの部品1つ、ウィジェット2つ、設定と「かんたん」への配線)
見た目が変わるか: はい(新しいウィジェット2つ。既存の画面は変えない)。本番に出す前にめにくんが見る。絵の素材はめにくんのデザイン待ち(今回は CSS だけで作る)
同じ組の続き: 入室の `docs/cards/visitors.md` は別カード。先にこのカードを入れてから回す(共有ファイルの足し算が重ならないように)

目的: 配信画面の下の帯(ニュースティッカー)と、端に置く控えめなカード(最近のサポーター)を足す。見た目は docs/DESIGN.md の2章(墨 #111113・白 #F6F5F1・朱 #FF4F1F・金 #FFC53D、不透明、飾りのアイコンを置かない、ワイプと文字のせり上がり)。

触ってよいファイル:
- 新規: `src/info-feed.js`、`public/widgets/ticker.html`、`public/widgets/ticker.js`、`public/widgets/supporters.html`、`public/widgets/supporters.js`、`public/widgets/lib/telop.js`(2つで使う部品。ES5)、`test/acceptance/info-feed.test.js`
- 足すだけ(既存行の並べ替え・書式直しはしない): `src/schema.js`(末尾の節として)、`src/runtime.js`(`FEATURE_ORDER` に足す・`InfoFeed` を作る・`GET /api/info-feed`・`OBS_ALLOWED` に足す・`close()`)、`public/dashboard/simple.js`(`GROUPS`・`INFO`・`SIMPLE`・`SIMPLE_LABELS`・`SUMMARY`)、`public/dashboard/editor.js`(試すボタン)、`test/es5-public.test.js`(`files` に新しい JS を足す)
触らないファイル: `src/hub.js`、`src/demo.js`、`server.js`、`mcp/*`、`bin/tw.js`、`public/widgets/all.html`、`cutin*`、既存のウィジェット、`docs/cards/effect-log.md`、`docs/cards/tw-guard.md`
作らないもの: 「全部まとめて」(all.html)への組み込み、配信画面での置き場所(posX など。ウィジェット単体の URL だけ)、サポーターの履歴の保存(再起動で空に戻ってよい)、絵の素材、音

## 設定(src/schema.js。map の節。説明は日本語・やさしい言葉)

`tickers`(page `ticker`、title「ニュースティッカー」、`size: () => [1080, 72]`、desc に URL `/widgets/ticker.html?id=<名前>`):
- label str「お知らせ」: 左の札の文字
- messages list []: 配信者が入れる文(順に流す)
- showGifts bool true / giftCount num 5(1〜20)/ minCoins num 1(0 以上)
- showGoals bool true / goals list []: 進み具合を流す目標バー(`goals` の名前)。空なら全部
- speed num 120(30〜600): 1秒に動く px
- fontSize num 26(16〜60)
- color color 'accent': 札の色

`supporters`(page `supporters`、title「最近のサポーター」、`size: (e) => [420, 72 + e.limit * 60]`):
- title str「最近のサポーター」(空なら見出しを出さない)
- events list ['follow','gift'](values は `GIFT_EVENTS`)
- minCoins num 1 / limit num 5(1〜10)/ avatars bool true
- lifetime num 0(0〜3600 秒。0 で消さない)
- color color 'accent': 新しいカードの印の色

## 完成の条件

サーバー(`src/info-feed.js`)
- AC-1 `InfoFeed` は `new InfoFeed(hub)` で作り、hub の `event` を購読する。`follow`・`gift`・`share` を新しい順に最大 30 件持つ。`items` の1件は `{ id, ts, kind, user: { name, avatar }, gift?: { id, name, nameJa, count, diamonds }, coins }`。**ユーザー ID は入れない**(`user.id` を持たない)
- AC-2 テスト送信(`e.test === true`)と `user.id` が `demo_` で始まるものも一覧に入れる(画面で見えるため)が、`test: true` の印を付ける。配信中のテスト送信は hub が `event` を出さず `testEvent` だけを出すので、`testEvent` も購読して画面に出すだけにし、`snapshot()` には入れない(読み込み直したら消える。本番の一覧を汚さない)
- AC-3 hub の `reset` で一覧は空になる。`snapshot()` は `{ items }`。`close()` で購読を外す
- AC-4 `GET /api/info-feed` が `snapshot()` を返す。OBS 用の鍵でも読める(`OBS_ALLOWED`)

ニュースティッカー(`ticker.html` + `ticker.js` + `lib/telop.js`)
- AC-5 画面の下の帯。左に札(`label`、`color` の面)、右に墨の面の上を白い文字が右から左へ `speed` で流れる。流す順は `messages` → 目標の進み具合(「フォロー目標 42 / 100」。達成なら「フォロー目標 達成」)→ 最近のギフト(「さくらさん ローズ ×5」と金の「5 コイン」。`giftCount` 件、`minCoins` 未満は出さない)。区切りは小さな四角の文字(アイコンは置かない)
- AC-6 中身は1周ごとに作り直す(流れている途中で文字が跳ねない)。新しいギフトが来たら、札が3秒だけ朱の「ギフト」に変わる(clip-path のワイプ)
- AC-7 目標の数は WebSocket の `hello`/`event`/`state` の state と config の `goals` から出す。`goal.html` と同じく `step` があれば、達成のたびに目標を上げた値を出す
- AC-8 流すものが1つもないときは帯を出さない(何も映らない)。`?preview=1` と見本モードでは見本の文を流す(ES5 のこのページでは、`/api/sample` を読み、WebSocket の `sample` を受ける)

最近のサポーター(`supporters.html` + `supporters.js`)
- AC-9 新しいものが上の小さなカードで `limit` 件。カード: 種類の札(「フォロー」「ギフト」「シェア」の文字)、名前、ギフトなら「ローズ ×5」と金のコイン、`avatars` なら 28px の四角いアイコン(なければ名前の頭の1文字)。いちばん新しいカードだけ左に `color` の印。入るときはワイプ
- AC-10 読み込んだときに `/api/info-feed` を出し、そのあとは WebSocket の `event` で足す(`id` が同じものは重ねない)。OBS を読み込み直しても続きから出る。`lifetime` 秒をすぎたカードは消える。`reset` で空にする
- AC-11 `events`・`minCoins` で絞る(ギフトの合計コインが `minCoins` 未満は出さない)

共通
- AC-12 ウィジェットの JS は ES5(`test/es5-public.test.js` の `files` に足す)。外部 CDN なし。フォントは `/vendor/fonts/` から(`gacha.html` と同じ)。`?theme=light` と config の theme で明るい面になる。`lib/overlay.css` の変数を使う。点滅は1秒3回まで。配信者ごとの URL(`/t/<鍵>/...`)でも動く(`gacha.js` と同じく `location.pathname` から `base` を取る)
- AC-13 設定は `src/config.js` の検証を通る(schema の範囲外はエラーになる)。`config.example.yaml` は変えない(既存の「読み込んで書き戻しても同じ文字」のテストを壊さない)
- AC-14 `FEATURE_ORDER` に `tickers`・`supporters` を足し、最初から使える(premium ではない)。`featureOfPage('ticker.html')` が `tickers` を返す
- AC-15 「かんたん」: `GROUPS` の「お礼・にぎやかし」に足す。`INFO`(icon は lucide の名前、`newspaper`・`users` など。desc はひとこと)、`SIMPLE`(ティッカー: 「流すもの」`label, messages, showGifts, giftCount`/「目標」`showGoals, goals`/「見た目」`speed, color`。サポーター: 「出すもの」`events, limit, minCoins`/「見た目」`avatars, lifetime, color`)、`SIMPLE_LABELS`、`SUMMARY`
- AC-16 ダッシュボードの試すボタン(`editor.js` の `fillActions`): 両方に「テストギフト」「フォロー」。`/api/simulate` を使う(配信中は画面に出すだけで集計に入らない)
- AC-17 今あるテストは全部そのまま通る(Windows の既知の6件を除く)

証拠: `test/acceptance/info-feed.test.js`(AC-1〜4 は `Hub` と `InfoFeed` を直接。AC-13・14 は `config` の検証と `runtime` の `FEATURES`。画面そのものは撮影で確かめる)、`npm test`、暗い背景と明るい背景の撮影(ポートは指示された番号)
