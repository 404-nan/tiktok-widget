# レビュー: combo 

進捗: 差分とカードの照合、`npm test` の実行(320件すべて緑)まで終えました。結果を報告します。`artifacts/shots/` はありません。
**カードを満たしていない・壊している箇所**
1. **AI 経由の combo が動きません(AC-9)。**
   - `src/ai-api.js` で `TOOLS.combo` は足されていますが、`AI_ROUTES` に `{ method: 'POST', path: '/combo', tool: 'combo' }` がありません。
   - `operate()` は、`timer` / `wins` / `boss` / `spin_roulette` 以外をすべて rush として扱います。
   - 具体的には 596〜627 行目あたりで、`status` は `runtime.readRush()` を返し、`reset` / `test` は `performControl('rush', action, {})` を呼びます。
   - そのため、`mcp/ai-mcp.js` の `combo` ツールで `reset` や `test` を呼ぶと RUSH が始まります。`status` は RUSH の状態が返ります。
   - 配信中の本番での `test` 禁止も、この経路では combo として効きません。
   - この経路を確かめるテストがありません。
2. **コンボのギフト名がカードと違います(AC-5)。** `src/combo.js` の 'hit' は `gift: e.gift?.name ?? giftDisplayName(e.gift)` です。カードは `giftDisplayName(e.gift)` と書いています。`name` が先に使われるので、日本語名への変換が効きません。
**カードに無い変更・違い**
- 配線テストの場所が違います。カードは `test/combo-wiring.test.js` ですが、実際は `test/acceptance/combo-wiring.test.js` です。
- `src/config.js` の `normalize` に combo 専用の分岐を足しています。AC-2 の検証に必要なので、この点は妥当です。
**本番で起きそうな問題**
- `ComboEngine.test()` の `setTimeout`(最大20個)を記録していません。`reset()` / `close()` / `setConfig({enabled:false})` で止まらず、止めた後やテナント破棄後も約8秒間テスト用の状態へ数え続けます。タイマーが残るので、プロセス終了やテストの終了も遅れます。
- `performControl('combo','test')` の `data.user` を検査していません。GET `/api/combo/test?user=abc` のように文字列が来ると `slimUser` が `{id:undefined}` になり、キーが `'?'` になります。
**テストが弱い箇所**
- AI の route / ツールの経路(上の1)に、combo のテストが一つもありません。
- 上のタイマー残りを確かめるテストがありません。
