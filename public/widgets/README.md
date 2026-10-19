# public/widgets/

スロットの `slot.html` / `slot.js` は、サーバーで固定した結果をギフトを送った人の順に1本ずつ止め、`/api/relay-stop` と WebSocket でリレー状態を表示します。

OBSやTikTok LIVE Studioのブラウザソースで開く公開ウィジェットです。公開JavaScriptはES5、外部CDNや外部素材は使いません。

| ファイル | 何をするか |
| --- | --- |
| `peka.html` | サーバーが決めた時刻に隅のランプを一度だけ光らせ、送った人を表示する |
| `*.html` | ギフト通知、コメント、ゲーム、集計など各ウィジェットの画面 |
| `lib/` | 複数のウィジェットで使う表示部品 |

設定と状態はサーバー側の `src/peka.js` が持ち、画面は `/api/peka` とWebSocketの通知を表示します。
