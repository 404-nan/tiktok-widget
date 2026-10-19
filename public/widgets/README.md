# public/widgets/

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
