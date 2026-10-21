# stepup: ステップアップ予告(みんなのギフトの合計で STEP 1→5 が1段ずつ上がる)の仕組み(サーバー・設定・操作)

仕事の種類: 作り込み(サーバーの仕組み+設定+操作口)
見た目が変わるか: いいえ(この札は画面を作らない。画面は `stepup-screens.md`)
順番: この札 → `swarm.md` → `stepup-screens.md`(3枚とも `src/runtime.js`・`src/schema.js` などの共有ファイルに足すので、同時には回さない)

目的: 短い時間(既定30秒)に配信全体で届いたギフトのコインの合計で、STEP 1→5 が1段ずつ上がる。少額の人も合計に入る。状態はサーバーで持ち、WebSocket で配る(OBS を読み込み直しても続きから出せる)。テナントごとに別の状態。

## 作るもの
- `src/stepup.js`: `StepupEngine`(`src/rush.js` と同じ形: `constructor(hub)`、`setConfig(config)`、`snapshot()`、`onEvent(e)`、`start`/`stop`/`reset`、`close()`)
- `src/runtime.js` への足し込み(既存行は動かさない):
  - エンジンを1つ作る
  - `applyEngines` で `stepup.setConfig(entitled('stepup') ? config.stepup : { ...config.stepup, enabled: false })`
  - `FEATURE_ORDER` に `'stepup'` を足し、`PREMIUM_KEYS` にも入れる
  - `OBS_ALLOWED` に `/^\/api\/stepup$/`
  - `r.get('/api/stepup', …snapshot)`
  - `performControl` に `target === 'stepup'`
  - 返す口に `readStepup()`、`close()` で `stepup.close()`
- `src/schema.js` に `SCHEMA.stepup`(kind: 'object'、page: 'stepup'、`size: () => [1080, 1920]`)を足す
- `public/dashboard/simple.js` に足す: `GROUPS` の「豪華な演出」に `'stepup'`、`INFO.stepup`、`SIMPLE.stepup`、`SIMPLE_LABELS`、`SUMMARY.stepup`
- `config.example.yaml` に `stepup:` の例(コメント付き。読み書きしても同じ文字になること)
- `src/admin.js` に `stepup(action)`、`mcp/server.js` に `stepup` ツール、`bin/tw.js` に `stepup [start|stop|reset|demo]`(`rush` の隣に足すだけ)
- `docs/IDEAS.md` の「ステップアップ予告」の見出しに ✅ を付け、実装の説明を3行足す(完成後)

## 設定(SCHEMA.stepup.fields。説明は日本語で、やさしく)
- `enabled`(既定 true)
- `windowSeconds`(既定 30、5〜300): 1回のステップアップの長さ(最初のギフトから数える)
- `scale`: `small` / `medium` / `large` / `custom`(既定 `medium`)。配信の規模に合わせた境目のプリセット。STEP 1〜5 に届く合計コイン:
  - small: 10・30・60・100・200
  - medium: 100・300・600・1000・2000
  - large: 500・1500・3000・5000・10000
  - custom: `step1Coins`〜`step5Coins`
- `step1Coins`〜`step5Coins`(custom のとき。既定は medium と同じ。1以上。前の段より大きいことを検証する)
- `minCoins`(既定 1、1以上): このコイン未満のギフトは数えない
- `step1Text`〜`step5Text`(既定 `STEP 1`〜`STEP 5`)、`finalText`(既定 `虹確定`)
- `cooldownSeconds`(既定 10、0〜120): STEP 5 で終わったあと、次が始まるまでの待ち
- `sound`(true)、`volume`(0.5)、`edge`(`right` / `left`、既定 `right`): 段が積み上がる側

## 動き(サーバー)
- 1回の「ラウンド」: 数えているギフトがない間は待機。数える条件に合う最初のギフトでラウンド開始(`startedAt`、`endsAt = startedAt + windowSeconds`)。ラウンド中のギフトのコインを `total` に足す
- 段(`step` 0〜5): `total` が次の段の境目以上になったら、**ギフト1件につき1段だけ**上げる(大きなギフト1件で一気に飛ばさない。まだ境目を超えていれば次のギフトでまた1段)
- 段が上がるたびに `stepup` を配る: `{ kind: 'up', step, total, user(id/name/avatar), gift(日本語名), coins }`
- STEP 5 に届いたら `{ kind: 'final', … }` を配り、ラウンドを終える(すぐ `cooldownSeconds` の待ちへ)
- `windowSeconds` が過ぎたら `{ kind: 'end', step, total }` を配って待機へ。届いた最高の段と合計を `last` に残す
- 段が上がったときの「送った人」を主役にするため、各段の `by` を状態に持つ
- `snapshot()`: `{ active, step, total, startedAt, endsAt, now, steps: [{ step, coins, by }], thresholds: [5つ], last, cooldownUntil }`
- 設定が変わったら境目を新しくする(ラウンド中なら次の判定から)。`enabled: false` にしたら止める
- WebSocket: `hub.broadcast({ type: 'stepup', stepup: snapshot, event })`(`rush.js` の `#send` と同じ)。ウィジェットが読み込み直したときは `/api/stepup` で続きを出せる
- 操作: `performControl('stepup', action)` の `start`(今から本物のラウンドを数え始める)/ `stop` / `reset`(待機に戻す)/ `status` / `demo`。`entitled('stepup')` でなければ 403(RUSH と同じ書き方)

