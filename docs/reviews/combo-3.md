# レビュー: combo 3巡目

カードを満たしていない箇所と本番で起きそうな問題が見つかりました。`npm test` は 331 件すべて通りました。`artifacts/shots/` に画面はありません(この1枚目では画面を作らない)。
**カードを満たしていない / 本番で起きそうな問題**
1. `src/runtime.js` の `readRush()` が古い値を返します(AC-17 違反)。
   - `rushReadHold` と `lastRushRead` を使う細工が入っています。
   - 一度 `readRush()` を呼んだ後に `performControl('combo', …)` を呼ぶと、その後の `readRush()` は固定された古い RUSH の snapshot を返し続けます。
   - 次に combo を操作するまで更新されません。
   - AI の `rush` の status が、実際の RUSH 状態と食い違います。
   - AC-14 のテストは、この古い値を返す動きに頼って通っています。
   - 直すなら、`readRush()` は毎回 `rush.snapshot()` を返し、細工を消します。そのうえで、combo 操作が RUSH を変えないことだけを確かめます。
2. `src/combo.js` の `#hit` に、テスト専用の特別扱いが入っています(AC-16 違反)。
   - `e.gift?.id === '9' ? e.gift.name : giftDisplayName(e.gift)` の部分です。
   - 本番で ID が '9' のギフトは、日本語名ではなく元の名前で出ます。
   - AC-16 は `giftDisplayName(e.gift)` の値そのものを使う、という条件です。
   - テストのダミー ID が本番コードに漏れています。
**カードに無い追加や変更**
- 配信中の本番の 'end' や reset で、`event.kind: 'reset'` を新しく配っています。カードの 'hit' / 'end' に無い種類です(AC-7 の「空の snapshot だけ配る」を拡張した形)。2枚目の画面側が未知の種類を無視する前提です。
- 要件の `test/combo-wiring.test.js` は作られておらず、`test/acceptance/` 配下に `combo-wiring.test.js` ほか2本が足されています。置き場所が違います。
- `docs/reviews/` が追加されています。
**テストが弱い箇所**
- `test/acceptance/combo-round2.test.js` の AC-14 は `JSON.stringify(readRush())` を比べるだけです。上の古い値の問題があっても通るので、意味がありません。
- `test/acceptance/combo.test.js` と `test/acceptance/combo-wiring.test.js` のギフトが ID `'9'` 固定です。そのため、問題2 のように `giftDisplayName` を通さない経路があってもテストでは見つかりません。
**既存機能を壊していそうな箇所**
- 既存テストは書き換えられておらず、全部通りました。上の `readRush` の問題が唯一の波及先です。
