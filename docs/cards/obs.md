# obs: 虹・大当たり・RUSH・ボス討伐のとき、配信者の OBS のカメラを揺らす・ズームする・シーンを替える・ソースを出し入れする

仕事の種類: 作り込み(新しい仕組み + 設定の項目 + 偽サーバーのテスト)
見た目が変わるか: 配信者の映像が揺れる・拡大する(OBS の中)。ライコネのウィジェット自体の見た目は変えない。揺れの強さと長さはめにくんが手元の OBS で見る

目的: オーバーレイだけでなく、配信者の映像そのものが動くと迫力が段違いになる(docs/IDEAS.md「OBS 連携」)。

## 仕組み(調べて決めたこと)
- 本番はマルチテナントで LuLServer にあり、OBS は配信者の PC の中にある。サーバーから配信者の OBS(obs-websocket)へはつなげない。なので、OBS に入れる「見えないブラウザソース」(`public/widgets/obs-bridge.html`)が、ライコネの WebSocket(`/t/<鍵>/ws`。`lib/overlay.js` の `connect` と同じ)でイベントを受け、同じ PC の `ws://127.0.0.1:4455`(obs-websocket v5)へ命令する。
- 受けるイベントはすでに流れているものだけ。サーバー側に新しいメッセージ型は作らない:
  - 虹のカットイン: `event` メッセージの gift の `totalDiamonds` が `cutins.<id>.rainbowCoins` 以上(段階の判定は `public/widgets/lib/cutin.js` の `tierFor` と同じ。**cutin*.html と cutin-style.js は別担当の持ち物なので触らない**。判定はブリッジ側に書き写す)
  - 金のカットイン: 同じく `goldCoins` 以上 `rainbowCoins` 未満
  - スロット: `type:'slot'`、`event:'start'` の `result.tier` が `jackpot` / `big`。結果はサーバーで先に決まるので、動かすのは「リールが止まる頃(`reelStopMs*3` 後)」を既定にする
  - RUSH: `type:'rush'` の `event.kind` が `start` / `end`
  - ボス討伐: `type:'boss'` の `event.kind` が `defeat`
  - ガチャ: `type:'gacha'`、`event:'reveal'`、`tier` が pity の対象(いちばん上のレア)
- テスト送信(`e.test`)でも動く(配信者が試せるように)。ただし hello の `sample` が on の見本モードでは動かさない。
- 命令は obs-websocket v5 の公式仕様(`docs/generated/protocol.md`)どおり:
  - 接続: Hello(op 0)→ Identify(op 1、`rpcVersion:1`、`eventSubscriptions:0`)→ Identified(op 2)。それまで Request は送らない
  - 認証(Hello に `authentication` があるとき): `secret = base64(sha256(password + salt))`、`authentication = base64(sha256(secret + challenge))`。sha256 は `crypto.subtle` に頼らず ES5 の自前実装(`public/widgets/lib/sha256.js`、UTF-8 対応)を書く。新しいライブラリは入れない。base64 は `btoa`
  - Request(op 6)`{requestType, requestId, requestData}`、返事は RequestResponse(op 7)。使う命令: `GetSceneItemId`(sceneName, sourceName → sceneItemId)、`GetSceneItemTransform`、`SetSceneItemTransform`(positionX / positionY / scaleX / scaleY だけ送る)、`SetSceneItemEnabled`、`SetCurrentProgramScene`、`GetCurrentProgramScene`
  - 揺れ・ズームはブラウザ側のタイマーで 1 フレームずつ `SetSceneItemTransform` を送る(間隔 33ms 以上。OBS を詰まらせない)。終わったら必ず**元の transform に戻す**(途中で切れても、次につながったとき最初に保存した値へ戻す)
- **OBS のパスワードはサーバーへ送らない・保存しない。** URL の `#` の後ろに置く(例 `obs-bridge.html#pw=...`)。ブラウザは `#` 以降を HTTP リクエストに含めないので、ライコネのサーバーのログ・設定・履歴・トンネルのどこにも残らない。設定ファイル・`/api/config`(OBS 用の鍵でも読める)・ダッシュボードの URL 欄にもパスワードの項目を作らない。`location.hash` から読み、読んだらすぐ `history.replaceState` で `#` を消す(画面共有に写らないように)。この理由を schema.js の説明と help の文に日本語で書く。
- OBS が無い・つながらない・パスワードが違う・ソースが見つからない: 何も表示せず、何も壊さず、静かに何もしない。つなぎ直しは 5 → 60 秒まで間隔を広げる。コンソールに日本語 1 行(パスワードは出さない)。

