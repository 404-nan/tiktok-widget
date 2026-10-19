重い順に5つです。

1. **`src/visitors.js:96,152`: 設定が効かず、常にデフォルトで動く。**
   - 実際の `hub.config.visitors` は `{ 名前: {設定} }` の形です。`publicConfig` が map として扱っているのと、`public/widgets/visitors.js:32` が `maps` として読んでいるのが根拠です。
   - サーバー側は `this.config.regularVisits` と `this.config.keepDays` をそのまま読んでいて、これは `undefined` になります。
   - 結果、`regularVisits` と `keepDays` は画面で変えても無視され、常連は常に3回、保存は常に90日になります。
   - `keepDays` を短くしても記録は消えません。個人情報の保存期間の約束が守られません。
   - `test/acceptance/visitors.test.js:32` が `{ visitors: 平らな設定 }` で作っているので、テストは通ってしまいます。
   - カードの「複数あるときはいちばん短い日数」も未実装です。
   - テストを本物の形に直して、最小の `keepDays` を使う必要があります。

2. **`src/visitors.js:46-50`: 設定を保存するたびに、まだ書いていない記録が消える。**
   - `config` イベントのたびに `loadFromDisk()` が走り、メモリの `people` をディスクの内容で上書きします。
   - 配信中に設定を触ると、最大5秒分の来場が失われます。
   - `streamPeople` には残っているので、その人はその配信ではもう数え直されません。回数が1つ少ないままになります。
   - 読み込みは初回だけにするか、`dirty` のときは先に `flush` してください。

3. **`src/visitors.js:62`: つなぐ前のテスト送信で「おかえり」などが出ない。**
   - `handleEvent` は `live` 以外を捨てます。
   - つなぐ前に送ったテストは `hub.js` が `event` として出すので、ここで弾かれます。
   - 弾かれると `broadcast` に届きません。
   - カード AC-11 の「配信前の `event` の `test:true` も配る」を満たしていません。
   - 本番の数を汚さない面は安全です。ただし配信前に「試す」ボタンを押しても何も映りません。

4. **`src/visitors.js:36-45`: サーバーを再起動すると、同じ配信で二重に数える。**
   - 配信中に再起動すると `stream` と `streamPeople` が空になります。
   - 同じ配信の続きでも、`stream` が変わるので全員の `visits` が +1 されます。
   - 配信中の再起動は本番で起こり得ます。
   - 配信の印を保存するか、`last` が同じ日なら +1 しないなどで抑える必要があります。

5. **`docs/cards/info-feed.md` の「触らないファイル」に反している箇所がある。**
   - info-feed カードは `src/demo.js`・`mcp/*`・`bin/tw.js` を触らないと書いています。
   - 実際は visitors カードのためにこれらが変わっています。カード側が許可しているので、問題があるのは info-feed 側の記述だけです。
   - `README.md`・`src/README.md`・`test/README.md` に `member` と `visits` が書かれているかは、最後まで確認できていません。

未確認:
- `src/ai-api.js` の `test_event` の種類一覧に `member` が必要かどうか。
- ウィジェット側の見た目。
- テストは実行していません。
