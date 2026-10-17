# info-widgets: テロップの文法の、ふつうのウィジェット3つ(ニュースティッカー・最近のサポーター・初見さんと常連さんの入室)

目的: 配信を回しやすくする控えめな表示を足す(docs/IDEAS.md の「普通のウィジェット」)。見た目は docs/DESIGN.md の2章(墨・白・朱・金、不透明、飾りのアイコンを置かない、ワイプと文字のせり上がり)。今回は「見せられる試作」まで。本番に出す前にオーナーが見る。

作るもの:
- `src/info-feed.js`(新): 最近のフォロー・ギフト・シェアの一覧をサーバーで持つ `InfoFeed`
- `src/visitors.js`(新): 初見さん・常連さんの見分けと記録 `VisitorLog`
- `public/widgets/ticker.html` + `ticker.js`、`supporters.html` + `supporters.js`、`visitors.html` + `visitors.js`(新。JS は ES5。3つで使う部品は `public/widgets/lib/telop.js`(ES5)にまとめてよい)
- 共有ファイルへの最小限の足し算: `src/schema.js`(3つの節)、`src/runtime.js`(作る・API・OBS で読める URL・FEATURE_ORDER・close)、`src/demo.js`(`member` のテスト送信)、`mcp/server.js`・`src/ai-mcp.js`・`src/ai-api.js`・`bin/tw.js`(テスト送信の種類に `member`)、`public/dashboard/simple.js`(かんたん)、`public/dashboard/editor.js`(試すボタン)、`test/es5-public.test.js`(新しい JS を一覧に足す)

## 設定(src/schema.js。説明は日本語。map の節)

- `tickers.<名前>`(page `ticker`、title「ニュースティッカー」、大きさ 1080×72)
  label「お知らせ」(左の札の文字)/ messages [](配信者が入れる文。順に流す)/ showGifts true / giftCount 5(1〜20)/ minCoins 1 / showGoals true / goals [](進み具合を流す目標バーの名前。空なら全部)/ speed 120(1秒に動く px、30〜600)/ fontSize 26(16〜60)/ color accent(札の色)
- `supporters.<名前>`(page `supporters`、title「最近のサポーター」、大きさ 420 × (72 + limit×60))
  title「最近のサポーター」(空なら見出しを出さない)/ events [follow, gift](GIFT_EVENTS から)/ minCoins 1 / limit 5(1〜10)/ avatars true / lifetime 0(秒。0 で消さない、0〜3600)/ color accent(新しく来たカードの印の色)
- `visitors.<名前>`(page `visitors`、title「初見さん・常連さん」、大きさ 760×160)
  showFirst true / showReturning false / showRegular true / regularVisits 3(何回目の配信から常連、2〜100)/ firstText「はじめまして！ゆっくりしていってね」/ returningText「また来てくれてありがとう」/ regularText「{visits}回目の来場、いつもありがとう」/ duration 4(1〜30)/ maxQueue 5(1〜50)/ avatars true / keepDays 90(1〜365。記録を残す日数。複数あるときはいちばん短い日数)

## 完成の条件

### ニュースティッカー
- AC-1 画面の下の帯。左に札(label、color の面)、右に墨の面の上を白い文字が右から左へ一定の速さ(speed)で流れる。流す順は messages → 目標の進み具合(「フォロー目標 42 / 100」、達成していたら「フォロー目標 達成」)→ 最近のギフト(「さくらさん ローズ ×5 5コイン」、コインは金)。区切りは小さな四角の文字だけ(アイコンは置かない)
- AC-2 中身は1周ごとに作り直す(流れている途中で文字が跳ねない)。新しいギフトが来たら、札が3秒だけ朱の「ギフト」に変わる(ワイプ)
- AC-3 目標の数は WebSocket の state(hello / event / state)と config.goals から出す。goal.html と同じく step があれば達成のたびに目標を上げた値を出す
- AC-4 流すものが1つもないときは帯を出さない(何も映らない)

