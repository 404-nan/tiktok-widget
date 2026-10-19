# test/

サーバー・公開ウィジェット・受け入れ条件の自動テストです。

| ファイル | 役目 |
| --- | --- |
| `acceptance/obs.test.js` | 偽obs-websocketを使ったOBS連携の受け入れテスト |
| `es5-public.test.js` | 公開JavaScriptのES5検査 |

全体は `npm.cmd test`、OBS連携だけは `node --test test/acceptance/obs.test.js` で実行します。
