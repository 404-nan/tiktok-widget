# participation-push: 画面に「押せ!」が出て、コメント「押」かいいね連打で押す PUSH ボタン(参加型ウィジェット 2/3)

仕事の種類: 作り込み(新しい仕組み+画面+操作の配線)
見た目が変わるか: 変わる(新しいウィジェット `push-button.html` が増える。既存のウィジェットは変えない)
前提: `docs/cards/participation-vote.md` が先に終わっていること。**共通の決まり(記録に残さない・テスト送信・足し込み先の一覧・触らないファイル)と共通の土台(`actions` 型、`roulette.spin`)はそこに書いてある。必ず先に読む。**

目的: パチンコの PUSH ボタンを視聴者にやってもらう。画面に「押せ!」が出て、制限時間内にコメント「押」か、いいねの連打で押される。押した量で結果の段階が変わり、段階ごとにルーレットなどを動かせる。全員が当事者になれる。

## 作るもの
- `src/push-button.js`(`PushButtonEngine`)
- `public/widgets/push-button.html` と `public/widgets/push-button.js`(ES5)
- 共有ファイルへの足し込み(vote の card と同じ一覧)、`docs/knowledge/operating.md` に操作方法

## 設定 `pushButtons`(種類: `map`、ページ `push-button`、置き場所は `placementFields`)
- `label`(文字、初期値「押せ!」)
- `seconds`(数、初期値 5、1〜60。受付の長さ)
- `keyword`(文字、初期値「押」。コメントの本文がちょうどこれのときだけ押した人として数える。空にはできない)
- `likesPerPush`(数、初期値 5、0 でいいねでは押さない、0〜1000。いいね何回で「1押し」に数えるか)
- `steps`(`list` の数字、初期値 `[3, 10, 30, 100]`。押した数がこの値以上になるごとに 青→緑→赤→金 の段階。4個ちょうど、昇順でなければ日本語のエラー)
- `blueActions` `greenActions` `redActions` `goldActions`(型 `actions`、初期値 `[]`。その段階で結果が出たときに動かす。例: 赤で `roulette.spin`、金で `rush.start`)
- `missText`(文字、初期値「不発」。段階に届かなかったときの文字)
- `sound`・`volume`・`color`

## 状態と操作(`PushButtonEngine`)
- フェーズ: `idle` → `open`(受付中)→ `result`(結果発表)。`reset` でいつでも `idle`
- `start(id, {seconds?})`: `open` にして、押した数を 0 にする。`open` 中の `start` は日本語のエラー
- 押した数 = 「キーワードのコメントをした人の数(1人1回)」+ 「`open` 中のいいねの合計 ÷ `likesPerPush`(切り捨て)」。コメントで押した人の集まり(ID)はメモリだけで、`start`/`reset`/終わりで捨てる。いいねは人で分けず、合計だけを持つ(`like` イベントの `count`。累計の `total` は使わない)
- 時間が来たら自動で結果にする(`finish()`)。`finish(id)` を手でも押せる(早く締める)。`result` 済みで押しても、動作は二度動かさない
- 結果: `{ pushes, byComments, byLikes, tier: 0..4, tierName: 'miss'|'blue'|'green'|'red'|'gold' }`。`steps` を使って段階を決める。段階が 1 以上のとき、その段階の `…Actions` を `runActions(..., { source: 'push', pushId })` で動かす(`tier 0` は何も動かさない)
- `snapshot()`: `{ [id]: { phase, label, seconds, endsAt, now, pushes, steps, result, recent: [名前..] } }`。ユーザー ID は入れない。押した数は 250ms にまとめて配る
- WebSocket: `{ type: 'push', id, push: <状態>, event: 'start'|'tally'|'result'|'reset' }`
- 設定の変更・`entitled('pushButtons')` が false のときの扱いは vote と同じ

## 操作の入口(vote と同じ形)
- ダッシュボード: 「はじめる」「いま締める」「リセット」、「『押』と打つ(テスト)」、「いいね ×N(テスト)」
- `/api/push-button`(状態)、`/api/push-button/:id/:action`(`start` `finish` `reset`、GET でも可)、`/api/control` の target `push`
- MCP の道具 `push_button`(`action` = `status|start|finish|reset`、`id`、`seconds`)、`src/admin.js` の `pushButton()`、CLI `tw push [start|finish|reset|status] [名前] [--seconds N]`
- AI 用 API: `POST /push-button`(tool `push_button`、scope `operate`)

