# participation-cheer: いいねでたまる応援ゲージ(参加型ウィジェット 3/3)

仕事の種類: 作り込み(新しい仕組み+画面+操作の配線)
見た目が変わるか: 変わる(新しいウィジェット `cheer.html` が増える。既存のウィジェットは変えない)
前提: `docs/cards/participation-vote.md` が先に終わっていること。**共通の決まり(記録に残さない・テスト送信・足し込み先の一覧・触らないファイル)と共通の土台(`actions` 型、`roulette.spin`)はそこに書いてある。必ず先に読む。**

目的: お金を使わない参加。視聴者のいいねでゲージがたまり、満タンで演出が起きる。「あと少しで満タン」が見えるので、みんなでいいねを押したくなる。

## 作るもの
- `src/cheer.js`(`CheerEngine`)
- `public/widgets/cheer.html` と `public/widgets/cheer.js`(ES5)
- 共有ファイルへの足し込み(vote の card と同じ一覧)、`docs/knowledge/operating.md` に操作方法

## 設定 `cheers`(種類: `map`、ページ `cheer`、置き場所は `placementFields`)
- `title`(文字、初期値「みんなで応援」)
- `goal`(数、初期値 500、1〜1000000。満タンまでのいいねの数)
- `growth`(数、初期値 1.5、1〜10。満タンのたびに次の `goal` を何倍にするか。1 で同じ)
- `loop`(真偽、初期値 true。満タンのあと 0 から次を始める。false なら満タンのままで止まる)
- `fullText`(文字、初期値「満タン!」)
- `fullActions`(型 `actions`、初期値 `[]`。満タンのときに動かす。例: `gacha.start`、`rush.start`、`roulette.spin`)
- `sound`・`volume`・`color`(初期値 accent)・`fullColor`(初期値 gold)

## 状態と操作(`CheerEngine`)
- 状態: `{ value, goal, round, full }`。`value` は今の周のいいねの数、`round` は満タンにした回数(0 から)、`goal` は今の周の目標(`goal × growth^round` を四捨五入、上限 1000000)
- いいね: `like` イベントの `count` を足す(累計 `total` は使わない)。ユーザー別には数えず、**誰がいいねしたかは持たない**。`value >= goal` になったら満タン
- 満タン: `{ event: 'full', round }` を配り、`fullActions` を `runActions(..., { source: 'cheer', cheerId })` で動かす。余ったいいねは次の周に持ち越す(`loop` が true のとき)。1回の `like` で複数周ぶん超えても、満タンは**周の数だけ**起こさず**1回の `like` につき最大1回**にして、残りは持ち越す。`loop: false` のときは満タンのまま止まり、以降のいいねは数えない
- 手動の操作: `add(id, n)`(n 個ぶん足す。負で引ける。0 未満にはならない)、`fill(id)`(今すぐ満タンにする)、`reset(id)`(0 周目・0 に戻す)。ストリーマーの手元・Stream Deck 用
- `snapshot()`: `{ [id]: { value, goal, round, full, now } }`。誰の情報も入れない。WebSocket の `{ type: 'cheer', id, cheer: <状態>, event: 'tally'|'full'|'reset' }` は 250ms にまとめて配る(満タンの `full` は待たずに即)
- 状態はメモリで持つ(ファイルに書かない)。`hub.on('reset')`(配信が始まる時・`/api/reset`)で 0 周目に戻す。つなぐ前のテスト・デモのいいねは数えるが、配信が始まると 0 に戻る
- 設定の変更・`entitled('cheers')` が false のときは vote と同じ。`goal` が変わったときは `value` を保ち、超えていたら次のいいねで満タンにする

