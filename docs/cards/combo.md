# combo: 擬似連(コンボ)のサーバー・設定・操作(1枚目。画面は docs/cards/combo-widget.md)

仕事の種類: 作り込み(新しい部品。サーバーの数え方・設定・操作の口)
見た目が変わるか: いいえ(この1枚目は画面を作らない。画面は2枚目。ただし「かんたん」の設定画面に項目が1つ増える)

目的: 同じ人が一定の秒数(既定10秒)以内に続けてギフトすると「×2」「×3」…と数え、段が1つ上がるたびに画面へ知らせる。途切れたら合計コインを添えてしめる。「もう1回送ったら赤になる」が見えて次のギフトが出やすくなる。違うギフトでも数える(連打のまとめ=1回のギフトの個数とは別)。状態はサーバーで持ち、OBS を読み込み直しても続きから出せる。

下書き: なし(実装もテストも書き始めていない)。調べて分かったことは「実装のあしがかり」に書いた。

## 作るもの(触ってよいファイル)
- 新規: `src/combo.js`(`ComboEngine`。`src/rush.js` と同じ作り: `constructor(hub)`、`setConfig(cfg)`、`snapshot()`、`onEvent(e)`、`reset()`、`close()`)
- 新規: `test/acceptance/combo.test.js`(先に書く。実装より前)、`test/combo-wiring.test.js`(配線)
- 足すだけ: `src/schema.js`(`SCHEMA.combo`)、`src/runtime.js`(エンジンを作る・`applyEngines`・`/api/combo`・`OBS_ALLOWED`・`performControl`・`FEATURE_ORDER`・`PREMIUM_KEYS`)、`src/admin.js`(`combo()`)、`mcp/server.js`、`bin/tw.js`、`src/ai-api.js` と `src/ai-mcp.js`(rush と同じ並びで)、`public/dashboard/simple.js`(かんたん)、`public/dashboard/editor.js`(試すボタン)
- 触らない: `public/widgets/cutin.html`・`image-cutin.html`・`lib/cutin*.js`・`src/cutin-style.js`(別のセッションが変える)、`src/hub.js`(変えなくてよい。`hub.on('event')` / `testEvent` / `reset` を聞くだけ)、既存のテストを書き換えて緑にすること
- 作らない: 画面(`public/widgets/combo.html`。2枚目)、保存ファイル(コンボは数十秒で消えるので再起動をまたいで残さない)、ほかのウィジェットへの連携

## 完成の条件
- AC-1 `SCHEMA.combo`(`kind: 'object'`、`page: 'combo'`、`title: 'コンボ(擬似連)'`、`size: () => [1080, 1920]`、desc は日本語で RUSH と同じ書き方)に次の項目を、日本語の説明つきで足す。`config.example.yaml` を読み書きして同じ文字になるテストが今ある。通ること
  - `enabled`(bool、既定 true): コンボを使う
  - `seconds`(数、既定 10、min 1、max 120): この秒数以内に続けて送ればコンボがつながる
  - `gifts`(list、既定 []): このギフト名(またはID)だけ数える。空なら全部のギフトを数える
  - `minCoins`(数、既定 1、min 1): この合計コイン未満のギフトは数えない(1回のギフトの合計コイン `totalDiamonds`)
  - `tier2`…ではなく段の境目は回数で `blueAt`(既定 2)、`greenAt`(3)、`redAt`(4)、`goldAt`(5)、`rainbowAt`(6)。「×この回数から青/緑/赤/金/虹」。min 2、max 999
  - `endText`(文字、既定 'COMBO')、`sound`(bool、既定 true)、`volume`(0〜1、既定 0.5)