## 画面 `push-button.html`(幅 640 × 高さ 360 が目安)
- 待機中は透明。`start` で下から大きなボタン(角の立った墨のボタンに白文字「押せ!」)がせり上がる。朱の枠が残り時間で縮む(時間の数字も)
- 押された数が増えるたびに、ボタンが一瞬沈み(スケールを縮める)、「N 押し」の数字が桁ごとに回る。コメントで押した人の名前を小さく出す(最大3つ、記録しない)
- 終わりの1秒に入ると音が落ちて静かになり(溜め)、結果を叩きつける: 段階の色(青<緑<赤<金)の面と「N 押し」と段階の言葉。金はボタンが割れるように飛ぶ(CSS・canvas で描く)。不発は暗く「不発」とだけ
- `?preview=1` と見本モードでは、押した数 14(緑)の画面を出す
- 点滅は1秒3回まで。効果音は WebAudio

## 完成の条件
- AC-1 `pushButtons` が `schema.js` にあり、日本語の説明つき。`steps` が 4 個でない・昇順でない、`keyword` が空、`seconds` が範囲外のときは日本語のエラーで保存されない
- AC-2 コメント「押」(別々の3人)+ 同じ人がもう一度「押」+「押す」「押 」のような違う文は、人数は 3 になる(「押 」は trim して「押」なので数える。「押す」は数えない)
- AC-3 `likesPerPush: 5` のとき、`open` 中のいいね 12 回で 2 押し。`likesPerPush: 0` ではいいねを数えない。`open` でないときのコメント・いいねは数えない
- AC-4 結果の段階: 押した数 2 → `tier 0`(`steps` が [3,10,30,100])、3 → 青、10 → 緑、30 → 赤、100 以上 → 金。`byComments` と `byLikes` の内訳が合う
- AC-5 段階の動作: 赤で `roulette.spin` が動き、ルーレットが回る(テストでは `RouletteEngine` の `spin` が 1 回呼ばれる)。`tier 0` は何も動かない。結果を2回出しても動作は 1 回。動作が失敗しても結果は出る
- AC-6 時間で自動に結果が出る。`finish` で早く締められる。`reset` でタイマーも消える。`start` の二重はエラー
- AC-7 テスト送信: 配信中の `test: true` のコメント・いいねは数えない。つなぐ前のテストは数えるが、配信が始まる `reset` で 0 に戻る
- AC-8 **記録に残さない**: 一通り回したあと、`data/` 以下のファイル・`snapshot()`・WebSocket・API の応答に、押したユーザーの ID が含まれない
- AC-9 操作の入口: GET の `/api/push-button/default/start` → `finish` → `reset`、`/api/control`、`admin.pushButton()`、MCP `push_button`、CLI `tw push` が同じ遷移。OBS の鍵では GET `/api/push-button` だけ通る。AI 用 API は scope `operate` だけ、配信中の本番では 403
- AC-10 `FEATURES` に `pushButtons`。使えないテナントでは `locked.html`
- AC-11 `push-button.js` は ES5(`es5-public.test.js` に足す)、CDN なし。待機(透明)・受付中・結果(青/金/不発)の画面を撮る
- AC-12 `simple.js`(`GROUPS` は「企画・ゲーム」)・`editor.js` の試すボタン・`all.html` に出る
- AC-13 今あるテストは全部通る(Windows の既知6件を除く)。テストを書き換えて通さない

## 作らないもの
- カットインを結果で動かすこと(`cutin*.html` に触らない。連動は、めにくんの決定待ち)
- 人ごとの押した回数のランキング・履歴
- ギフトで押すこと(ギフトは対象外。お金を使わない参加のため)
- 押した人へのアバター表示(名前だけ)

## 証拠
- `test/acceptance/push-button.test.js`(AC-1〜10)、`test/es5-public.test.js`、`npm test`、撮影(ポート 4104)
