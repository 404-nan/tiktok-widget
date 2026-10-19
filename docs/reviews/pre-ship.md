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