- AC-2 設定の検証: 境目は `blueAt <= greenAt <= redAt <= goldAt <= rainbowAt` でなければ、日本語のエラー(`config.js` の `normalize` が返す errors に入る)。壊れた設定では前の設定のまま動く(今の仕組みのまま)
- AC-3 数え方(`ComboEngine.onEvent`): `e.kind === 'gift'` だけを見る。送った人は `e.user.id`(なければ `e.user.name`)で区別する。テナントごと(`createRuntime` ごとに1つ)に別々に数える
  - 条件に合うギフト(`gifts` に合う=`src/gifts.js` の `giftMatches` を使う、`totalDiamonds >= minCoins`)を受けるたび、その人の `count` を +1、`total` に `totalDiamonds` を足す。前のギフトから `seconds` 秒より後に来たら、前のコンボは終わらせて(AC-5)新しく ×1 から数える
  - 違うギフトでも同じコンボに数える。1回の個数(`gift.count` が 5 でも)は ×1 回分と数える(連打のまとめとは別)
  - ×1(1回目)は「始まり」で、まだ画面には出さない。×2 から出す
  - 条件に合わないギフトは、コンボを続けも切りもしない(ただ無視する)
  - 人が違えば別のコンボ。同時に何人でも持てるが、持つ人数は最大 30(超えたら一番古く更新されたものを、しめてから消す)
- AC-4 段(tier): `count` が `blueAt` 以上 → 'blue'、`greenAt` 以上 → 'green'、`redAt` → 'red'、`goldAt` → 'gold'、`rainbowAt` 以上 → 'rainbow'。`count` が `blueAt` 未満なら tier は null(まだ出さない)。段が上がった(前のギフトより `tierIndex` が大きい)ときは `up: true`
- AC-5 配るもの: `hub.broadcast({ type: 'combo', combo: snapshot(), event })` と `hub.emit('combo', snapshot(), event)`(`src/rush.js` の `#send` と同じ形)
  - `event.kind`: 'hit'(×2 以降のギフトが来た)、'end'(途切れた)
  - 'hit' の中身: `user`(`{ id, name, avatar }` だけ。`rush.js` の `slimUser` と同じ)、`count`、`total`(コンボの合計コイン)、`coins`(このギフトのコイン)、`gift`(`giftDisplayName(e.gift)`)、`tier`、`up`、`expiresAt`(ミリ秒)
  - 'end' の中身: `user`、`count`、`total`、`tier`(最後の段)。**`count` が `blueAt` 未満のコンボ(×2 だけなど出していないもの)では 'end' を配らない**。しめる条件は「出したコンボ」だけ
  - 途切れの判定は `setTimeout` で `seconds` 秒後(ギフトのたびに延ばす)。サーバーが持つので、画面がなくても終わる
- AC-6 状態を続きから出せる: `snapshot()` は `{ now, seconds, active: [{ user, count, total, tier, expiresAt }...(更新が新しい順)], last: { user, count, total, tier, endedAt } | null }`。`GET /api/combo`(OBS 用の鍵でも読める=`OBS_ALLOWED` に `/^\/api\/combo$/` を足す)と、WebSocket の 'combo' メッセージの `combo` が同じ中身。出していないコンボ(`count` < `blueAt`)は `active` に入れない
- AC-7 テスト送信は本番の数を汚さない。`src/hub.js` は、**配信中**(`status.mode === 'live'`)のテスト送信(`test: true`)を `'event'` で配らず `'testEvent'` だけ配る。この仕組みに合わせる:
  - `'event'` で来たギフトは、テストでも(つなぐ前のテスト・デモ)数える。ただし配信が始まって `hub.reset()` が呼ばれたら(`hub.on('reset')`)、全部のコンボを捨てる(しめの 'end' は配らず、空の snapshot だけ配る)
  - `'testEvent'`(配信中のテスト送信)は本番のコンボには入れない。画面で試せるように、**別の「テスト用」の状態**(`ComboEngine` の中の別の Map)で数え、同じ形のメッセージを `test: true` つきで配る。本番の `snapshot()` / `GET /api/combo` / `hub.emit('combo')` にはテスト用を混ぜない(`hub.broadcast` だけ)
  - テスト: 配信中(`hub.status.mode = 'live'`)に `test: true` のギフトを何回送っても、`snapshot().active` が空のまま。本番のギフトは数える
