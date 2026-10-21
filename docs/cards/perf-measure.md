# perf-measure: 配信のパソコンとサーバーの重さを測る道具と、上限の決め

仕事の種類: 作り込み(計測の道具)。調査は道具が出す数字でする
見た目が変わるか: 変わらない(画面には何も足さない。道具は scripts/perf/ だけ)

目的: ギフトの連打を流したときに、各ウィジェット(OBS・TikTok LIVE Studio のブラウザソース)とサーバーがどれだけ重いかを、同じやり方で何度でも測れるようにする。決めた上限を超えたら道具が「だめ」と判定する。軽量化(perf-fix.md)の前後の数字をこれで比べる。

作るもの(新しいファイルだけ。既存の src/・public/ は変えない):
- `scripts/perf/widgets.mjs` … ウィジェットの計測
- `scripts/perf/server.mjs` … サーバーの計測
- `scripts/perf/lib/` … 共通部品(Chrome の起動、CDP、表の出力、上限の読み込み)
- `scripts/perf/limits.json` … 上限(CPU・メモリ・落ちたフレーム・サーバー)
- `docs/knowledge/performance.md` … 上限と測り方(AGENTS.md の目次 docs/knowledge/README.md に1行足す)

## 測り方の決まり
- Chrome は `C:/Program Files/Google/Chrome/Application/chrome.exe`(環境変数 `PERF_CHROME` で変えられる)を `--headless=new --remote-debugging-port=<空きポート>` で起こし、CDP は既存の `ws`(node_modules にある)で叩く。puppeteer・playwright など新しい道具は入れない。終わったらサーバーと Chrome を必ず閉じる
- サーバーは自分で一時ディレクトリ(`TW_DATA`・`TW_CONFIG` を一時の場所に、`config.example.yaml` をコピー)・一時ポートで `node server.js` を起こす。`TW_ENV=dev` と、3939 以外のポートを使う(テスト送信は開発環境でだけ通る)。本番・開発サーバー(3939/3940)と LuLServer の設定・データには触らない
- 流す: `POST /api/simulate` に `{kind:'gift', ...}` を、既定は毎秒50個を60秒(`--rate` `--seconds` で変える)。ギフトは安い・普通・高額を混ぜる(Rose 1、Doughnut 30、Corgi 299、Galaxy 1000、Lion 29999)。ほかに like・chat の連打も `--kinds` で選べる。RUSH・ボス・タイマー・WIN数のように状態を持つものは、その開始操作(`/api/control`)も先に呼んで「演出が動いている間」を測る
- ウィジェットごとに1ページずつ開いて測る(rush, wins, wins-fx, boss, gift-jar, timer, gacha, chat, ranking, gift-alert, media)。ビューポートは 1920x1080。背景は透明のまま
- 測るもの(ウィジェットごと): CPU 時間(`Performance.getMetrics` の TaskDuration などを、測った秒数で割った「CPU 使用率 %」)、JS ヒープ(`Runtime.getHeapUsage` / `JSHeapUsedSize` の開始・最大・終了、強制 GC 後の値も)、DOM ノード数・イベントリスナー数(開始と終了。増え続けたら後片付け漏れ)、落ちたフレーム(ページ内で `requestAnimationFrame` の間隔を記録し、33ms 超を「落ちた」、その割合と最悪値)、`AudioContext` の数(`Page.addScriptToEvaluateOnNewDocument` で数える)
- 測るもの(サーバー): イベント処理量(1秒あたり何件さばけたか。`/api/simulate` の応答時間の p50・p95)、サーバーのメモリ(プロセスの RSS・ヒープ。開始と終了)、WebSocket で送った量(接続を3本つないで受け取ったバイト数と件数。1イベントあたりのバイト数)、`data/sessions` への書き込み回数とバイト数
- 出力: 日本語の表(標準出力)と `--json <ファイル>` の機械が読める形。表の列: 画面名、CPU %、ヒープ最大 MB、ヒープ増加 MB(GC 後)、DOM 増加、落ちたフレーム %、最悪フレーム ms、判定
- 終了コード: 上限を超えたものがあれば 1、なければ 0。`--quick`(毎秒50個を5秒など短い版)も用意し、テストで使えるようにする

## 完成の条件
- AC-1 `node scripts/perf/widgets.mjs --quick` が、上の11画面すべてについて表を出し、終了コード 0 か 1 で終わる。Chrome が見つからないときは日本語で理由を出して終了コード 2
- AC-2 `node scripts/perf/server.mjs --quick` が、イベント処理量・メモリ・WebSocket の送信量・書き込みを表で出す
- AC-3 `limits.json` に決めた上限がある(例: 1画面あたり CPU 使用率の上限、ヒープ増加の上限、落ちたフレームの割合の上限、サーバーの1イベントあたり送信バイトの上限)。値は、直す前の実測を見て「演出が正常に動く範囲の少し上」に決め、決めた理由を performance.md に書く。上限を超えた画面は表で「だめ」と出て、終了コードが 1 になる
- AC-4 上限判定の部分(数字を受けて合否を返す関数)は、Chrome なしで試せる純粋な関数にする(`scripts/perf/lib/judge.mjs`)
- AC-5 `docs/knowledge/performance.md` に、上限の表・測り方のコマンド・結果の読み方・直す前後の数字を書く。公開リポジトリなので、戦略・値段・人・お金は書かない
- AC-6 道具はこの PC(Windows)と LuLServer(Linux)のどちらでも動く。LuLServer で動かすときは `nice -n 19` を付ける、と performance.md に書く(LuLServer は本番も載っているため)

## 触ってよいもの / 触らないもの
- 触ってよい: `scripts/perf/**`、`test/acceptance/perf-*.test.js`、`docs/knowledge/performance.md`、`docs/knowledge/README.md`(1行足すだけ)
- 触らない: `src/**`、`public/**`、`server.js`(計測のための変更が要るときは perf-fix の側でやる)、`docs/cards/effect-log.md`、`public/widgets/cutin*.html`・`image-cutin.html`・`lib/cutin*`、slot、新しいウィジェット
- 作らない: 画面の追加、設定項目、新しい npm パッケージ

## 証拠(受け入れテスト。実装とは別の担当が先に書く。ES 版の node:test、test/acceptance/guard.test.js の流儀)
- `test/acceptance/perf-judge.test.js` … `judge.mjs` が、上限内の数字で「よし」、CPU・ヒープ増加・落ちたフレームのどれか1つでも超えたら「だめ」と理由つきで返す。境目(ちょうど上限)の扱いも決める
- `test/acceptance/perf-server.test.js` … `server.mjs --quick` を子プロセスで起こし、表に必要な列が出る。JSON に1イベントあたりの送信バイトが入っている。一時ディレクトリだけを使い、後片付けされる
- `test/acceptance/perf-widgets.test.js` … Chrome があるときだけ `widgets.mjs --quick --only gift-alert` を動かして JSON を確かめる(Chrome がなければ skip)
- `npm test` が緑(Windows の既知6件以外)

## 下書き
ない(実装は始めていない)。