## 設定(`src/schema.js` の新しいセクション `obs`、kind は object、page は `obs-bridge`)
項目(説明は日本語。足すだけで、既存行は動かさない):
- `enabled`(既定 false): OBS を動かす。**初期は切**
- `port`(既定 4455、1〜65535): OBS の WebSocket のポート(パスワードはここに置かない)
- `scene`(既定 ''): 動かす場面の名前。空なら今映っている場面
- `source`(既定 ''): 揺らす・拡大するカメラのソース名。空なら揺らしも拡大もしない
- `rules`(型 `obsRules`): `[{ on, do, ... }]`
  - `on`: `rainbow` / `gold` / `jackpot` / `slotBig` / `rushStart` / `rushEnd` / `bossDefeat` / `gachaTop`
  - `do`: `shake`(`strength` 0.1〜1 ではなく**ソースの大きさに対する % で 0.1〜3、既定 1.5**。`seconds` 0.2〜3、既定 0.8)/ `zoom`(`scale` 1〜1.5、既定 1.08。`seconds` 既定 1.2。行って戻る)/ `scene`(`name` の場面へ。`backSeconds` 秒後に元の場面へ、既定 3、0 なら戻さない)/ `show`・`hide`(`item` のソースを出す/消す。`seconds` 後に元へ、既定 3)
  - 1 つの `on` に複数のルールを書ける。上から順に動かす。揺れとズームは同じソースに重ねず、順番に動かす
- `cooldownSeconds`(既定 4、0〜60): 同じルールが続けて動くのを止める秒数
- `reduce`(既定 false): 「弱めにする」。揺れの強さ・ズームの幅を半分、秒数を 0.6 倍
- 揺れの既定は配信を見にくくしない強さ・長さ。明るさは変えない(点滅しない)。揺れは終わりへ向けて減衰する

初期のルール(`enabled` を入れるまでは何もしない): rainbow → shake + zoom(1.08) / jackpot → shake / rushStart → zoom(1.06, 1.0 秒) / bossDefeat → shake(1.2, 0.6 秒)

## 「かんたん」(`public/dashboard/simple.js`、足すだけ)
- `GROUPS` の「豪華な演出」に `obs`。`INFO.obs`(アイコンは Lucide の `video`、ひとこと「虹や大当たりのとき、OBS のカメラを揺らす・拡大する」)、`SIMPLE.obs`(まとまり: 使う / どのカメラを / どんなとき・どう動かす)、`SIMPLE_LABELS`、`SUMMARY.obs`
- プリセット「動きの強さ」(弱め / ふつう / しっかり = `reduce` と strength の組)
- 使い方の文(日本語): 「OBS のツール → WebSocket サーバー設定で有効にする」「ブラウザソースにこの URL を入れ、末尾に `#pw=` と OBS のパスワードを自分で足す(サーバーには送られません)」。URL 欄に出す URL は `#pw=` を含まない形。`size: () => [320, 120]`

## Stream Deck・MCP・CLI
- 試しに動かす: `POST /api/control` の `target:'obs'`、`action:'test'`、`data:{ rule:'rainbow' }`。`performControl` の最後の汎用分岐(`hub.control(...)`)がそのまま全ウィジェットへ配るので、**サーバーの変更は不要**。ブリッジは `control` メッセージ(`target` が `obs` か `all`)の `action:'test'` で、その `on` のルールを動かす。`action:'off'` は今の動きを止めて元に戻す(非常停止)
- `bin/tw.js` と `mcp/server.js` に、既存の `test`/`rush` と同じ形で `obs [rainbow|jackpot|…]` を足す(`src/admin.js` に小さな関数 1 つ)。tw-guard の決まりに従う
- 設定で `enabled:false` にしても(`config` メッセージで受けて)すぐ元に戻る

## 触ってよいファイル
- 新規: `public/widgets/obs-bridge.html`、`public/widgets/obs-bridge.js`(ES5)、`public/widgets/lib/sha256.js`(ES5)、`test/acceptance/obs.test.js`(一時ポートの偽 obs-websocket とページ形の vm)
- 足すだけ: `src/schema.js`、`src/config.js`(型 `obsRules` の検証)、`public/dashboard/simple.js`、`bin/tw.js`、`mcp/server.js`、`src/admin.js`、`test/es5-public.test.js`(`files` に新しい公開 JS を足す)、`config.example.yaml`(読み書きして同じ文字になること)、`README.md`(使い方を数行)、`public/help/index.html`(配信者向けの使い方)
- 触らない: `public/widgets/cutin*.html`、`public/widgets/lib/cutin*.js`、`rush.html`、`slot.js` など既存のウィジェット(読むだけ)、`src/hub.js`、`server.js`、`docs/cards/effect-log.md`

