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
