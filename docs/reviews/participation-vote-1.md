レビュー結果(`npm test` は 296 件すべて通過)。直すべき点が6つあります。

**カードを満たしていない**
1. `test/es5-public.test.js:10-18` の `files` に `public/widgets/vote.js` がありません。カードと AC-11 は「ES5 として解析」と求めています。代わりの `test/acceptance/vote-public.test.js:12` は正規表現で見るだけで、解析していません。
2. `public/widgets/vote.js` に効果音がありません。`sound` と `volume` の設定は schema にありますが、コードは読んでいません。カードの「WebAudio で合成」「溜めで音が落ちる」「ドン」を満たしていません。
3. `public/widgets/vote.js:106-111` の結果演出が足りません。
   - 溜めの間は行を暗くするだけで、バーを止めていません。
   - 「票が入った行が一瞬明るくなる」がありません。
   - 票0のときに「0票」とだけ出す処理がありません。`state` は「結果発表」のままです。
   - `showNames` の名前は「順に出して消す」はずが、静的な文字列を出すだけです。
4. `src/runtime.js:299-316` の GET/POST `/api/vote/:id/:action` で、`active` が空になる(設定がない)と `ids` が空になり、`for` が何もせず、不明な action でも `ok: true` を返します。AC-8 の「不明な action は日本語のエラー」を満たしません。`performControl`(`src/runtime.js:694-711`)も同じです。

**本番・運用で困る**
5. `public/dashboard/editor.js` の「N に1票(テスト)」ボタンは、どれも `user: 'テスト参加者'` で送ります。`src/demo.js:26` で ID が `demo_テスト参加者` に固定されるので、1人1票の判定で最初の1票しか数えません。残りのボタンはなにも起きません。ボタンごとに別名にするか、`user` を変える必要があります。
6. `src/vote.js:72-73` で、`seconds` の上限(3600)を `start` の上書きに適用していません。`seconds=1e7` などを渡すと `setTimeout` が溢れて、即座に締まります。
   - `public/widgets/vote.js:106-110` の `revealTimer` は、`idle` 以外の `render` で消されません。溜めの1秒以内に `start` が来ると、開いたばかりの画面が「結果」に変わります。

**カードにない変更・決まり違反**
- カードにない変更は見当たりません。
- ES5、日本語、CDN なしは守れています。
- ユーザー ID を `snapshot()`、WebSocket、API の応答に出していません。ファイルにも書いていません(コードを読んだ範囲。AC-7 のテストは走らせていません)。
- OBS の鍵は `GET /api/vote` だけ通ります(`OBS_ALLOWED`)。
- 配信中のテスト送信は `hub.js` が止めるので、本番の数を汚しません。

撮影(AC-11 の画面)が済んだかは、リポジトリから確認できませんでした。
