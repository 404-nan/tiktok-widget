1. **`server.js:70` が古いままで、機能が動いていない（重い）。** `/healthz` は今も `{ ok: true }` だけを返します。新しい `src/healthz.js` の `healthz()` は、テストの中でしか呼ばれていません。
   - 本番に出しても `live` は返りません。テストは通るので、これに気づきにくいです。
   - 直し方は、`server.js` で `healthz` を import して、`app.get('/healthz', healthz({ local, tenants }))` に差し替えることです。
   - `local` は HOSTED のとき `null` ですが、`liveCount` は `null` を扱えます。`tenants` は `server.js:46` の後で作られるので、ルートの定義位置に注意してください。

2. **カードがありません。** `docs/cards/` には `effect-log.md` と `tw-guard.md` だけで、healthz-live のカードがありません。このため、満たしているかを照らして確かめられませんでした。カードを足すか、カードなしでよいという判断を記録してください。

3. **README が合っていません。** `README.md` の機能一覧に `/healthz` の `live` がありません。ファイルの地図(331行目あたり)にも `src/healthz.js` がありません。`src/` にはフォルダの README もありません。AGENTS.md の決まりでは、コードを変えたら同じ変更の中で README を直します。
   - `docs/knowledge/environments.md:21` に書いたのは「配信中の禁止事項」の節で、内容は仕様の説明です。置き場所が合っていません。

4. **配信者の数が公開されます(確認が必要)。** `/healthz` は認証なしで、Cloudflare からも呼ばれます(`cloudflare/worker.js:117`)。名前は漏れませんが、ほかの配信者の同時配信数が誰にでも見えます。意図どおりか確認してください。

5. **テスト送信が `live` に混ざらないか、テストで確かめていません。** `isLive` は `hub.status.mode` を見ます。デモの `demo` モードは数えない作りなので、今のコードでは大丈夫そうです。ただ、`demo` や `idle` が数に入らないことを確かめるテストがありません。`demo` の確認を足してください。

テスト自体は1件、通りました。
レビューの途中経過です。diff と関連コードは読み終えました。重い順に5つ挙げます。

1. **`public/dashboard/editor.js:742`: 「くわしく」表示の全タブで説明文が変わります。**
   - 以前は `simple() ? INFO[tab].desc : def.desc` でした。今は `INFO[tab]?.desc ?? def.desc` なので、くわしく表示でも INFO の簡易文が使われます。
   - ルーレット以外のウィジェットの説明も、くわしく表示で黙って変わります。カードが変えてよいとしているのは URL の一覧と「OBS に入れる URL」の出し方だけです。
   - ルーレットの説明(ROULETTE_DESCRIPTION)も、ルーレット設定タブ全体に出ます。
   - 直し方は `simple() ? INFO[tab].desc : def.desc` に戻すことです。ルーレットの1行説明は、「OBS に入れる URL」の側で出す形にします。

2. **`README.md:13`: コードと合っていません。**
   - ルーレットの推奨サイズが「丸 600 × 680 / 横 820 × 330」のままです。コードは丸型と横型が両方あると 820×680 を返します(`src/config.js:742`)。
   - 「ルーレットごとの URL を出す」という旧い説明も残っています。ダッシュボードの項(`README.md:55`、`README.md:195`)にも「1本になった」「ids は畳んだ」を反映する必要があります。
   - README の最終更新は 10/13 で、この変更では README が1行も直されていません。AGENTS.md の「README が合っていない変更は終わっていない」に反します。

3. **`public/dashboard/roulette-urls.js`: フォルダ README に載っていません。**
   - 新ファイルですが、`public/dashboard/README.md` がなく、新設もされていません。
   - ファイル頭のコメントは1行だけです。「どこから使われるか」(editor.js、simple.js)がありません。
   - `simple.js` が `roulette-urls.js` を import するようになりました。説明文1つのために、簡易表示の側がフォームを作るモジュールに依存します。置き場所を `simple.js` に戻すか、定数だけ別に置く方が筋です。

4. **`public/dashboard/editor.js:835`: くわしく表示で折りたたみの置き場所がないときは、折りたたみの外に出ます。**
   - `rest` が空だと `rouletteUrlsTarget` が `null` のまま `$('previewCol')` に落ちます。折りたたみの外に出るので、AC-7・AC-8(必ず折りたたみの中に1組)に反します。
   - 今のスキーマでは `rest` が空にならないようです。ただしテストは「置き場所なし」を許容する形(AC-7 の2つ目のテスト)になっており、実際には守っていません。
   - `others` 側のように `tab === 'roulettes'` なら必ず折りたたみを作る方が安全です。