- AC-8 使えない・止める: `enabled: false`、または管理者が使えなくした(`entitled('combo')` が false)ときは数えず、動いているコンボは捨てる(しめは配らない)。`setConfig` で設定が変わったら、動いているコンボの `expiresAt` は新しい `seconds` で数え直さず、そのまま(次のギフトから新しい設定)
- AC-9 操作(押す・URL・AI のどこからでも同じ): `runtime.js` の `performControl` に `target === 'combo'` を足す。`action`: 'status'(今の snapshot)、'reset'(全部のコンボを捨てる。しめは配らない)、'test'(この人 `data.user` が `data.count` 回(既定 5、最大 20)、順に 400ms 間隔でテストのギフトを送ったのと同じ動き=テスト用の状態で、`test: true` つきで配る。**本番のコンボには入れない**。配信中でなくても本番とは混ぜずテスト用で数える。`isDevEnv` でない環境では 403 と日本語の理由)。`entitled('combo')` が false なら 403(`rush` と同じ文)
  - `GET /api/combo`(状態)。`POST /api/control` に `{ target: 'combo', action }`。Stream Deck 用に `/api/combo/:action` の GET でも受ける(`rush` には無いが、`wins`/`timer` と同じ流儀で `r.all('/api/combo/:action', ...)`)
  - `src/admin.js` に `combo(action = 'status')`、`mcp/server.js` に `combo` ツール(`action: status|reset|test`)、`bin/tw.js` に `combo [reset|test]`、`src/ai-api.js`/`src/ai-mcp.js` に rush と同じ権限の並びで `combo`(operate 範囲。配信中の本番では 'test' をさせない=rush と同じ扱いに合わせる)
- AC-10 設定画面「かんたん」: `public/dashboard/simple.js` に `combo` を足す(`INFO.combo` = アイコンは lucide の 'layers' かほかの既存のもの、ひとこと「続けてギフトすると ×2 ×3 と数字が出て、色が上がっていく」、`GROUPS` の「豪華な演出」に 'combo'、`SIMPLE.combo`=[{ 使う: enabled }, { いつつながる: 型 `seconds`(「ゆっくり 15秒/ふつう 10秒/はやい 5秒」の `presets`)と fields `seconds`, `gifts`, `minCoins` }, { 段の境目: 型(「すぐ上がる 2・3・4・5・6」「ゆっくり上がる 2・4・7・12・20」)と fields なし(境目5つは「くわしく」だけ) }, { 文字: `endText` }]、`SIMPLE_LABELS`、`UNITS`(`seconds: '秒'`は既にある。`minCoins` は既にある)、`SUMMARY.combo`=「10 秒つながる・2 回から出す」)。`editor.js` の `fillActions` に `tab === 'combo'` の枝を足す(「5連続を試す」=`control('combo','test',{count:5})`、「リセット」)。「試すボタン」は `isDevEnv` でない環境では出さない(今の他のボタンと同じ流儀に合わせる。分からなければ他のボタンと同じにする)
- AC-11 `FEATURE_ORDER`(runtime.js)の最後に 'combo' を足す。`PREMIUM_KEYS` に 'combo' を足す(豪華な演出。最初は使えない)。`FEATURES.combo.pages` は `['combo.html']`(`SCHEMA.combo.page` から自動)。`widgetList` に自動で出る(`kind: 'object'` で `page` と `size` がある)。`public/widgets/all.html` に出すかはこの1枚目では**しない**(画面ができる2枚目で)
- AC-12 今あるテストは全部そのまま通る(Windows で元から落ちる6件=AI に送る文: パスワードは入れない… / API キーは伏せ字だけ返し… / stayConnected… / トークンは要約だけ… / 管理画面で入れた API キー… / AI のトークンと安全柵 以外が落ちない)。既存のテストは1行も書き換えない
- AC-13 コードは `rush.js` の書き方に合わせる(日本語のコメント、1つの関数は1つのこと、古いコピーを残さない)。`config.yaml` と `data/` には触らない

