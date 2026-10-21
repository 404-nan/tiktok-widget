# scripts/perf/lib/

性能計測スクリプトの共通部品です。

| ファイル | 役目 |
| --- | --- |
| `chrome.mjs` | Chrome/Chromium を環境に応じて探し、CDP で計測する。 |
| `process.mjs` | 一時サーバーとプロセスを管理する。 |
| `judge.mjs` | 計測結果を上限と照合する。 |
| `args.mjs` | 計測コマンドの引数を読む。 |
| `output.mjs` | 表と JSON を出力する。 |
