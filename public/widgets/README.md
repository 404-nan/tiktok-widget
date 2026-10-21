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
OBS / TikTok LIVE Studio に表示する公開ウィジェットを置くフォルダです。画面の状態はサーバーの API と WebSocket から受け取り、公開側の JavaScript は ES5 で書きます。

| ファイル | 役目 |
| --- | --- |
| `stepup.html` | STEP 1〜5 の段、残りゲージ、段階演出を表示する画面 |
| `stepup.js` | `/api/stepup` と `/ws` からステップアップを受け取って描画する処理 |
| `swarm.html` | ギフトの群と「群」の全画面表示 |
| `swarm.js` | `/api/swarm` と `/ws` から群イベントを受け取って描画する処理 |
| `all.html` | 全ウィジェットをまとめる画面 |
| `boss.html` | ボス討伐表示 |
| `chat.html` | コメント表示 |
| `counter.html` | いいね・視聴者数表示 |
| `cutin.html` | カットイン表示 |
| `gacha.html` / `gacha.js` | ガチャ画面と状態表示 |
| `gift-alert.html` | ギフト通知 |
| `gift-jar.html` | ギフト瓶 |
| `goal.html` | 目標表示 |
| `image-cutin.html` | 画像カットイン |
| `locked.html` | 利用できない画面 |
| `media.html` / `media.js` | メディア通知 |
| `ranking.html` | ランキング表示 |
| `roulette.html` / `roulette-strip.html` | ルーレット表示 |
| `rush.html` | RUSH 表示 |
| `slot.html` / `slot.js` | スロット表示 |
| `sounds.html` / `sounds.js` | ギフト音表示 |
| `timer.html` | 延長タイマー表示 |
| `wins.html` / `wins-fx.html` | WIN 数と全画面演出 |
| `img/boss-1.png` / `img/boss-2.png` / `img/boss-3.png` | ボス画像 |
| `lib/brush.js` | 筆の描画 |
| `lib/chat.js` | コメント表示部品 |
| `lib/cutin.css` / `lib/cutin.js` / `lib/cutin-style.js` | カットイン部品 |
| `lib/fonts.css` | ローカルフォント定義 |
| `lib/gift-name.js` / `lib/gift-names.js` / `lib/gift-names-ja.js` | ギフト名表示部品 |
| `lib/overlay.css` / `lib/overlay.js` | 共通オーバーレイ部品 |
| `lib/roulette.css` / `lib/roulette.js` / `lib/roulette-gift.js` / `lib/roulette-strip.js` / `lib/roulette-wheel.js` | ルーレット部品 |
| `lib/vessels.js` | ギフト瓶の器 |

`server.js` がこのフォルダを公開し、`src/runtime.js` のステップアップ・群エンジンが状態とイベントを配ります。既存ウィジェットの一覧は一番上の [`README.md`](../../README.md) を見てください。
