# prep-tested-mark: 「ためしに動かす」を押したのに、準備カードが「まだ」のままになるのを直す
for: 北極星
仕事の種類: 直す
見た目が変わるか: 変わる(準備カードの「ためしに動かす」が「済み」になる。カードの作りは変えない)

なぜ要るか: 配信者が最初に開くホームの一番上のカードで、押したのに「まだ」のままだと、壊れているのか自分の操作が悪いのか分からず、初配信の前で止まる。本番の準備の記録3件すべてで testedAt が空で、そのうち2件はデモ配信が4〜5回あるのに空だった(ops の docs/research/real-records-audit-2026-11-02.md)。
前提: 読み取りでの見立てで、再現はまだ。ボタンは /api/demo を呼び(public/dashboard/app.js:59)、デモは mode: 'demo' で test: true のイベントを流す(src/demo.js:92-110)。testEvent は mode === 'live' のときだけ出る(src/hub.js:108-118)。testedAt を付けるのは hub.on('testEvent') だけ(src/runtime.js:150)。画面の代わりの判定 store.get('sample-tried') は見本のスイッチでだけ付く(public/dashboard/editor.js:695,861)。見立てが違えば、AC-1 の再現テストで分かるので、原因に合わせて直す。
目的: 配信前のデモを動かしたら、そのテナントの準備カードの「ためしに動かす」が「済み」になる。
触ってよい: src/runtime.js src/hub.js src/demo.js src/preparation.js public/dashboard/app.js public/dashboard/editor.js test/* src/README.md public/dashboard/README.md README.md artifacts/shots/*
触らない: 本番 3939、data/、config.yaml
作らないもの: 準備カードの見た目の変更、過去のデモ配信から testedAt を埋めること、ガチャの記録の直し(別カード)。

## 完成の条件
- AC-1 再現テストを先に書く: 本番と同じ入力(/api/demo、mode: 'demo')でデモを動かすと、そのテナントの preparation.json の testedAt に時刻が入る。直す前は落ちる。
- AC-2 配信中のテスト送信でも、今までどおり testedAt が入る。一度入った testedAt の時刻は、次のデモで変わらないか、今の配信中のテスト送信と同じ扱いにする。
- AC-3 デモを動かしても、testEvent を受けて動くほかの処理(配信中のテスト送信のときだけ動くもの)は動かない。配信の統計にデモの数字は入らない。
- AC-4 一時サーバーか dev.lul.works で、準備カードが出る新しいテナントを作り、本物のブラウザで「ためしに動かす」を押すと、ホームの「ためしに動かす」が「済み」になる。押した後のホームを 390px と 1280px で撮り、artifacts/shots/prep-tested-mark-390.png と -1280.png に置いてコミットする。
- AC-5 npm test が全部通る。README の配信の準備の行を実際の動きに合わせる。

## 証拠
再現テストの結果、npm test 全体の結果、AC-4 の写真2枚。
