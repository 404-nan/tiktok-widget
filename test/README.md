# test/

Node標準のテストです。実データを使わず、一時ファイルやメモリ上のイベントで確かめます。

| ファイル | 何をするか |
| --- | --- |
| `acceptance/cutin-premium.test.js` | カットインのプレミア演出カードの受け入れ条件を確かめる |
| `es5-public.test.js` | 公開ウィジェットのJavaScriptがES5か確かめる |
| `cutin-style.test.js` | カットインの既存設定と写真の切り抜きを確かめる |
| `acceptance/` | 受け入れ条件のテストをまとめる |

## つながり

- `npm test` が `node --test` でこのフォルダを実行する。
- 受け入れテストは `src/` と `public/` の利用者から見える結果を確認する。