5. **`docs/cards/roulette-one-url.md`: カードが指す証拠と実際が違います。**
   - カードのテストは `test/roulette-one-url.test.js` と書かれていますが、実際は `test/acceptance/roulette-one-url*.test.js` の3本です。
   - 「撮影(1280・390)」の証拠がありません。
   - 「めにくんに決めてほしいこと」(既存の配信者への告知)が未決のまま残っています。

**本番で困る所:**
- 動きが変わる所は1番だけです。
- データ破壊・秘密漏れ・テスト送信が本番の数を汚す所は見つかりませんでした。
- 旧 `?ids=` の URL はそのまま動きます(`roulette.html` と `lib/roulette*.js` は無変更)。

**確認していないこと:**
- テストは走らせていません。読むだけの指示だったため、コードを読んで判断しました。
- 画面での確認もしていません。
**問題あり(重い順)**

1. **デモ・ダッシュボードのテスト送信が、受け口のいいねを止める**: `src/ingest.js:40-48`
   - hub の `event` を見て、`source` が `ingest` でないものを全部「直接の TikTok」として扱っている。
   - デモや `simulateEvent` のイベントも `source` が無いので、直接の接続に数えられる。
   - その場合、デモやテストを押してから20秒間は、外部ツールから来た `like` が `duplicate` として捨てられる(`:124`)。
   - カードの AC-8 は「直接の接続」だけを対象にしている。
   - 直し方: `test` つきと demo_ ユーザーを除くか、`tiktok` 由来のイベントだけに `source` を付けて数える。
   - 該当を確かめるテストはまだ無い。

2. **不正な鍵の連打に歯止めがない**: `src/tenants.js:151-173`、`server.js:363-370`
   - 鍵の照合は、リクエスト1回ごとに全配信者へ `statSync` をする。
   - レート制限(`limited()`)は鍵が合ってから効く。だから違う鍵を大量に送られると、配信者の数だけシステムコールが走り、配信中のサーバーが重くなる。
   - AC-24 は「ファイルの読み直しを減らす」ところまでで、この点は触れていない。
   - 直し方: IP ごとの簡単な上限を付ける。または、鍵の要約を Map に持って O(1) で引く。

3. **eventId を、実際に流す前に「見た」と記録する**: `src/ingest.js:121,155-162`
   - `seenEvent` は記録だけして、その後に `like` の重複判定(`:124-125`)で捨てることがある。
   - 同じ eventId を再送しても、2回目は重複として捨てられる。
   - `test=true` で試した eventId を、本番でそのまま使うと同じ目に遭う。
   - 直し方: 捨てなかったものだけを記録する。

4. **テスト送信の扱いが、配信状態に依存する**: `src/ingest.js:126-127`、`src/hub.js:90-94`
   - `test:true` を隠す動作は `status.mode === 'live'`(直接接続中)のときだけ。
   - 外部ツールだけで配信していて、直接の接続が `idle` のときは、テスト送信が集計に入って `testDirty` が立つ。
   - カードは「今の動きに任せる」としているので仕様どおり。ただし、README や使い方画面には書かれていない。
   - 直し方: `/help/#ingest` に「外部ツールだけの配信では、テスト送信も数に入る」と一言足す。

5. **README に載っていない挙動が2つある**
   - 鍵が URL(`GET /in/<鍵>`)に入る。Cloudflare やプロキシのログに鍵が残りうる。`/help` と README に注意書きが無い。
   - 止められた配信者でも、有効な鍵で `/in/<鍵>` を叩くと 403 が返る(`server.js:366`)。AC-4 のとおりだが、README の説明は 404 だけに見える。

**カード**: AC-1〜24 は、コードとテストの範囲では満たしていそうだ。

**確認していないこと**: テストの実行(`npm test`)はしていない。`docs/cards/ingest-euler-ws.md` は調査カードで、`src/euler-ws.js` は diff に無い。
重い順に5つです。

