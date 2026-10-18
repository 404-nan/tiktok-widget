# scripts/perf/lib/

性能計測の二つのコマンドから使う、小さく分けた共通部品です。

| ファイル | 役目 |
| --- | --- |
| `args.mjs` | `--quick`、`--json`、負荷条件を読む |
| `chrome.mjs` | Chrome headlessを起動し、既存の `ws` でCDPを呼ぶ |
| `process.mjs` | 一時サーバー、空きポート、プロセスメモリ、後片付けを扱う |
| `judge.mjs` | 数字と上限を比べて合否と理由を返す純粋な関数 |
| `output.mjs` | 日本語表とJSONを書き出す |

## つながり

`widgets.mjs` と `server.mjs` から使われます。Chromeが無くても `judge.mjs` 単体は動きます。
