# visitors: 初見さん・常連さんの入室(配信の記録から初めての人と常連を見分けて迎える。記録は HMAC した番号だけ)

仕事の種類: 作り込み(サーバーの記録の仕組み1つ、ウィジェット1つ、テスト送信の種類の追加)
見た目が変わるか: はい(新しいウィジェット1つ。既存の画面は変えない)。本番に出す前にめにくんが見る
同じ組の続き: `docs/cards/info-feed.md` を先に入れてから回す(`FEATURE_ORDER`・`simple.js`・`editor.js` の足し算が重ならないように)

目的: 初めて来た人と、何度も来ている人を、テロップで迎える。名前やユーザー ID は保存しない(配信者ごとの秘密の値で HMAC した番号だけ)。保存期間を決めて古い記録は消す。

触ってよいファイル:
- 新規: `src/visitors.js`、`public/widgets/visitors.html`、`public/widgets/visitors.js`、`test/acceptance/visitors.test.js`
- 足すだけ(既存行の並べ替え・書式直しはしない): `src/schema.js`(末尾の節)、`src/runtime.js`(`FEATURE_ORDER`・`VisitorLog` を作る・API・`OBS_ALLOWED`・`performControl` に `visitors`・`close()`)、`src/demo.js`(`makeEvent` に `member`)、`mcp/server.js`・`src/ai-mcp.js`(`test_event` の kind に `member` と `visits`)、`bin/tw.js`(`test member [回数]`)、`public/dashboard/simple.js`、`public/dashboard/editor.js`、`test/es5-public.test.js`
触らないファイル: `src/hub.js`、`src/history.js`、`src/normalize.js`・`src/tiktok.js`(`member` の正規化と購読は既にある)、`server.js`、`public/widgets/lib/telop.js`(info-feed が作る。このカードでは当てにせず、必要な部品は `visitors.js` の中に持つ)
作らないもの: 常連の一覧を見る画面、名前での検索、配信者をまたいだ集計、「全部まとめて」への組み込み、絵の素材、音

## 設定(src/schema.js。map の節。説明は日本語)

`visitors`(page `visitors`、title「初見さん・常連さん」、`size: () => [760, 160]`):
- showFirst bool true / showReturning bool false / showRegular bool true
- regularVisits num 3(2〜100): 何回目の配信から常連さんとして迎えるか
- firstText str「はじめまして！ゆっくりしていってね」/ returningText str「また来てくれてありがとう」/ regularText str「{visits}回目の来場、いつもありがとう」({visits} は回数に置き換わる)
- duration num 4(1〜30 秒)/ maxQueue num 5(1〜50)/ avatars bool true
- keepDays num 90(1〜365): 記録を残す日数(複数あるときはいちばん短い日数。いちばん最後に来た日から数える)

## 完成の条件

記録(`src/visitors.js`)
- AC-1 `VisitorLog` は `new VisitorLog(hub, { dir, now })` で作る(`dir` は `dataDir`、`now` はテスト用の時計)。設定は `hub.config.visitors`(`hub.on('config')` で更新)。hub の `event` を購読する
- AC-2 `visitors` の設定が1つもない配信者では何もしない(`visitors.json` も `visitors.key` も作らない)
- AC-3 見分ける対象は `kind` が `member`・`chat`・`gift`・`follow`・`share`・`like` で `user.id` があるイベント。**配信中**(`hub.status.mode === 'live'`)だけ。その配信で初めて見た人を1回だけ処理する(同じ配信で2回目以降は何もしない)。「その配信」は status が live になった時刻で区切る(途中の再接続は同じ配信。`connecting` や `error` を挟んでも、idle・ended・demo を挟まなければ同じ)
- AC-4 キーは `HMAC-SHA256(秘密, user.id)` の16進の頭 16 文字。秘密は `<dir>/visitors.key`(32 バイトの乱数の16進。初めて要るときに作る。権限 0600)。配信者ごとに `dir` が分かれているので、秘密も別になる。ファイルが壊れていたら作り直さず、エラーを log に出して記録を止める(古い番号と食い違うため)
- AC-5 保存するのは `<dir>/visitors.json` の `{ version: 1, people: { <キー>: { visits, first: 'YYYY-MM-DD', last: 'YYYY-MM-DD', stream: <配信の印(live になった時刻のミリ秒)> } } }` だけ。名前・ユーザー ID・アイコンの URL・コメントはどこにも書かない(テストでファイルの全文を調べる)
- AC-6 迎えるとき `visits` を数える: 記録になければ 1(初見)。あって `stream` が今の配信と違えば +1。同じ配信なら変えない。`last` と `stream` を更新する
- AC-7 `last` が `keepDays` より古い記録は、読み込んだとき・保存の前・1日1回(`setInterval` + `unref`)に消す
- AC-8 書き込みはまとめて(5秒ごと、`dirty` のときだけ)。一時ファイルに書いて置き換える。書けないときは `console.warn` を1行出して続ける(配信は止めない)。`close()` で最後に保存してタイマーを止める
- AC-9 **テスト送信は記録を汚さない**: `e.test === true` と、`user.id` が `demo_` で始まるものは、配信中でも配信前でも記録に入れず、`visits` も増やさない
- AC-10 迎えたら `hub.broadcast({ type: 'visitor', visitor: { user: { name, avatar }, visits, first: visits === 1 } })` を配る(ユーザー ID は載せない)。`snapshot()` は `{ enabled, stored, stream: { first, returning, regular } }`(この配信で迎えた数。regular は `regularVisits` 以上)。配信が変わったら `stream` の数を 0 に戻す

