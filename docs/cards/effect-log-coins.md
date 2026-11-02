# effect-log-coins: 演出の効果ログのコインが本番で全部0になるのを直す
for: 北極星
仕事の種類: 直す
見た目が変わるか: 変わる(配信の記録の「前後の倍率」に数字が出る。画面の作りは変えない)

なぜ要るか: 配信者がお金を払うのは「入れたらギフトが増えた」と自分で感じたとき(skills/docs/raikone/strategy.md)。それを見せる「前後の倍率」が、本番の記録では出たことがない。本番の報告7件のうちデモでない5件を見ると、ギフトは計447件記録されているのにコインは全部0で、配信の合計は計14,645コインある。そのため medianCoinsPerMinute は0、倍率は全部 null で、画面は全部「比較できません」になる。
前提: 原因は src/effect-log.js:62 の `finite(event.coins ?? gift.coins ?? gift.diamondCount)`。本物のギフトは src/normalize.js が `totalDiamonds` と `gift.diamonds` で作るので、どれにも当たらず0になる。test/effect-log.test.js は本物に無い `coins: 10` の形で書いているので通っていた。src/gifts.js の `eventCoinTotal` を src/history.js が配信の合計に使っている。
目的: 配信の合計と同じ数え方で効果ログのコインが記録され、配信の記録で演出の前後の倍率が見える。
触ってよい: src/effect-log.js test/effect-log.test.js test/acceptance/effect-log-coins.test.js src/README.md README.md
作らないもの: 過去の記録の書き直し、ホームへの新しい表示、倍率の計算の変更、演出名の日本語化。

## 完成の条件
- AC-1 src/normalize.js を通した本物の形のギフト(コイン付き、まとめて複数個)を EffectLog に渡すと、events.jsonl の coins が `eventCoinTotal` と同じ値になる。
- AC-2 コインの数え方を新しく書かず、src/gifts.js の `eventCoinTotal` を使う。history.js の配信の合計と同じ数字になることをテストで確かめる。
- AC-3 ギフトの前後に演出がある配信の報告で、medianCoinsPerMinute が0より大きく、倍率が数字になる。normalize を通した入力で確かめる。
- AC-4 test/effect-log.test.js の `log.gift` の入力を本物の形(`totalDiamonds`・`gift.diamonds`)に直す。`makeEffectReport` の入力は記録の行の形なので `coins` のままでよい。
- AC-5 npm test が全部通る。本番 3939 と data/ と config.yaml は触らない。一時サーバーでデモでない配信の形を作って確かめる。
- AC-6 README.md の「演出の効果ログと配信後レポート」の行と src/README.md を、実際の動きに合わせる。

## 証拠
新しいテストの結果と npm test 全体の結果。一時サーバーの報告 JSON で coins と倍率が数字になっている部分。