## テスト送信が本番の集計を汚さない(`src/hub.js` は変えない。`hub.on` で聞くだけ)
- `hub.on('event')` で来るもの(本番の配信と、つなぐ前のテスト・デモ)だけ数える。つなぐ前に試した分は `hub.on('reset')` で待機に戻す(つながったときに hub が reset を出す)
- 配信中のテスト送信(`e.test` かつ `status.mode === 'live'`)は `hub.on('testEvent')` で来る。**状態(`total`・`step`・`last`)を変えず**、画面にだけ `{ kind: 'preview', step(仮の次の段), … }` を配る
- `demo` 操作: 状態を変えずに、画面だけ STEP 1→5 を順に見せる(`preview` を1.5秒おきに5回)。撮影・設定確認用

## 完成の条件
- AC-1 `new StepupEngine(hub)` と `setConfig(defaultsFor('stepup'))` で、medium の境目(100・300・600・1000・2000)に沿って合計コインが境目を超えるたびに `step` が1ずつ上がり、段ごとに `stepup` メッセージが `hub.broadcast` に流れる(`up` の `user` と `gift` に送った人とギフト名が入る)
- AC-2 1件で 5000 コインのギフトが来ても `step` は 1 しか上がらない。続けて小さなギフトが来るたびに 1 段ずつ上がり、STEP 5 で `final` が流れてラウンドが終わる
- AC-3 `windowSeconds` が過ぎたら `end` が流れて待機に戻り、`last` に最高の段と合計が残る。`cooldownSeconds` の間は新しいラウンドを始めない。時間は `t.mock.timers` で進めて確かめる
- AC-4 `minCoins` 未満のギフト、`kind` が gift 以外のイベントは数えない。`enabled: false` や `entitled` が false のときは何も数えない
- AC-5 `scale` の 4 つのプリセットの境目が上のとおり。`custom` で `step3Coins <= step2Coins` のように逆転していたら、設定の検証が日本語のエラーを返す(`src/config.js` の検証に1か所足す。既存の検証は変えない)
- AC-6 `hub.status.mode = 'live'` で `hub.publish({ ...gift, test: true })` を送っても、`snapshot()` の `total`・`step`・`last` が変わらず、`preview` だけが流れる。つなぐ前のテスト(mode が idle)は数え、`hub.reset()` で待機に戻る
- AC-7 `GET /api/stepup`(OBS 用の鍵で読める)、`POST /api/control {target:'stepup', action:'start'|'stop'|'reset'|'status'}`、`tw stepup`、MCP の `stepup` が同じ結果を返す。テナントごとに状態が別(2つの runtime を作って、片方のギフトがもう片方に出ない)
- AC-8 `normalize` の結果に `stepup` の初期値が入り、`config.example.yaml` の読み書きの往復検査(`test/config.test.js`)が通る。`widgetList` に `/widgets/stepup.html` が `[1080, 1920]` で出る
- AC-9 `public/dashboard/simple.js` の `SIMPLE.stepup` の項目名がすべて `SCHEMA.stepup.fields` にあり、`SIMPLE_LABELS` に日本語の呼び名がある(`scale` は「配信の大きさ」のプリセット3つ)
- AC-10 既存のテストが1つも書き換わらず `npm test` が通る(Windows で元から落ちる6件を除く)

## ファイルの範囲
- 触ってよい: `src/stepup.js`(新)、`src/runtime.js`・`src/schema.js`・`src/config.js`(検証1か所)・`public/dashboard/simple.js`・`src/admin.js`・`mcp/server.js`・`bin/tw.js`・`config.example.yaml`・`docs/IDEAS.md`(どれも足すだけ)、`test/acceptance/stepup.test.js`(新)
- 触らない: `public/widgets/cutin*.html`・`src/cutin-style.js`・`src/hub.js`・`src/demo.js`・`server.js`・既存のテスト・`docs/cards/effect-log.md`
- 作らない: 画面(`stepup-screens.md`)、群予告(`swarm.md`)、AI API(`src/ai-api.js`)への口、新しい npm パッケージ

## 証拠
`test/acceptance/stepup.test.js`(`node:test`。`Hub` を直接使い、`t.mock.timers` で時間を進める。本物の本番には触らない)と `npm test`。受け入れテストは実装と別の呼び出しで先に書き(AC を1つずつテストにする)、テストを書き換えて緑にしない。
