# live-no-widget: 配信中なのに配信ソフトにライコネが入っていないとき、ホームで教える
for: 北極星
仕事の種類: 直す
見た目が変わるか: 変わる

なぜ要るか: 10/26〜11/1 の配信3回のうち、終わった2回(合計約4時間)は配信ソフトの接続が0だった(docs の northstar-zero-connection 調査。わざと使わなかったのか、入れ忘れか、つながらなかったのかは不明)。どの場合でも、今の画面は「配信中」としか出さないので、配信者は気づけない。

前提: `hub.hasClient('obs')` で配信ソフトの接続が分かる(見本は preview 役なので数えない)。`/api/status` はこの値を返していない。ダッシュボードは /api/status を5秒ごとに読む(public/dashboard/app.js)。ホームは editor.js の renderHome。「入れ方を見る」は `goTo('obs')` がすでにある。
目的: 配信を始めたのに画面が出ていない配信者が、配信中に気づいて自分で直せる。
触ってよい: src/runtime.js、public/dashboard/ 以下、public/dashboard/README.md、test/acceptance/live-no-widget.test.js、README.md。public/widgets は触らない(別のカード preview-live-not-obs が直している)。
作らないもの: 通知の音、DM、配信をまたいだ「閉じた」記憶、管理画面の表示。

## 完成の条件
- AC-1 `/api/status` の返事に `widgetConnected`(真偽値。`hub.hasClient('obs')`)が増える。
- AC-2 mode が live になってから続けて60秒たっても `widgetConnected` が false なら、ホームの一番上に次の文を出す。「配信画面にライコネが出ていません」「配信ソフトに URL を入れると出ます。わざと使っていないなら、閉じてかまいません」。ボタンは「入れ方を見る」(`goTo('obs')`)と「閉じる」。
- AC-3 60秒より前、mode が live 以外(demo・idle・ended)、`widgetConnected` が true のときは出さない。出ているときにつながったら、次の読み取り(5秒以内)で消える。
- AC-4 「閉じる」を押すと、その配信のあいだは出ない。次の配信ではまた出る。覚えるのはそのブラウザの中だけでよい。
- AC-5 見本(preview=1・preview=live)を開いているだけでは `widgetConnected` は true にならない。実サーバーで確かめる。
- AC-6 test/acceptance/live-no-widget.test.js で AC-1〜5 を確かめる。既存の npm test も全部通る。本番 3939 は触らない。
- AC-7 文言は `docs/words.md` と kind-ui に合わせ、配信者を責める言い方にしない。色や部品は今のダッシュボードにあるものを使い、新しい飾りを足さない。
- AC-8 README.md の機能の一覧と public/dashboard/README.md を直す。

## 証拠
新しいテストの結果と npm test 全体の結果。開発サーバーで、文が出ている状態のホームの写真1枚(幅 390 と 1280)。
