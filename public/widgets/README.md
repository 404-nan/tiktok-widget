# public/widgets/

OBS や TikTok LIVE Studio に読み込ませる公開ウィジェットです。カットインはサーバーのイベントと設定を受け、画面側では抽選をやり直しません。

| ファイル | 何をするか |
| --- | --- |
| `cutin.html` | 通常カットインを読み込む入口 |
| `image-cutin.html` | 写真付きカットインを読み込む入口 |
| `lib/cutin.js` | 帯・文字・写真・音・結果の演出を動かす |
| `lib/cutin.css` | カットインの帯、柄、光、揺れの見た目を定義する |
| `lib/cutin-premium.js` | ES5でプレミア柄をSVGとして作り、結果を解決する |
| `lib/brush.js` | 筆の帯や木炭の線をSVGデータとして作る |
| `lib/cutin-style.js` | 写真付き縦長フレームの見た目と切り抜きを扱う |

## つながり

- `cutin.html` と `image-cutin.html` が `lib/cutin-premium.js` と `lib/cutin.js` を読む。
- `lib/cutin.js` が WebSocket の `event.cutinDraw` と設定を使い、`lib/brush.js` と `lib/cutin-premium.js` で帯を描く。
- 公開JavaScriptはES5、外部CDNなしで動かす。
