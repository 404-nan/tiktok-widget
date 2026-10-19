# public/widgets/

OBS / TikTok LIVE Studio のブラウザソースへ表示する公開ウィジェットです。外部 CDN を使わず、公開 JavaScript は ES5 で書きます。

| ファイル | 役目 |
| --- | --- |
| `push-button.html` | 押しボタンの透明な待機・受付中・結果画面の外枠 |
| `push-button.js` | サーバーの状態を受け、押し数と段階を描画する ES5 スクリプト |
| `vote.html` | コメント投票の受付中・締め切り・結果画面の外枠 |
| `vote.js` | 投票の状態を受け、票数・名前・結果を描画する ES5 スクリプト |
| `cheer.html` | いいね応援ゲージの日本語画面（空・途中・満タン） |
| `cheer.js` | 応援ゲージの状態を受け、ES5で描画と満タン演出を行う |
| `all.html` | 複数ウィジェットをまとめて表示し、投票・応援・押しボタンも配置する |

`push-button.html` は `/api/push-button` と `/ws` の状態を `push-button.js` で読みます。
`vote.html` は `/api/vote` と `/ws` の状態を `vote.js` で読みます。
`cheer.html` は `/api/cheer` と `/ws` の状態を `cheer.js` で読みます。
