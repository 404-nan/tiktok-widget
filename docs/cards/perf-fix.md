# perf-fix: 計測で見つかった重いところを、迫力を削らずに直す

仕事の種類: 作り込み(最適化)。先に perf-measure.md の道具を作り、直す前の数字を取ってから始める
見た目が変わるか: 変わらない(見た目・音・タイミングは今のまま。変わって見えたら失敗)

前提: perf-measure の道具(scripts/perf/)ができていること。直す前の数字を `docs/knowledge/performance.md` に「直す前」として残す。

めにくんの原則: 重さは、演出を削ることでなく別の方法で解決する。次のような方法を使う。
- 描画の工夫: 画面外・透明になった要素や canvas は描かない、毎フレームの DOM 書き換えと再計算をまとめる(読むと書くを分ける)、`transform` と `opacity` だけで動かす、大きな `filter`・影を毎フレーム変えない、粒子は上限つきで使い回す(オブジェクトプール)、`requestAnimationFrame` は演出が動いていないとき止める
- 後片付け: 使い終わった要素、タイマー、イベントリスナー、`AudioContext` のノード(oscillator・gain は鳴り終わったら切る)、画像、canvas を残さない。ギフトを連打しても DOM とヒープが増え続けないこと
- 送る量を減らす: WebSocket の 1 イベントに毎回付いている状態の全体(`state` のランキングなど)を、変わったときだけ・差分だけにする。ただしウィジェットが読み込み直しで続きから出せること(hello で全体を送る)は変えない
- サーバー: ギフト1件ごとのランキング再計算(全ユーザーを並べ替え)を軽くする、履歴の書き込みを1回の保存にまとめる(`history.js` の保存は 15 秒ごとに全体を書く)、不要な `JSON.stringify` の繰り返しをやめる

## 直してよいファイル
- 画面: `public/widgets/` の rush.html、wins.html、wins-fx.html、boss.html、gift-jar.html、timer.html、gacha.html(+gacha.js)、chat.html(+lib/chat.js)、ranking.html、gift-alert.html、media.html(+media.js)、共通の `lib/overlay.js`・`lib/vessels.js`・`lib/brush.js`
- サーバー: `src/hub.js`、`src/runtime.js`、`src/history.js`、`server.js` の WebSocket まわり、`src/wins.js`・`src/timer.js`・`src/boss.js`・`src/rush.js`・`src/gacha.js`・`src/media-alerts.js` のうち測って重かったもの
- 共有ファイル(hub.js、runtime.js、server.js)は最小の変更にし、既存行の並べ替えや書式直しをしない
- 触らない: `public/widgets/cutin.html`・`image-cutin.html`・`lib/cutin*.js/css`(別の担当)、slot 一式(確認待ち)、新しく作られるウィジェット、`docs/cards/effect-log.md` と effect-log の部分、本番・開発サーバー
- 公開 JS は ES5(`test/es5-public.test.js` が見ている)、CDN なし、日本語。新しい npm パッケージを入れない

## 完成の条件
- AC-1 直す前の数字(11画面 + サーバー、毎秒50個×60秒)を `docs/knowledge/performance.md` に表で残す。重い順に上位を「直す対象」として決める(CPU・ヒープ増加・落ちたフレーム・送信バイトのどれかが上限を超えたものは必ず対象)
- AC-2 直した後に、同じ条件で再計測し、直す前と並べた表を performance.md に載せる。直す対象は、上限内になるか、直す前より CPU・ヒープ増加・送信バイトが目に見えて(目安 30% 以上)減る
- AC-3 ギフトを連打し終えたあと、各ウィジェットの DOM ノード数・ヒープ(GC 後)・AudioContext の数が開始時に近い値に戻る(増え続けない)
- AC-4 見た目と音は変わらない。演出の長さ・段階・色・音の鳴らし方は今のまま(ウィジェットの撮影を直す前後で撮り、比べる。画像は `C:/Users/user/lulwork/perf-shots/` に置き、コミットしない。撮影用ポートは 4108)
- AC-5 WebSocket の `hello` で状態の全体が届き、OBS の読み込み直しで続きから出る(`test/hub.test.js` ほか既存テストが緑のまま)。送る量を減らす変更をしても、既存のウィジェットが読む `event`・`state`・`status` の形は互換にする(足すのはよいが、減らして壊さない)
- AC-6 サーバーの 1 イベントあたりの WebSocket 送信バイトと、ギフト1件あたりの処理時間が、直す前より減る(数字を performance.md に)
- AC-7 `npm test` が緑(Windows の既知6件以外)

## 作らないもの
演出を減らす・短くする変更、粒子の数やアニメーションの削減(迫力に関わるので、減らす必要が出たら理由とともに報告に書いてめにくんに聞く)、新しい設定項目、新しい画面

## 証拠(受け入れテスト。実装とは別の担当が先に書く)
- `test/acceptance/perf-hub.test.js` … Hub に連打(例 5000 件)を入れ、(a) 全接続に届くメッセージの形が互換、(b) 1イベントあたりの送信バイトが直す前の基準より減る、(c) `hello` に状態全体がある、(d) テスト送信は本番の数を汚さない(既存の決まり)
- `test/acceptance/perf-history.test.js` … 連打しても `History` の書き込みが回数・バイトとも上限内、保存された JSON が今までと同じ形
- `test/acceptance/perf-cleanup.test.js` … Chrome があるときだけ。連打後の DOM 増加・AudioContext 数が上限内(なければ skip)
- 既存のテストを書き換えて緑にしない

## 分け方
1枚目 perf-measure(道具と上限)→ 2枚目 perf-fix。2枚目は 1枚目ができてから(直す前の数字が要る)。サーバー側とウィジェット側は別々に直せるので、2枚目の中で「サーバー」「ウィジェット」の2つに分けて回してもよい。

## 下書き
ない(実装は始めていない)。