テスト送信と操作
- AC-11 `makeEvent('member', { user, visits })` を足す。`kind: 'member'`、`user` は `demoUser(...)`、`testVisits: visits || 1`。`runtime.simulateEvent` はそのまま通る。hub は配信中のテスト送信を `testEvent` でだけ出すので、`VisitorLog` は `testEvent`(と、配信前の `event` の `test: true`)から `{ type: 'visitor', visitor: { ..., visits: e.testVisits || 1, test: true } }` を配るだけにする(記録には触らない)
- AC-12 MCP(`mcp/server.js`・`src/ai-mcp.js`)の `test_event` の `kind` に `member` を足し、`visits`(1〜999)を足す。`src/admin.js` の `testEvent` が `visits` を通す。CLI は `tw test member [回数]`。`src/ai-api.js` にテスト送信の種類の一覧があれば同じように足す
- AC-13 `GET /api/visitors` が `snapshot()` を返す(OBS 用の鍵でも読める)。`POST /api/control { target: 'visitors', action: 'forget' }` で記録を全部消す(`performControl` に足す。OBS 用の鍵では元からできない)。`forget` は秘密の値も作り直す

ウィジェット(`visitors.html` + `visitors.js`)
- AC-14 `visitors` の設定を `/api/config` から読む(ES5、`XMLHttpRequest`。`?id=` が無ければ `default`、無ければ最初のもの)。WebSocket の `visitor` を受けて、`visits` から 初見さん(1。札は朱)/ おかえり(2〜`regularVisits`-1。札は白)/ 常連さん(`regularVisits` 以上。札は金)を決める。`showFirst`・`showReturning`・`showRegular` で出さない種類は捨てる
- AC-15 テロップは墨の面に、左に札、1行目「{名前}さん」(大きく)、2行目に対応する文(`{visits}` を置き換える)。`avatars` なら 48px の四角いアイコン。`duration` 秒ずつ順に出し、入るときはワイプ、抜けるときも clip-path。待ちが `maxQueue` を超えたら古い人から飛ばす
- AC-16 出すものがないときは何も映らない。`?preview=1`・見本モードでは「はじめまして」「常連」の見本を順に出す。`?theme=light`・config の theme に対応。ES5・CDN なし・配信者ごとの URL でも動く

共通
- AC-17 `FEATURE_ORDER` に `visitors` を足し、最初から使える。「かんたん」: `GROUPS` の「お礼・にぎやかし」に足し、`INFO`(icon `door-open` など)、`SIMPLE`(「迎える人」`showFirst, showReturning, showRegular, regularVisits`/「迎える文」`firstText, returningText, regularText`/「見た目」`duration, avatars`/「記録」`keepDays`)、`SIMPLE_LABELS`、`SUMMARY`。`editor.js` の試すボタン: 「初見さんを迎える」`member` 1、「常連さんを迎える」`member` を `regularVisits` 回で
- AC-18 設定は `src/config.js` の検証を通る。`config.example.yaml` は変えない
- AC-19 今あるテストは全部そのまま通る(Windows の既知の6件を除く)

証拠: `test/acceptance/visitors.test.js`(一時ディレクトリと `now` の差し替えで、配信またぎの回数・保存期間で消える・テスト送信と `demo_` が記録に入らない・`visitors.json` に名前とユーザー ID が無い・設定が無ければファイルを作らない・秘密が配信者ごとに別・壊れた秘密で記録を止める・`forget` を確かめる)、`npm test`、暗い背景と明るい背景の撮影
