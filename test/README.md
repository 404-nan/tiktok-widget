# test/

本番に近い入力と公開画面のつなぎ方を確認するテストです。

| ファイル | 役目 |
| --- | --- |
| `acceptance/combo.test.js` | コンボエンジンの回数・段階・終了・テスト分離を確認する |
| `acceptance/combo-wiring.test.js` | 設定・Runtime・管理操作の配線を確認する |
| `acceptance/combo-pre-ship.test.js` | `combo.html` の実スクリプトを簡易ブラウザで動かし、レビュー指摘を確認する |

テストは `npm.cmd test` で実行します。
