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
OBS や TikTok LIVE Studio のブラウザソースで開く公開ウィジェット。配信者ごとの設定は `/api/config`、演出は WebSocket から受け取る。

| ファイル | 何をするか |
| --- | --- |
| `visitors.html` | 初見・おかえり・常連のテロップの面と動きを定義する |
| `visitors.js` | 来場通知を受け、設定に応じて順番に表示する ES5 スクリプト |

## つながり

- 使うもの: `../runtime.js` の `/api/config`・`/ws`
- 使われるところ: `src/schema.js` の `page: visitors` とダッシュボードの URL 一覧
- 新しい公開 JavaScript は ES5、外部 CDN なしで書く
OBS・TikTok LIVE Studio に置く公開ウィジェット本体と、その画面だけが使うローカル部品です。公開ページの JavaScript は ES5 とし、画面に出す文は日本語にします。

## ファイルの地図

| ファイル | 役目 |
| --- | --- |
| `all.html` | 主要ウィジェットをまとめて表示する |
| `boss.html` | ボスの HP と討伐演出を表示する |
| `chat.html` | コメントを表示する |
| `combo.html` | サーバーのコンボ状態を送信者中心に表示し、背景は透明、イベントは受信順に表示する |
| `counter.html` | いいね・視聴者数などを表示する |
| `cutin.html` | 通常カットインを表示する |
| `gacha.html` | ガチャ演出を表示する |
| `gacha.js` | ガチャ画面の公開用補助処理 |
| `gift-alert.html` | ギフト・フォローなどの通知を表示する |
| `gift-jar.html` | ギフト瓶を表示する |
| `goal.html` | 目標バーを表示する |
| `image-cutin.html` | 画像付きカットインを表示する |
| `locked.html` | 利用できないウィジェットの空画面 |
| `media.html` | メディア通知を再生する |
| `media.js` | メディア通知の公開用補助処理 |
| `ranking.html` | ランキングを表示する |
| `roulette.html` | ルーレットを表示する |
| `roulette-strip.html` | 横スライド式ルーレットを表示する |
| `rush.html` | RUSH の全画面演出を表示する |
| `slot.html` | スロット演出を表示する |
| `slot.js` | スロット画面の公開用補助処理 |
| `sounds.html` | ギフトなどの効果音を再生する |
| `sounds.js` | 効果音画面の公開用補助処理 |
| `timer.html` | 残り時間を表示する |
| `wins.html` | WIN 数を表示する |
| `wins-fx.html` | WIN 数の全画面演出を表示する |
| `img/boss-1.png` | ボス演出画像 1 |
| `img/boss-2.png` | ボス演出画像 2 |
| `img/boss-3.png` | ボス演出画像 3 |
| `lib/brush.js` | 筆の描画部品 |
| `lib/chat.js` | コメント表示部品 |
| `lib/cutin.css` | カットインの CSS |
| `lib/cutin.js` | カットインの描画部品 |
| `lib/cutin-style.js` | カットインのスタイル部品 |
| `lib/fonts.css` | ローカルフォントの CSS |
| `lib/gift-name.js` | ギフト名表示部品 |
| `lib/gift-names.js` | ギフト名データ |
| `lib/gift-names-ja.js` | 日本語ギフト名データ |
| `lib/overlay.css` | ウィジェット共通 CSS |
| `lib/overlay.js` | ウィジェット共通 JavaScript |
| `lib/roulette.css` | ルーレット共通 CSS |
| `lib/roulette-gift.js` | ギフト連動ルーレット部品 |
| `lib/roulette-strip.js` | 横スライドルーレット部品 |
| `lib/roulette-wheel.js` | 丸型ルーレット部品 |
| `lib/roulette.js` | ルーレット共通処理 |
| `lib/vessels.js` | 入れ物の描画部品 |

`lib/` の既存部品は combo では変更しません。

## つながり

- サーバー側の状態は `../src/runtime.js` と `../src/hub.js` が `/api/*` と WebSocket で配る。
- 設定とウィジェット URL は `../src/schema.js` と `../src/config.js` が決める。
- `combo.html` は `/api/combo` の初期 snapshot と WebSocket の `combo` メッセージを読む。
OBS や TikTok LIVE Studio に読み込ませる公開ウィジェットです。カットインはサーバーのイベントと設定を受け、画面側では抽選をやり直しません。

| ファイル | 何をするか |
| --- | --- |
| `cutin.html` | 通常カットインを読み込む入口 |
| `image-cutin.html` | 写真付きカットインを読み込む入口 |
| `lib/cutin.js` | 帯・文字・写真・音・プレミア柄・昇格結果の演出を動かす |
| `lib/cutin.css` | カットインの帯、柄、光、揺れの見た目を定義する |
| `lib/cutin-premium.js` | ES5でプレミア柄をSVGとして作り、結果を解決する |
| `lib/brush.js` | 筆の帯や木炭の線をSVGデータとして作る |
| `lib/cutin-style.js` | 写真付き縦長フレームの見た目と切り抜きを扱う |

## つながり

- `cutin.html` と `image-cutin.html` が `lib/cutin-premium.js` と `lib/cutin.js` を読む。
- `lib/cutin.js` が WebSocket の `event.cutinDraw` と設定を使い、`lib/brush.js` と `lib/cutin-premium.js` で帯を描く。昇格時は下の段階を表示してから同じ抽選結果で上の段階を再描画する。
- `lib/cutin-style.js` の縦長フレームは上下の縞を、写真帯は上下の縁をプレミア柄の対象にする。
- 公開JavaScriptはES5、外部CDNなしで動かす。
