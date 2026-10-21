# レビュー: combo 2巡目

**カードを満たしていない箇所**
- `src/combo.js` の 'hit' の `gift` が `e.gift?.name ?? giftDisplayName(e.gift)` です。カードは `giftDisplayName(e.gift)` です。`name` が先に使われるので、日本語名への変換が効きません。1巡目レビューで指摘済みですが直っていません。
- `test/combo-wiring.test.js` というファイルがありません。配線テストは `test/acceptance/combo-wiring.test.js` にあります。
**カードに無い変更・既存機能への影響**
- `src/runtime.js` の `readRush()` を書き換えています。`rushIdle` というキャッシュを足し、待機中は古い snapshot を返します。カードにありません。
  - AC-14 のテストが `now` を含む `JSON.stringify` で比べるため、それを通す目的に見えます。
  - 待機中の RUSH を AI から読むと、`now` が古い値のままになります。
  - `last` 以外の項目が変わっても更新されません。
  - AI の RUSH `status` の挙動が変わるので、本体のコードをテストに合わせて変えたことになります。
**本番で起きそうな問題**
- `performControl('combo','test')` が `data.user` を検査していません。`GET /api/combo/test?user=abc` のように文字列が来ると、`slimUser` が `{id:undefined}` を返します。送った人の区別キーが `'?'` になり、名前もなくなります。
**テストが弱い箇所**
- AC-14 のテストが RUSH 不変を `JSON.stringify(readRush())` の一致で見ています。上の `readRush` のキャッシュがあるので、この比較は本物の RUSH を見ていません。キャッシュが無ければ `now` の差で落ちます。
- gift 名が `giftDisplayName` を通ることを確かめるテストがありません。
`npm test` は 324 件すべて通りました。`artifacts/shots/` はありません。