1. **リレー停止が1回で止まります(`src/relay-stop.js` の `#finish`、`src/runtime.js:140`)。**
   - `#finish` は待機列が空だと状態を `done` のままにします。`idle` には戻りません。
   - 試しに動かしたところ、3人で止めたあと4人目は「リール番号は0から2で指定してください」になりました。
   - しかも `onEvent` がエラーの `{ok:false}` を返すので、`runtime.js:140` の `if (!relay) slot.onEvent(e)` で既存スロットまで止まります。`relayStop` を有効にしている配信では、2回目以降のギフトでスロットが一切回りません(再起動まで)。

2. **大トリが本物のギフトを拾いません(`src/runtime.js:136-143`)。**
   - `ootori.onEvent` がどこにもつながっていません。つながっているのはテスト用の `testEvent` だけです。
   - 本番では参加者も席も増えません。カードの中心機能が動かないのに、README は「できた」です。

3. **ゴール接近警報は2か所で動きません(README は「できた」)。**
   - `src/mc-goal-alert.js:126` は `distance === 0` のときだけゴール扱いにします。RCON の座標は小数なので、ほぼ永久に WIN が入りません。
   - `src/minecraft.js` の `#sendGoalAlert` は `bossbar set tw:goal_alert …` を送ります。ただし `bossbar add` はどこにもなく、ゲーム内の警報が出ません。
   - `setConfig` は設定を保存するたびに `goalHandled` を戻します。ゴール上に立ったままだと、保存のたびに WIN が再加算されるおそれがあります(未検証)。

4. **名入り妨害の後片付けが不完全です(`src/minecraft-name.js:49` 付近、`src/minecraft.js` の `#triggerNamedSabotage`)。**
   - 大サイズは `schedule function tw:named_sabotage_expire_…` を送ります。この function は存在せず、エラーになります。
   - 片付けは `setTimeout` だけで行っています。サーバーを再起動するとタイマーが消えて、羊とボスバーが残ります。
   - `eventIds` と `expired` は増える一方です。

5. **README とコードが合っていない所があります。**
   - README の「できた(開発確認まで)」は、1〜3 を考えると言い過ぎです。
   - 具体的には、リレー停止の「再接続にも対応」、ゴール警報、大トリの3つです。
   - また `runtime.js:150` のコマンド分岐の `dareba.stop() ? snapshot : snapshot` は両方同じ値で、意味のない三項演算子です。

秘密の漏れは見つかりませんでした。テスト送信は、`hub.js` の規則どおり配信中は本番の数に入りません。つなぐ前の分も、つながった時点で 0 に戻ります。名入り妨害も `e.test` を除外しています。

テストは走らせていません。1 は小さなスクリプトで再現しました。2〜4 はコードを読んで確かめた範囲です。
**重い順に5つ**

1. **本物のOBSでは動かない可能性が高い** `public/widgets/obs-bridge.js:15,16,12`
   - `SetSceneItemTransform`(15行、12行の復元)に `sceneName` を付けていません。
   - 場面が空のときは、`GetSceneItemId`/`GetSceneItemTransform`(16行)に `sceneName: undefined` を送ります。
   - obs-websocket v5 では、これらの命令に `sceneName` か `sceneUuid` が必須です。
   - 既定の `scene:''` は「今の場面」のはずですが、`GetCurrentProgramScene` で場面名を取っていません。
   - 偽サーバー(`obs.test.js:76-79`)はこの項目を検査しないので、テストは通ります。
   - 本番では、揺れ・ズーム・show/hide が全部、静かに何も起きません。
   - 直し方は、場面名を必ず解決して全命令に付けること。偽サーバー側にも必須チェックを足すこと。

2. **一度切れると再接続で認証に失敗し続ける** `obs-bridge.js:13`
   - パスワードは `connect()` のたびに `location.hash` から読み直しています。
   - 最初の Hello で `replaceState` が `#` を消すので、OBS を再起動した後などの2回目以降は、パスワード空で認証失敗になります。
   - 配信中にOBSが落ちて戻ると、そこから二度と動きません。
   - 直し方は、パスワードを最初に変数へ保持して、消すのはその後にすること。
   - もう一つの問題として、OBS が起動していないと Hello まで進まず、`#pw=` が画面共有に写ったまま残ります。

3. **設定変更や再有効化で壊れる** `obs-bridge.js:21,25`
   - `config` メッセージで `opts.config` を `msg.config.obs` に丸ごと置き換えています。
   - `hello` のときに足した `cutins`/`active` が消えて、虹・金の閾値が既定の 20000/5000 に戻ります。
   - ダッシュボードで設定を触っただけで判定が狂います。
   - 最初が `enabled:false` だと、`hello` で client を作りません。後から入れても、ページを読み込み直すまで動きません。
   - 一度切ってまた入れても、`connect()` は再実行されません。

