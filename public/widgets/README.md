# public/widgets/

スロットの `slot.html` / `slot.js` は、サーバーで固定した結果をギフトを送った人の順に1本ずつ止め、`/api/relay-stop` と WebSocket でリレー状態を表示します。

OBSやTikTok LIVE Studioのブラウザソースで開く公開ウィジェットです。公開JavaScriptはES5、外部CDNや外部素材は使いません。

| ファイル | 何をするか |
| --- | --- |
| `dareba.html` | サーバーから受けたダレ場の事件を画面端に短く表示する |
| `peka.html` | サーバーが決めた時刻に隅のランプを一度だけ光らせ、送った人を表示する |
| `throne.html` | サーバーが決めた王座、接近時のVS、王冠移動を表示する。JavaScriptはES5で外部素材を使わない |
| `ootori.html` | ラスト10分の席、大トリ、参加者のエンドロールを表示する。名前は文字列として表示し、WebAudioだけで音を鳴らす |
| `goal-alert.html` | Minecraftのゴール距離をサーバーから受け、50m・20m・5mの警報と最終防衛ラインを表示する |
| `*.html` | ギフト通知、コメント、ゲーム、集計など各ウィジェットの画面 |
| `lib/` | 複数のウィジェットで使う表示部品 |

## つながり

設定と状態はサーバー側の `src/peka.js` / `src/throne.js` / `src/ootori.js` / `src/dareba.js` / `src/mc-goal-alert.js` が持ち、画面は対応するAPIとWebSocketの通知を表示します。
OBSや配信画面に入れる公開ウィジェットです。今回のOBS連携は透明なブラウザソースからローカルのobs-websocketへ命令します。

| ファイル | 役目 |
| --- | --- |
| `obs-bridge.html` | 何も描かないOBS用ブラウザソース |
| `obs-bridge.js` | ライコネのイベントをOBSの演出へ変換 |
| `lib/sha256.js` | OBS WebSocket認証用のES5 SHA-256 |

設定は `src/schema.js`、受信イベントはサーバーの `/ws` から使います。
