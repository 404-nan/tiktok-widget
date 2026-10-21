# public/widgets/

OBS や TikTok LIVE Studio のブラウザソースで開く公開ウィジェットです。外部 CDN や外部素材は使わず、公開 JavaScript は ES5 で書きます。

| ファイル | 何をするか |
| --- | --- |
| `all.html` | 主要ウィジェットをまとめて表示し、投票・応援・押しボタンも配置する |
| `boss.html` | ボスのHPと討伐演出を表示する |
| `chat.html` | コメントを表示する |
| `combo.html` | コンボ状態を送信者中心に表示し、背景透明で受信順に表示する |
| `counter.html` | いいね・視聴者数などを表示する |
| `cutin.html` | 通常カットインを表示する |
| `gacha.html` / `gacha.js` | ガチャ画面と状態表示を行う |
| `gift-alert.html` | ギフト・フォロー・シェアの通知を表示する |
| `gift-jar.html` | ギフト瓶を表示する |
| `goal.html` | 目標バーを表示する |
| `image-cutin.html` | 画像付きカットインを表示する |
| `locked.html` | 利用できない画面を表示する |
| `media.html` / `media.js` | メディア通知を再生する |
| `ranking.html` | ランキングを表示する |
| `roulette.html` / `roulette-strip.html` | 丸型・横スライドなどのルーレットを表示する |
| `rush.html` | RUSHの全画面演出を表示する |
| `slot.html` / `slot.js` | スロット演出を表示する |
| `sounds.html` / `sounds.js` | ギフトなどの効果音を再生する |
| `timer.html` | 残り時間を表示する |
| `wins.html` / `wins-fx.html` | WIN数と全画面演出を表示する |
| `dareba.html` | サーバーから受けたダレ場の事件を画面端に表示する |
| `peka.html` | サーバーが決めた時刻に告知ランプを光らせる |
| `throne.html` | 王座、接近時のVS、王冠移動を表示する |
| `ootori.html` | ラスト10分の大トリと参加者のエンドロールを表示する |
| `goal-alert.html` | Minecraftのゴール距離に応じた段階警報を表示する |
| `relay-stop` 用 `slot.html` / `slot.js` | 固定結果をギフトを送った人の順に1本ずつ止める |
| `obs-bridge.html` / `obs-bridge.js` | 透明なブラウザソースからローカルの obs-websocket へ演出命令を送る |
| `push-button.html` / `push-button.js` | 押し数と段階を表示する |
| `vote.html` / `vote.js` | コメント投票の票数・名前・結果を表示する |
| `cheer.html` / `cheer.js` | いいね応援ゲージと満タン演出を表示する |
| `stepup.html` / `stepup.js` | STEP 1〜5、残りゲージ、段階演出を表示する |
| `swarm.html` / `swarm.js` | ギフトの群と群予告を表示する |
| `visitors.html` / `visitors.js` | 初見・おかえり・常連の来場テロップを表示する |
| `img/boss-1.png` / `boss-2.png` / `boss-3.png` | ボス演出画像 |
| `lib/` | 筆、コメント、カットイン、ギフト名、オーバーレイ、ルーレット、入れ物などの共通部品 |

## つながり

設定と状態は `src/runtime.js`、`src/hub.js`、各機能のエンジンが持ち、画面は対応する API と WebSocket の通知を表示します。`server.js` がこのフォルダを公開します。ステップアップ・群予告・来場記録は `src/` から状態とイベントを受け、`combo.html` は `/api/combo` の snapshot と WebSocket の `combo` メッセージを読みます。

`obs-bridge.html` は `src/schema.js` の設定と `/ws` のイベントを使い、`lib/sha256.js` で OBS WebSocket 認証を行います。新しい公開 JavaScript は ES5、外部 CDN なしで作ります。既存ウィジェットの一覧は一番上の [`README.md`](../../README.md) を見てください。

最後に直した日: 2026-10-21
