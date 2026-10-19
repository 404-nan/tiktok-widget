レビューは読むだけで、ファイルは書き換えていません。`npm test` は走らせていないので、テストが緑かどうかは確認していません。

1. **設定が画面に届いていません**(`public/widgets/stepup.js:9`, `:10`, `public/widgets/swarm.js:7`)。
   - `edge`・`volume`・`sound`・`step1Text`〜`step5Text`・`finalText`・`text` は、画面が読む `snapshot` にも `stepup`/`swarm` イベントにも入っていません。
   - `state.edge` と `event.volume` は常に undefined です。
   - 左側表示と音量の設定が効きません。
   - `sound: false` でも音が鳴ります。`sound` を見ているのは URL の `?sound=0` だけで、設定の `sound` を読んでいません。配信中に消せない音が出ます。
   - 文字は「STEP n」「虹確定」「群」が画面に書き込まれていて、設定で変えた文字は出ません。
   - stepup カードの「`sound`・`volume` に従う」「`edge`」と、swarm カードの `text` を満たしていません。
   - 直すなら、`StepupEngine.snapshot()`・`SwarmEngine.#send` か `runtime.js` で設定を足すか、画面が `/api/config` を読む形にします。

2. **待機中でも段の表示が出ます**(`public/widgets/stepup.html:12`, `:13`, `:18`)。
   - `.stack`(STEP 1〜5 の枠)と `.summary`(ゲージと「0 コイン」)は、`.idle`・`.step.on` のような出し分けがなく、常に表示されます。
   - OBS に置いただけで、配信画面の端に空の5段と「0 コイン」が出続けます。
   - カードの「待機のときは何も映らない」と「`end` で段の表示が静かに引く」「STEP 5 のあと段の表示も消える」に違反しています。
   - ゲージは残り時間(`endsAt`)ではなく、次の段までの進み具合です。カードは「残り時間のゲージ」です。

3. **画面がカードの演出と違います**(`public/widgets/stepup.js:8`, `swarm.js:6`)。
   - STEP 5 の「暗転→フリーズ→放射状の虹→紙吹雪」と各段の「0.3〜0.5秒の暗転+無音」がありません。
   - STEP 5 の色は金のままで、虹の背景は `.flash.final` の CSS だけです。
   - swarm の画面の揺れ、4秒でのアイコン消去、「ざわざわ→ドン」の音もありません。音は単音です。
   - 「見せられる試作」としては許せますが、カードの完成の条件とは差があります。
   - `stepup-screens.test.js` は文字の有無しか見ていません。

4. **`start` が何も始めません**(`src/stepup.js:90`, `src/runtime.js` の `performControl`)。
   - カードは「今から本物のラウンドを数え始める」ですが、実装は冷却を解くだけです。
   - `performControl` は `start`/`stop`/`reset`/`demo` 以外の action もすべて `start()` にします。誤字の action が冷却を解除します。
   - `swarm` も `reset` 以外はすべて `trigger()` で、画面に見本の群を出します。配信中の打ち間違いが、そのまま画面に出ます。

5. **README が実装に追いついていません**。
   - 一番上の README の「ファイルの地図」(`README.md:343` 付近)と `docs/knowledge/architecture.md:35` に `src/stepup.js`・`src/swarm.js` がありません。
   - `src/` に README がありません。作る決まりです。
   - 一番上の README の機能表は stepup・swarm を「作り込み中」としています。一方 `docs/IDEAS.md` は ✅ です。状態が食い違っています。
   - `swarm` の `text`(1〜2文字)は検証がなく、長い文字列も通ります(`src/schema.js`)。

秘密の漏れ、`hub.js` の変更、テスト送信による本番の集計の汚れは見つかりませんでした。配信中のテストは `testEvent` に分離され、状態を変えません。
