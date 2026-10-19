# public/widgets/

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