## 完成の条件
- AC-1 `obs-bridge.html` は何も描かない(透明で空)。ES5、CDN なし。`es5-public.test.js` に足して通る
- AC-2 クライアント部は DOM なしで `vm` 上でも読めるように分ける(例 `OBSBridge.createClient(WebSocketCtor, opts)`)。偽の obs-websocket(Hello の `authentication` あり/なし、Identify の検証、Identified、op 6 への op 7)に対して、正しい `authentication` を作って Identify を送り、Identified の前には Request を送らない。公式仕様の例(パスワード `supersecretpassword`、salt `lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=`、challenge `+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=`)は、node の `crypto` で同じ手順を計算した値と一致する
- AC-3 `sha256.js` は既知のベクトル(空文字、`abc`、日本語を含む文字列、55・56・64 バイトの境界)が node の `crypto` と一致する
- AC-4 パスワード違い(偽サーバーが close 4009)/ 接続できない(ポートが閉じている)/ 返事が来ない(5 秒)/ ソースが無い(code 600): 例外を投げず、何も表示せず、その動きだけ捨てる。つなぎ直しは 5・10・20・40・60 秒(上限 60)
- AC-5 揺れ: 偽サーバーが受ける `SetSceneItemTransform` の `positionX/Y` の変化がソースの大きさの設定値 % 以内、間隔 33ms 以上、最後に元の値に戻る。`reduce` で半分。途中で `off` を受けても、接続が切れても元に戻す
- AC-6 ズーム: `scaleX/scaleY` が 1 倍 → `scale` → 1 倍と動く。`alignment` が左上以外、または `boundsType` が `OBS_BOUNDS_NONE` 以外のときは、位置を補正せず scale だけ動かす(この決めをテストで固定し README に書く)
- AC-7 場面: `SetCurrentProgramScene` と、`backSeconds` 後に元へ戻す `SetCurrentProgramScene`(最初に `GetCurrentProgramScene` で元を覚える)。`show`/`hide` は `GetSceneItemId` → `SetSceneItemEnabled`、後で元に戻す
- AC-8 イベントの当てはめは純粋な関数 `OBSBridge.eventsFor(msg, config)` に分け、虹/金(`totalDiamonds` と `cutins` の `rainbowCoins`/`goldCoins`。`cutins` が複数あるときは `active.cutins`)、スロット、RUSH、ボス、ガチャ、見本モード(動かさない)、`enabled:false`(動かさない)を表でテストする
- AC-9 クールダウン: 同じ `on` は `cooldownSeconds` 以内に続けて動かさない。別の `on` は動かす。揺れとズームが同じソースに重ならない
- AC-10 パスワード: `location.hash` の `pw=` だけから読み、読んだら `history.replaceState` で消す。パスワードを fetch・XMLHttpRequest・ライコネの WebSocket に載せない(偽の fetch・偽の WebSocket を差して送信内容を確かめる)。schema に `password` を含む項目が無いこと、`obs-bridge.js` がパスワードをログに出さないことをテストで確かめる
- AC-11 `schema.js` の `obs` に日本語の説明がつき(パスワードを送らない理由を含む)、`config.example.yaml` に既定(`enabled: false`)が入り、強さ・秒・scale の範囲外は日本語のエラーになる(`config.test.js` の形)
- AC-12 「かんたん」に出る。呼び名は読めば分かる言い方
- AC-13 `POST /api/control {target:'obs', action:'test', data:{rule:'rainbow'}}` が接続中のウィジェットに `control` として届き(`hub.control` のテスト)、`tw obs rainbow` と MCP の `obs` が同じ POST を送る
- AC-14 今あるテストは全部そのまま通る(Windows の既知 6 件を除く)。`test/acceptance/obs.test.js` は本物の OBS・本番に触らず、一時ポートの偽サーバーだけを使う

作らないもの: OBS の録画・配信の開始/停止、ソースの作成、スクリーンショット、OBS への音の送信、複数の OBS、サーバーから OBS への直接接続、パスワードの保存、TikTok LIVE Studio での動作(対象外と help に書く)
証拠: `test/acceptance/obs.test.js`、`test/es5-public.test.js`、`test/config.test.js`、`npm test`

## 決めてほしいこと(めにくんへ)
- 揺れ・ズームの既定(1.5% / 0.8 秒、ズーム 1.08 倍)は手元の OBS で見て決める
- 金カットイン・ガチャも揺らすか(初期ルールには入れていない)
- `src/runtime.js` の `FEATURE_ORDER` に `obs` を足して、配信者ごとに管理者が「使える/使えない」を決められるようにするか(足すなら premium にするか)。この card では足さない
- 手元で試す手順(README に書く): OBS のツール → WebSocket サーバー設定で有効化しパスワードを作る → ブラウザソースに `…/widgets/obs-bridge.html#pw=<パスワード>`(幅・高さ 100)→ ダッシュボードの「OBS」で `enabled` を入れてカメラのソース名を入れる → `tw obs rainbow` で揺れる
