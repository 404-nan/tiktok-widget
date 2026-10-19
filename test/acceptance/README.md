# test/acceptance/

カードの完成条件を、既存テストとは別に確認する受け入れテストです。

| ファイル | 役目 |
| --- | --- |
| `perf-hub.test.js` | WebSocket の状態契約、差分配信、本番集計への非混入を確認する |
| `perf-history.test.js` | 連打時の履歴保存回数と保存 JSON の形を確認する |
| `perf-cleanup.test.js` | Chrome がある環境で性能計測を起動し、ウィジェット側の後片付け条件を確認する |

`npm test` から実行され、`src/hub.js`・`src/history.js`・`scripts/perf/`を対象にします。