## 証拠
- `test/acceptance/combo.test.js`: 時計を差し替えられる形(`ComboEngine` は `now()` を受け取れる・または `node:test` の `mock.timers`)で、AC-3〜AC-8 を `EventEmitter` の偽 hub(`test/rush.test.js` と同じ)で確かめる。段が上がる回数、違うギフトで続く、`seconds` 秒より後は新しく数える、人が違えば別、×2 まで出さない、×1 だけでは 'end' が出ない、`reset` で空になる、配信中のテストは本番の数に入らない
- `test/combo-wiring.test.js`: `normalize` が `combo` の初期値を返す、境目が逆だとエラー、`OBS_ALLOWED` が `/api/combo` を通す、`performControl('combo','reset')`、`defaultsFor('combo')`
- `npm test`(Windows の既知6件以外が緑)

## 実装のあしがかり(調べたこと)
- `src/rush.js` が一番近い手本。`runtime.js` で `new RushEngine(hub)`、`applyEngines` で `rush.setConfig(entitled('rush') ? config.rush : { ...config.rush, enabled: false })`
- ギフトのイベントは `{ kind: 'gift', user: { id, name, avatar }, gift: { id, name, count }, totalDiamonds }`。連打のまとめは `src/normalize.js` が `repeatEnd` のときだけ1件にする(だからサーバーに届く1件=1回の連打のまとめ)
- `gifts` の合致は `src/gifts.js` の `giftMatches(gift, names)`(`rush.js` の `named` と同じ)
- テスト送信は `/api/simulate`(`runtime.js` の `simulateEvent`)。`makeEvent('gift', { user, giftName, diamonds, count })` で人とコインを指定できる
- 新しいウィジェットの画面は ES5 で `public/widgets/`(2枚目)。この1枚目では作らない

## めにくんに決めてほしいこと(報告に並べる)
- 段の既定: ×2 青・×3 緑・×4 赤・×5 金・×6 虹(今のカード)でよいか。もっとゆっくりにするか
- 既定の秒数 10 秒でよいか
- 'combo' を「豪華な演出」の仲間にして、最初は使えない(管理者が許可する)でよいか

## 2巡目(レビューで見つかったもの)
- AC-14 AI 経由の `combo` ツール(`src/ai-api.js` の `AI_ROUTES` に `POST /combo` があり、`operate()` が `combo` を `performControl('combo', action, data)` へ渡す)で、'status' は combo の snapshot を返し、'reset'・'test' を呼んでも RUSH の状態(`runtime.readRush()`)が変わらない。配信中の本番では 'test' が拒まれる。これをテストで確かめる
- AC-15 `ComboEngine.test()` が予約したテスト送信のタイマーは、`reset()`・`close()`・`setConfig({ enabled: false })` のあとに1つも残らず、テスト用の状態にそれ以上数えない(偽の時計を8秒以上進めても 'combo' メッセージが配られない)。これをテストで確かめる

## 3巡目(レビューで見つかったもの)
- AC-16 'hit' の `gift` は `giftDisplayName(e.gift)` の値そのものになる(`e.gift.name` を先に使わない)。日本語名があるギフトを送ると、'hit' の `gift` が `giftDisplayName` の返す日本語名と一致する。これをテストで確かめる
- AC-17 `runtime.readRush()` は 2巡目より前と同じく、呼ぶたびに RUSH の今の `snapshot()` を返す(`rushIdle` のような古い値の使い回しをしない)。待機中に時間を進めて2回読むと `now` が進んでいる
- AC-18 `performControl('combo','test', data)` は、`data.user` が渡されていて、それが `{ id か name を持つオブジェクト }` でなければ(文字列・数・空のオブジェクトなど。渡されていないときは今のまま既定のテスト用の人で動く)テストのギフトを送らず、日本語の理由つきの 400 を返す。`GET /api/combo/test?user=abc` で区別キーが `'?'` のコンボができない
