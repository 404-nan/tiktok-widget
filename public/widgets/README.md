# public/widgets/

スロットの `slot.html` / `slot.js` は、サーバーで固定した結果をギフトを送った人の順に1本ずつ止め、`/api/relay-stop` と WebSocket でリレー状態を表示します。

OBSやTikTok LIVE Studioのブラウザソースで開く公開ウィジェットです。公開JavaScriptはES5、外部CDNや外部素材は使いません。

| ファイル | 何をするか |
| --- | --- |
| `peka.html` | サーバーが決めた時刻に隅のランプを一度だけ光らせ、送った人を表示する |
| `throne.html` | サーバーが決めた王座、接近時のVS、王冠移動を表示する。JavaScriptはES5で外部素材を使わない |
| `ootori.html` | ラスト10分の席、大トリ、参加者のエンドロールを表示する。名前は文字列として表示し、WebAudioだけで音を鳴らす |
| `*.html` | ギフト通知、コメント、ゲーム、集計など各ウィジェットの画面 |
| `lib/` | 複数のウィジェットで使う表示部品 |

設定と状態はサーバー側の `src/peka.js` / `src/throne.js` / `src/ootori.js` が持ち、画面は対応するAPIとWebSocketの通知を表示します。
