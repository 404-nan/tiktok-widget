# 性能計測

性能計測は、配信中のサーバーやLuLServerへ接続せず、このPC上の一時サーバーとChrome headlessだけで行います。計測用サーバーは `TW_ENV=dev`、一時ポート、一時の `TW_CONFIG`・`TW_DATA` で起動し、終了時に消します。

## 上限

| 対象 | 上限 | 判定 |
| --- | ---: | --- |
| ウィジェット CPU | 30 % | 画面ごとの計測時間に対するTaskDuration |
| ウィジェット ヒープ増加 | 20 MB | 強制GC後の開始との差 |
| ウィジェット 落ちたフレーム | 5 % | `requestAnimationFrame` の間隔が33msを超えた割合 |
| サーバー イベント処理 p95 | 250 ms | `/api/simulate` の応答時間 |
| サーバー WebSocket送信 | 20,000 bytes / イベント | 接続3本の受信量をイベント数で割る |
| サーバー メモリ増加 | 100 MB | 開始RSSと終了RSSの差 |

上限は「通常の演出を測るときに余裕を残しつつ、明らかな重さを見逃さない」ための初期値です。画面の演出を変えたら、まず実測値と上限の差を確認してから見直します。上限以下は「よし」、超えた項目が1つでもあれば「だめ」です。

## 実行

```bash
node scripts/perf/widgets.mjs --quick
node scripts/perf/server.mjs --quick
node scripts/perf/widgets.mjs --quick --only gift-alert --json perf-widgets.json
```

Chromeの場所は既定で `C:/Program Files/Google/Chrome/Application/chrome.exe` です。別の場所なら `PERF_CHROME` で指定できます。`--quick` は毎秒50イベントを最大5秒に短縮します。通常計測では `--rate`、`--seconds`、`--kinds gift,like,chat` を指定できます。

LuLServer（Linux）で実行するときは、サーバー計測のコマンドに `nice -n 19` を付けます。

```bash
nice -n 19 node scripts/perf/server.mjs --quick
```

## 結果の読み方

ウィジェットは画面名、CPU、ヒープ最大値、GC後のヒープ増加、DOM増加、落ちたフレーム、最悪フレーム、判定を出します。サーバーはイベント処理量、p50/p95、RSS、WebSocket送信量、`data/sessions` の書き込みを出します。終了コードは、上限超過がなければ0、超過があれば1、Chromeが見つからなければ2です。

## 実測値

計測道具を実装した後、このPCで `--quick` を実行した値です。現在の実装を軽量化する前の基準値として `perf-fix` で使います。Chrome headlessでは画面の合成や長いフレーム間隔も観測されるため、同じ条件で比較します。

| 画面 | CPU % | ヒープ増加 MB | 落ちたフレーム % | 判定 |
| --- | ---: | ---: | ---: | --- |
| rush | 34.64 | -0.65 | 58.33 | だめ |
| wins | 14.86 | 0.92 | 35.83 | だめ |
| wins-fx | 6.35 | -0.26 | 13.88 | だめ |
| boss | 17.36 | -0.50 | 3.57 | よし |
| gift-jar | 12.38 | 0.45 | 79.55 | だめ |
| timer | 23.83 | 0.05 | 3.23 | よし |
| gacha | 2.96 | -0.32 | 0.00 | よし |
| chat | 3.26 | -0.61 | 0.00 | よし |
| ranking | 19.32 | 0.02 | 0.00 | よし |
| gift-alert | 5.20 | -0.58 | 0.94 | よし |
| media | 2.80 | -0.30 | 0.00 | よし |

このカードは計測道具を新規に作る作業なので、実装前の比較値は「道具が無く測定不能」です。上表が実装後の基準値です。軽量化カードで同じコマンドを再実行し、画面ごとに比較します。

同じ `--quick` のサーバー計測は、250イベント、44.08イベント/秒、p50 1.92ms、p95 3.67ms、RSS 106.30MB → 116.27MB、WebSocket 12,195.96 bytes/イベント、セッション書き込み1回・2,597 bytesでした。実装前はこの計測道具が無く比較値を測れません。