4. **動きが重なると、カメラが元に戻らない** `obs-bridge.js:16,20`
   - `original` と `active` は共有です。別の `on`(例: 虹の直後にRUSH開始)が重なると、後の動きは揺れている最中の値を「元」として保存します。
   - 先の動きの `active=false` で、後の動きも止まります。
   - 結果として、カメラが少しずれたままになります。クールダウンは同じ `on` にしか効きません。
   - 動作中は新しい動きを受けないか、最初に保存した値を保ち続ける必要があります。

5. **カードとの差、コードの整理** (重さは軽い)
   - 重複と一行詰め込み
     - `eventsFor`(5行と6行)と `animate`(17行と18行)が二重定義です。後の方だけが効き、前のものは死んだコードです。
     - 6行目の `root.constructor.constructor('return Array')()` は異様です。`eval` 相当の書き方なので外してください。
   - カードにあるのに無いもの
     - `src/obs.js`
     - `public/help/` の使い方(`index.html` に obs の記述は元からあるが、このカードの内容は無い)
     - `hub.control` のテスト(AC-13)
   - `public/dashboard/simple.js` の `GROUPS` に、「豪華な演出」の見出しが重複して追加されています。画面に同じ見出しが2つ並びます。

**README とコードの食い違い**
- README の「作り込み済み」は言い過ぎです。上の1・2が直るまでは実機で動いていません。

テスト送信は `hub.control` で届くだけで、本番の数には触れていません。パスワードがサーバーへ出る経路も見つかりませんでした(schema・admin・WebSocket)。
レビュー結果です(読むだけ、変更なし)。`npm test` は走らせていません。

1. **`src/push-button.js:55`**: 段階の境目(steps)が古いまま使われます。`#newState` が最初の1回だけ `steps` を写し、`start` では更新しません(l.31)。`#makeResult` は古い `state.steps` で段階を決め、画面に出す `#public` は `state.config.steps`(開始時の設定)を使います。
   - 例: `steps` を [3,10,30,100] から [1,2,3,4] に編集してから `start` すると、画面は新しい境目を表示するのに、結果は古い境目で判定されます。段階と動作(赤でルーレットなど)が表示とずれます。
   - `start` で `state.steps = entry.steps` を入れ直してください。

2. **`public/dashboard/editor.js:15`**: `TABS` に `votes` と `pushButtons` は足してあるのに、`cheers` がありません。
   - 応援ゲージの設定タブと、試すボタン(いいね ×20 など、l.2170 付近)に届きません。
   - カード AC-12(editor.js の試すボタン)を満たしていません。`TABS` に `'cheers'` を足してください。

3. **`src/cheer.js:48`**: `add` が負の値を捨てています(`Math.max(0, …)`)。
   - AC-6 は「負で引ける、0 未満にはならない」です。今は引けません。
   - `test/acceptance/cheer.test.js:88` は `value` が 0 のときに -999 を足して 0 を確かめているだけです。そのため、引けなくても通ります。
   - 直す際は `#add` で `value = Math.max(0, value + count)` にし、テストは 50 を足してから -20 を引く形にしてください。

4. **README とコードのずれ(AGENTS.md の決まり違反)**:
   - `public/widgets/README.md` と `src/README.md` に `vote.html` / `vote.js` / `src/vote.js` がありません。`src/` 側の表には、`runtime.js` が投票を起動する説明もありません。
   - 上の `README.md` の「public/widgets」の地図には押しボタンだけが書かれ、投票と応援が抜けています。
   - `docs/knowledge/operating.md` に `tw push` の説明がありません(vote と cheer はあります)。

5. **`src/vote.js:30`**: `setEnabled(false)` が、`#resetOne(id, false)` と `states.clear()` で通知なしに状態を消します。
   - 配信中に管理者が投票を止めると、OBS の画面には受付中の表示が残り、`snapshot()` は空になります。`GET /api/vote` を叩き直すまで直りません。
   - 通知ありで消す(`#resetOne(id, true)`)ほうが安全です。

秘密の漏れと、テスト送信が本番の数を汚す問題は見つかりませんでした。`hub.js:89` が配信中の `test: true` を `event` にしません。投票者の ID も `snapshot()` や配信メッセージに入っていません。
