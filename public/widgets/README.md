# public/widgets/

OBS / TikTok LIVE Studio のブラウザソースへ表示する公開ウィジェットです。外部 CDN を使わず、公開 JavaScript は ES5 で書きます。

| ファイル | 役目 |
| --- | --- |
| `push-button.html` | 押しボタンの透明な待機・受付中・結果画面の外枠 |
| `push-button.js` | サーバーの状態を受け、押し数と段階を描画する ES5 スクリプト |
| `all.html` | 複数ウィジェットをまとめて表示し、押しボタンも配置する |

`push-button.html` は `/api/push-button` と `/ws` の状態を `push-button.js` で読みます。
