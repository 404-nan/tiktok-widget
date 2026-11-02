# レビュー: gacha-viewers-demo 

【直す】`snapshot().total` が保存済みの `demo_` の人も数えている(`src/gacha-viewers.js` の `total: Object.keys(this.store.all()).length`)。AC-4 は一覧から `demo_` を除くが、人数は除いていない。保存に 22人いてそのうち 9人が `demo_` なら、画面の `public/dashboard/gacha-viewers-form.js:92` で、一覧が 50人未満でも `total`(22)が `viewers.length`(13)より大きくなる。「全部で 22 人」の表示が出て、デモ込みの人数が見えてしまう。カードの目的「人数が信じられない」は直っていない。AC-4 のテストは `viewers` の中身しか見ていないので、この `total` は見逃している。
【軽い】`test: true` と `demo_` の判定が `src/visitors.js:12` と同じ式の写しになった。ただしこの写しは `src/gacha-viewers.js:11` と `:391` に 2か所あり、`:391` の `startsWith('demo_')` は別書きになっている。今は同じ結果なので壊れてはいない。
テストは、カードの受け入れテスト(5件)と `test/gacha-viewers.test.js`(14件)を実行して全部通った。ほかは問題なしだった:
- AC-1〜3 は満たしている。
- 前からあるテストは変えていない。
- 本番の入口(`runtime.js` の `hub.on('event')`)から呼ばれる。
- 画面を変える差分はない。
