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