### 最近のサポーター
- AC-5 最新のフォロー・ギフト(・設定すればシェア)を、新しいものが上の小さなカードで limit 件並べる。カード: 種類の札(「フォロー」「ギフト」「シェア」の文字)、名前、ギフトなら「ローズ ×5」と金のコイン、avatars なら 28px の四角いアイコン。いちばん新しいカードだけ左に color の印。入るときはワイプ
- AC-6 一覧はサーバー(`InfoFeed`)が持つ。`GET /api/info-feed` が `{ items: [...] }`(新しい順、最大 30 件)を返し、OBS 用の鍵でも読める。ウィジェットは読み込んだときにそれを出し、そのあとは WebSocket の event で足す(イベントの id で重ねない)。OBS を読み込み直しても続きから出る
- AC-7 items の1件は `{ id, ts, kind, user: { name, avatar }, gift?: { id, name, nameJa, count, diamonds }, coins }`。ユーザー ID は入れない
- AC-8 lifetime 秒をすぎたカードは消える。ダッシュボードの「集計をリセット」(hub の reset)で一覧は空になる

### 初見さん・常連さんの入室
- AC-9 配信中(status が live)に、その配信で初めて姿を見せた人(member・chat・gift・follow・share・like のどれか。ユーザー ID があるもの)を1回だけ迎える。サーバーは `{ type: 'visitor', visitor: { user: { name, avatar }, visits, first, test } }` を WebSocket で配る。visits はこの配信を含めて来た配信の数、first は visits が 1
- AC-10 ウィジェットは visits と regularVisits から 初見さん(visits 1。札は朱)/ おかえり(2〜regularVisits-1。札は白)/ 常連さん(regularVisits 以上。札は金)を決め、showFirst / showReturning / showRegular で出すかを決める。テロップは「{名前}さん」と2行目の文(regularText の {visits} は回数に置き換える)。duration 秒ずつ順に出し、待ちが maxQueue を超えたら古い人から飛ばす
- AC-11 記録はデータの場所の `visitors.json`。1人につき、配信者ごとの秘密の値で HMAC-SHA256 したユーザー ID の頭 16 文字をキーにし、中身は visits、初めて来た日、最後に来た日(YYYY-MM-DD)、最後に来た配信の印(配信が始まった時刻)だけ。名前・ユーザー ID・アイコンの URL はどこにも保存しない
- AC-12 秘密の値はデータの場所の `visitors.key`(32 バイトの乱数、初めて要るときに作る。Linux では 0600)。テナントごとにデータの場所が分かれているので、値も配信者ごとに別になる
- AC-13 最後に来た日が keepDays より古い記録は、読み込んだとき・保存の前・1日1回に消す。書き込みはまとめて(数秒ごと)、一時ファイル → 置き換え。書けないときは log に1行出し、配信は止めない
- AC-14 visitors の設定が1つもない配信者では、何も記録しない(visitors.json も visitors.key も作らない)
- AC-15 テスト送信(test: true)とデモのユーザー(id が demo_ で始まる)は、配信中でも配信前でも記録に入れず、「迎えた」印も付けない。テスト送信はウィジェットに配るだけ(test: true、visits はテスト送信の `testVisits`、無ければ 1)。`/api/simulate` と MCP・CLI のテスト送信に種類 `member` を足し、`visits` を渡すと常連の見た目を試せる
- AC-16 `GET /api/visitors` は `{ enabled, stored, stream: { first, returning, regular } }`(記録の人数と、この配信で迎えた数)を返す。`POST /api/control { target: 'visitors', action: 'forget' }` で記録を全部消せる(OBS 用の鍵ではできない)

### 共通
- AC-17 3つとも schema(日本語の説明)と「かんたん」(GROUPS の「お礼・にぎやかし」、INFO、SIMPLE のまとまり、呼び名、ひとこと)に出る。ダッシュボードの試すボタン: ティッカーとサポーターはテストギフト・フォロー、入室は「初見さん」「常連さん」のテスト送信
- AC-18 配信者ごとの「使える」の一覧(FEATURES)に3つが入り、最初から使える(premium ではない)
- AC-19 公開ウィジェットの JS は ES5(test/es5-public.test.js に足す)。外部 CDN なし。見本モード(sample)と `?preview=1` では見本の中身を出す。`?theme=light` と config の theme で明るい面になる
- AC-20 今あるテストは全部そのまま通る(Windows の既知の6件を除く)

作らないもの: 「全部まとめて」(all.html)への組み込み、配信画面での置き場所(posX など)、常連の一覧を見る画面、絵の素材(オーナーのデザイン待ち)
証拠: test/acceptance/info-widgets.test.js、npm test、撮影(暗い背景と明るい背景)
