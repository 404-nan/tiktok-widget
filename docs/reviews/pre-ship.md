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
