# participation-vote: コメントの「1」「2」「3」で集計する投票(参加型ウィジェット 1/3)

仕事の種類: 作り込み(新しい仕組み+画面+操作の配線)。参加型は3枚に分ける。この1枚目が共通の土台も作るので、**vote → push-button → cheer の順**に、同じ worktree(dev/participation)で回す。
見た目が変わるか: 変わる(新しいウィジェット `vote.html` が増える。既存のウィジェットは変えない)

目的: お金を使わない視聴者も、コメントで配信の流れを決められるようにする。始める・締める・結果を出すを、ボタン・Stream Deck の GET URL・MCP・CLI のどこからでも同じようにできる。

## 3枚に共通の決まり(2枚目・3枚目もこれに従う)
- 状態はサーバー(`src/` の新しいファイル)で持ち、WebSocket で配る。OBS を読み込み直しても、画面は `GET /api/...` で今の状態から続きを出す
- **コメントの名前は画面に出してよいが、記録に残さない**: ファイル(data/ 以下、履歴、ログ)に、ユーザー ID・名前・アイコン URL を書かない。「1人1票」「1人1回」の判定に使う ID の集まりはメモリだけに持ち、始め直し・リセット・終わりで捨てる。`snapshot()` と API の応答にもユーザー ID を入れない(画面に出す「直近の名前」だけ。名前は最大5件、メモリだけ)
- **テスト送信は本番の数を汚さない**: `hub.js` は配信中(live)のテスト(`test: true`)を `event` として出さないので、エンジンは `hub.on('event')` だけ聞けばよい。つなぐ前のテスト・デモの分は数えるが、`hub.on('reset')`(配信が始まった時)で空にする
- 画面の文字は日本語。ウィジェットの JS は ES5(`public/widgets/` の新しい `.js` を `test/es5-public.test.js` の対象に足す)。外部 CDN なし。効果音は WebAudio で合成。点滅は1秒3回まで
- 見た目: 普通のウィジェット=テレビのテロップ(墨 #111113・白 #F6F5F1・朱 #FF4F1F・金 #FFC53D、不透明、飾りだけのアイコンなし)。結果が出る瞬間だけパチンコ文法(溜めて放つ、情報は最小・刺激は最大)。参考: `docs/DESIGN.md`、`public/widgets/wins.html`、`rush.html`
- 新しいウィジェットの追加場所(3枚とも同じ形): `src/schema.js`(日本語の説明つき)、`src/runtime.js`(FEATURES の並びに足す・エンジンを作る・`applyEngines` に設定を渡す・`close`・`OBS_ALLOWED` に GET を足す・`performControl` の target・`r.all('/api/<名前>/:id/:action')` と `r.get('/api/<名前>')`)、`public/dashboard/simple.js`(GROUPS・INFO・SIMPLE・SIMPLE_LABELS・SUMMARY)、`public/dashboard/editor.js`(`fillActions` の試すボタン)、`public/widgets/all.html`(`map` に足す)、`src/admin.js`・`mcp/server.js`・`bin/tw.js`・`src/ai-mcp.js`・`src/ai-api.js`(MCP・CLI・AI 用 API)。共有ファイルは**足すだけ**。既存の行の並べ替え・書式直しをしない
- 触らないファイル: `public/widgets/cutin*.html`、`public/widgets/lib/cutin*.js`、`src/cutin-style.js`、`docs/cards/effect-log.md`、`src/history.js`(記録に参加型を足すのは次の仕事)
- 共有の土台はこの1枚目で作る: (a) `src/config.js` の `checkValue` に `case 'actions'`(`checkActions(value, where, issues)` を呼ぶ)、(b) `src/actions.js` の `ACTION_TYPES` と `runOne` に `roulette.spin`(`id` は省けて、省くと今のルーレット。`deps.roulette.spin(id ?? null, trigger)` を呼ぶ。`runtime.js` の `actionDeps` に `roulette` を足す)、(c) `editor.js` の設定欄で `actions` 型を YAML の欄(`rules` 系と同じ書き方)で編集できるようにする

## 作るもの
- `src/vote.js`(`VoteEngine`。`WinsEngine` の作りに合わせる)
- `public/widgets/vote.html` と `public/widgets/vote.js`(ES5)
- 上の共有ファイルへの足し込み、`docs/knowledge/operating.md` に操作方法を足す

## 設定 `votes`(種類: `map`、ページ `vote`、`inAll`・`posX` などの置き場所は `placementFields`)
- `title`(文字、初期値「どれにする?」)
- `options`(`list`、初期値 `[A, B, C]`、2〜9個。多すぎ・少なすぎは日本語のエラー)。番号は上から 1,2,3…
- `durationSeconds`(数、初期値 60、0 で時間では締めない、0〜3600)
- `autoReveal`(真偽、初期値 true。時間で締まったら続けて結果を出す)
- `resultActions`(型 `actions`、初期値 `[]`。結果が出たときに動かす: `roulette.spin` `rush.start` `gacha.start` `media.play` `timer.add` `wins.add` `boss.damage` など既存の動作)
- `showNames`(真偽、初期値 true。直近に投票した人の名前を小さく流す)
- `sound`(真偽)・`volume`(0〜1)・`color`(色、初期値 accent)

## 状態と操作(`VoteEngine`)
- フェーズ: `idle`(待機)→ `open`(受付中)→ `closed`(締め切り・集計を見せたまま)→ `result`(結果発表)。`reset` でいつでも `idle`
- `start(id, {options?, seconds?})`: `open` にして数を 0 にする。`options`/`seconds` を渡せば今回だけ設定を上書き。すでに `open` のときは日本語のエラー(「もう始まっています」)
- `close(id)`: `open` → `closed`。受付をやめる。`open` でないときはエラー
- `result(id)`: `open` か `closed` なら締めてから `result` にし、結果(下)を出す。`result` 済みで押したら同じ結果をもう一度出す(演出だけやり直し。`resultActions` は**二度動かさない**)
- `reset(id)`: `idle` に戻し、ID の集まりも捨てる
- 票の数え方: フェーズが `open` のとき、`chat` イベントの本文を trim して全角数字を半角にし、**ちょうど「1」〜「options の数」の1文字**のものだけを票にする(「1番」「1 2」「11」は票にしない)。同じユーザー(`user.id`、無ければ `user.name`)は2回目以降を数えない(最初の票が有効)
- 結果: `{ counts: [..], total, winners: [番号..], tie: 真偽, percent: [..] }`。票が 0 のときは `winners: []`。同数1位は `tie: true` で全員 winners
- 時間: `durationSeconds` > 0 のとき、`start` から時間が来たら自動で `close`(`autoReveal` なら続けて `result`)。残り時間は `endsAt`(ミリ秒)として状態に含め、画面が数える
- `snapshot()`: `{ [id]: { phase, title, options, counts, total, endsAt, now, result, recent: [名前..] } }`。ユーザー ID は入れない
- WebSocket: `hub.broadcast({ type: 'vote', id, vote: <1件分の状態>, event: 'start'|'tally'|'close'|'result'|'reset' })`。票が入るたびではなく、**250ms にまとめて**配る(コメントが大量に来ても重くしない)
- `hub.emit('vote', ...)` は使わない。`resultActions` は `runActions(actions, actionDeps(), { source: 'vote', voteId })` で `runtime.js` から動かす(エンジンは `onResult` のコールバックを受け取る)
- 設定が変わっても、`open` 中の投票は続ける。設定から消えた id の投票は閉じる。`enabled` 相当は `entitled('votes')`(管理者が使えなくしたら止める)

## 操作の入口(同じ操作ができること)
- ダッシュボード(試すボタン): 「はじめる」「しめきる」「結果を出す」「リセット」と、`options` 数ぶんの「N に1票(テスト)」(`/api/simulate` の chat、本文が番号)
- GET/POST: `/api/vote`(今の状態)、`/api/vote/:id/:action`(`start` `close` `result` `reset`。`all` は全部、`active` は今のもの。Stream Deck 用に GET でも通る)
- `/api/control`: `target: 'vote'`、`action` は同じ。`data: { id, options?, seconds? }`
- MCP(`mcp/server.js`)の道具 `vote`: `action` = `status|start|close|result|reset`、`id`、`options`、`seconds`。`src/admin.js` に `vote(action, id, opts)` を足して、CLI・MCP がそれを使う
- CLI: `tw vote [start|close|result|reset|status] [名前]`、`tw vote start 名前 --seconds 30` のように秒を渡せる(HELP に足す)
- AI 用 API: `src/ai-api.js` の `AI_ROUTES` に `POST /vote`(tool `vote`)、`TOOLS` に `vote: { scope: 'operate', mutate: true, operate: true }`、`operate()` に target `vote` を足す。`src/ai-mcp.js` の `registerAiTools` にも `vote` を足す。配信中の本番では変更できない(既存の `operate` の柵に乗る)

## 画面 `vote.html`(幅 720 × 高さ 360 が目安。`size: () => [720, 360]`)
- 受付中: 上に見出しと残り時間(数字は Barlow Condensed)、選択肢ごとに「番号 | 名前 | 横バー | 票数・%」の行。バーは票が入ると伸び(ワイプ)、先頭は朱、ほかは白。票が入った行が一瞬だけ明るくなる
- 締め切り: 「しめきり」の帯が入り、バーが止まる。結果発表: 1秒の溜め(バーが止まり、音が落ちる)→ 勝った行が金になり「ドン」と叩きつけ、ほかは暗くなる。同数は「同票」と出して勝った行を全部金にする。票 0 は「0票」と出すだけ
- 待機(`idle`)中は何も映らない(透明)。`?preview=1` と見本モードでは、見本の投票(A 12票・B 7票・C 3票)を出す
- `showNames` が true なら、直近の名前を最大3つ、右下に小さく順に出す(出して消す。記録しない)
- `hello` と `GET /api/vote` で今の状態を受け、`vote` メッセージで動く。切れたらつなぎ直す(`slot.js` の接続の書き方に合わせる)

## 完成の条件
- AC-1 `votes` が `src/schema.js` にあり、日本語の説明つき。`options` が 1 個や 10 個以上、`durationSeconds` が負、`resultActions` が壊れているときは保存されず日本語のエラーになる。`config.example.yaml` は変えない(または変えたら書き戻しテストが通る)
- AC-2 `VoteEngine`: `start` → コメント「1」「2」「2」「3」(別々の4人)で counts が [1,2,1]、同じ人の2回目は数えない、「1番」「11」「0」「4」(options が 3 個のとき)は数えない、全角「２」は 2 票目として数える
- AC-3 `open` でないとき(待機・締め切り後)のコメントは数えない。`start` を2回続けるとエラー、`close` を `idle` で押すとエラー(日本語、状態は変わらない)
- AC-4 `result`: 勝者・同票・0票の3通りで `winners`/`tie`/`percent` が正しい。`resultActions` は 1 回の投票につき 1 度だけ動く(`result` を2回押しても二重に動かない)。動作の失敗は他の動作を止めず、投票を壊さない
- AC-5 `durationSeconds` で自動に締まる(テストは短い秒数かフェイクタイマー)。`autoReveal` が true なら続けて結果が出る。`reset` で時間のタイマーも消える
- AC-6 テスト送信: 配信中(`hub.status.mode === 'live'`)の `test: true` のコメントは票にならない。つなぐ前の `test: true` は票になるが、`hub.setStatus({mode:'live'})` で `reset` が走って空になる
- AC-7 **記録に残さない**: 投票を最後まで回したあと、`data/` 以下に作られたすべてのファイルと、`snapshot()`・WebSocket の全メッセージ・`GET /api/vote` の応答に、投票した人のユーザー ID が含まれない(名前は WebSocket の `recent` にだけ出てよい)。テストでユーザー ID に印のついた文字列を使って全部を検索して確かめる
- AC-8 操作の入口: `GET /api/vote/default/start` → `close` → `result` → `reset` が通る。`/api/control`、`src/admin.js` の `vote()`、MCP の `vote`、CLI の `tw vote` が、同じ状態遷移をする。不明な action は日本語のエラー。OBS 用の鍵(`role: obs`)では `GET /api/vote` だけ通り、`/api/vote/default/start` は 403
- AC-9 AI 用 API: `vote` が `operate` の scope でだけ通り、配信中の本番では 403、`status` は読める(`test/ai-control.test.js` の書き方に合わせる)
- AC-10 `FEATURES` に `votes` が出て、管理者が使えなくしたテナントでは `vote.html` が `locked.html` になり、エンジンも動かない
- AC-11 画面: `vote.js` は ES5 として解析でき(`test/es5-public.test.js` に足す)、CDN を使わない。`vote.html` を実際のブラウザで開いて、待機(透明)・受付中・締め切り・結果(勝ち/同票)の画面を撮る
- AC-12 `simple.js` の `GROUPS`(「企画・ゲーム」)・`INFO`・`SIMPLE`・`SIMPLE_LABELS`・`SUMMARY` に `votes` がある。`editor.js` の `fillActions` に試すボタンがある。`all.html` に出る
- AC-13 今あるテストは全部そのまま通る(Windows で元から落ちる6件を除く)。テストを書き換えて通さない

## 作らないもの
- 選択肢ごとに別の動作(`resultActions` は結果が何でも同じ。勝った選択肢で変えるのは次の仕事)
- 投票の履歴・過去の結果の保存(ファイルに残さない)
- 同じ人が票を変えること、複数回の投票(1人1票の最初の票だけ)
- カットインを結果で動かすこと(`cutin*.html` は別の担当のファイル。カットイン連動は、めにくんに決めてもらう)
- ギフトでの加点、ランキングへの連携

## 証拠
- `test/acceptance/vote.test.js`(AC-1〜10。一時ディレクトリで `Hub`・`VoteEngine`・`createRuntime` を使う。`test/acceptance/guard-harness.js` の準備に合わせる)
- `test/es5-public.test.js`(AC-11 の解析)
- `npm test`、撮影(ポート 4104、`node server.js --demo`。画像は `C:/Users/user/lulwork/participation-shots/`、コミットしない)