## 操作の入口(vote と同じ形)
- ダッシュボード: 「いいね ×20(テスト)」「いいね ×100(テスト)」「満タンにする」「リセット」
- `/api/cheer`(状態)、`/api/cheer/:id/:action`(`add`(`?value=`)`fill` `reset`、GET でも可)、`/api/control` の target `cheer`
- MCP の道具 `cheer`(`action` = `status|add|fill|reset`、`id`、`value`)、`src/admin.js` の `cheer()`、CLI `tw cheer [add <数>|fill|reset|status] [名前]`
- AI 用 API: `POST /cheer`(tool `cheer`、scope `operate`)

## 画面 `cheer.html`(幅 560 × 高さ 160 が目安。画面の端に置く控えめな板)
- 横長のゲージ。墨の面、ゲージは朱で左から伸びる(ワイプ。いいねが入るたびに少しずつ追いつく)。左に見出し、右に「value / goal」(数字は Barlow Condensed、桁が回る)と周の数(「2 周目」)
- 80% を超えるとゲージの先端が金になり、細かく震える(「あと少し」。点滅は1秒3回まで)
- 満タン: 一瞬ゲージが止まって暗くなり(溜め)、金の面が左から右へ一気に塗り、「満タン!」(`fullText`)が叩きつけられる。紙吹雪と光を canvas で描く。そのあとゲージが 0 から空になって次の周へ(`loop: false` は金のまま)
- `?preview=1` と見本モードでは、value 340 / 500 の画面を出す。効果音は WebAudio

## 完成の条件
- AC-1 `cheers` が `schema.js` にあり、日本語の説明つき。`goal` が 0 以下、`growth` が 1 未満、`fullActions` が壊れているときは日本語のエラーで保存されない
- AC-2 いいね 100 回(別々の人、複数のイベント)で `value` が 100。`goal: 500` で 500 回に届くと満タンになり、`round` が 1、`value` が 0(余りは持ち越し)、`goal` が 750(`growth: 1.5`)
- AC-3 1回の `like`(`count: 1200`)で複数周ぶん超えても、満タンは 1 回だけ起き、残りは持ち越される
- AC-4 `loop: false`: 満タンで止まり、以降のいいねで `value` が増えない
- AC-5 `fullActions` が満タンのたびに 1 回だけ動く(例: `gacha.start` が呼ばれる)。動作が失敗しても満タンは壊れない。`fill` でも動く
- AC-6 `add` は負の値で引けて 0 未満にならない。`reset` で 0 周目に戻る
- AC-7 テスト送信: 配信中の `test: true` のいいねは数えない。つなぐ前のテストは数えるが、配信が始まる `reset` で 0 周目に戻る
- AC-8 **記録に残さない**: 一通り回したあと、`data/` 以下に cheer のファイルが作られず、`snapshot()`・WebSocket・API の応答に、いいねしたユーザーの ID・名前が含まれない
- AC-9 操作の入口: GET の `/api/cheer/default/add?value=50` → `fill` → `reset`、`/api/control`、`admin.cheer()`、MCP `cheer`、CLI `tw cheer` が同じ遷移。OBS の鍵では GET `/api/cheer` だけ通る。AI 用 API は scope `operate` だけ、配信中の本番では 403
- AC-10 `FEATURES` に `cheers`。使えないテナントでは `locked.html`
- AC-11 `cheer.js` は ES5(`es5-public.test.js` に足す)、CDN なし。空・途中・80% 超・満タンの画面を撮る
- AC-12 `simple.js`(`GROUPS` は「お礼・にぎやかし」)・`editor.js` の試すボタン・`all.html` に出る
- AC-13 今あるテストは全部通る(Windows の既知6件を除く)。テストを書き換えて通さない

## 作らないもの
- いいねした人のランキング・名前の表示(誰のも持たない)
- ギフトでのゲージの加算
- 満タンの回数の保存(配信をまたがない)
- カットインを満タンで動かすこと(`cutin*.html` に触らない。連動は、めにくんの決定待ち)

## 証拠
- `test/acceptance/cheer.test.js`(AC-1〜10)、`test/es5-public.test.js`、`npm test`、撮影(ポート 4104)
