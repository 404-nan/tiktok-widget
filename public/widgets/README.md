# public/widgets/

OBS や TikTok LIVE Studio のブラウザソースで開く公開ウィジェット。配信者ごとの設定は `/api/config`、演出は WebSocket から受け取る。

| ファイル | 何をするか |
| --- | --- |
| `visitors.html` | 初見・おかえり・常連のテロップの面と動きを定義する |
| `visitors.js` | 来場通知を受け、設定に応じて順番に表示する ES5 スクリプト |

## つながり

- 使うもの: `../runtime.js` の `/api/config`・`/ws`
- 使われるところ: `src/schema.js` の `page: visitors` とダッシュボードの URL 一覧
- 新しい公開 JavaScript は ES5、外部 CDN なしで書く
