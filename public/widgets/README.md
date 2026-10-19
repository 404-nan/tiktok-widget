# public/widgets/

OBSや配信画面に入れる公開ウィジェットです。今回のOBS連携は透明なブラウザソースからローカルのobs-websocketへ命令します。

| ファイル | 役目 |
| --- | --- |
| `obs-bridge.html` | 何も描かないOBS用ブラウザソース |
| `obs-bridge.js` | ライコネのイベントをOBSの演出へ変換 |
| `lib/sha256.js` | OBS WebSocket認証用のES5 SHA-256 |

設定は `src/schema.js`、受信イベントはサーバーの `/ws` から使います。
