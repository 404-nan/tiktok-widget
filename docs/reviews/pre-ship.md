重い順に5つです。

1. **`src/hub.js:133-136`、`server.js:437`、`public/widgets/lib/overlay.js:276`:新しいサーバーと古いウィジェットの組み合わせで画面が壊れます。**
   - `ws.compact = true` は全接続に付きます。そのため `event` から `state` が消えます。カードAC-5は「`event`・`state`・`status` の形を減らして壊さない」と求めています。
   - OBS のブラウザソースは古い `overlay.js` を持ったままです。サーバーを再起動すると、古い画面が新しいサーバーに再接続し、`handlers.event(e, undefined)` になります。ランキングや合計が空になるか、例外で止まります。
   - 対策は2つのどちらかです。(a) クライアントが送る `?compact=1` などで、新しい画面だけ差分にします。(b) 当面は `state` も残します。
   - 経路を整理しておくと次のとおりです。
     - 接続口は `ws` の upgrade だけです。
     - 差分を読めるのは `overlay.js` だけです。
     - `media.js`・`gacha.js`・`slot.js`・`sounds.js` は `.state` を読んでいません。

2. **`src/hub.js:133`:クライアントごとに `JSON.stringify` し直しています。**
   - 全員が compact でも、先頭の `text`(全体)を無駄に作ります。差分も接続数ぶん作り直します。
   - カードの「不要な `JSON.stringify` の繰り返しをやめる」に反します。
   - 差分の文字列はループの外で1回だけ作ってください。
   - `statePatch` の中で `rows.map` と `rows.filter` が毎イベント走ります。

3. **`README.md:10` と `docs/knowledge/performance.md:67-88`:perf-fix が「できた」と書かれていますが、カードを満たしていません。**
   - AC-2 は、直す対象が上限内になるか、30% 以上減ることを求めています。
     - rush・wins-fx・gift-jar・timer はまだ「だめ」です。
     - rush は落ちたフレームが 58% → 78% に悪化しました。
     - ranking・boss・gacha・media・gift-alert は CPU が増えています。
   - AC-6 の処理時間(p95)は 3.14ms → 3.50ms で、performance.md 自身が「未達」と書いています。
   - AC-3(DOM・ヒープ・AudioContext が元に戻る)は測っていません。
   - AC-4(見た目の撮影比較)の証拠もありません。
   - README の状態は「作りかけ」にしてください。

4. **`docs/knowledge/performance.md` の数字が合っていません。**
   - 「直す前」が表ごとに違います。
     - WebSocket は 12,195.96 と 12,195.90 です。
     - p95 は 3.67 と 3.14 です。
     - RSS は 9.97 と 11.21 です。
   - 69-73 行の表には「取得中」が残っています。
   - 11画面の表は quick(5秒)1回の測定です。CPU の増減は誤差の可能性が高く、「直した」とも「悪化した」とも判断できません。

5. **テストが足りません。**
   - `test/acceptance/perf-cleanup.test.js` は次の問題があります。
     - Chrome の既定パスが Windows 固定で、Linux では skip されます。
     - 見ているのは gift-alert 1画面の終了コードだけで、DOM 数や AudioContext 数は見ていません。
   - `mergeStatePatch` には、クライアント側のテストがありません。
     - 順序の入れ替わりを確認していません。
     - 圏外から入ってきた行を確認していません。
     - `hello` の前に `event` が届いた場合(`previous` が null)は、行が落ちます。
   - `perf-history.test.js` は `fs.writeFileSync` を全体で差し替えるので、並列で動く他のテストに影響します。

読んだのは差分、カード、performance.md、テストまでです。`npm test` と計測は実行していません。
