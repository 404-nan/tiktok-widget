# public/widgets/lib/

複数の公開ウィジェットから使うブラウザ側の共通 JavaScript と CSS です。公開側は ES5、外部 CDN なしで動かします。

| ファイル | 役目 |
| --- | --- |
| `overlay.js` | WebSocket接続、設定、URLパラメータ、イベントとcompact差分の状態復元、数値表示を担当する |
| `overlay.css` | ウィジェット共通のデザイン（色・文字・チップ） |
| `fonts.css` | 和文と数字のローカルフォント定義 |
| `gift-names.js` / `gift-names-ja.js` | ギフト名データ。`gift-names-ja.js` はスクリプトが作る |
| `gift-name.js` | ES5ウィジェット用のギフト名の引き方 |
| `brush.js` | 筆でかすれた帯や木炭の線の描画 |
| `chat.js` | コメント欄の表示対象と読み上げの決まり |
| `vessels.js` | ギフト瓶の入れ物の形 |
| `sha256.js` | OBS WebSocketのパスワード認証用ES5 SHA-256 |
| `cutin.js` | カットインの動き、段階色、ルーレットの当たり、スロット大当たり |
| `cutin.css` | カットインの帯・柄・光・揺れ・金貨・電球・7・判の見た目 |
| `cutin-style.js` | 画像付きカットインの縦長フレームと切り抜き |
| `cutin-premium.js` | プレミア柄をSVGで作り、昇格を含む結果を解決する |
| `roulette.js` | ルーレット設定、待ち列、結果カード、停止時間、カットイン連携 |
| `roulette.css` | 案内チップ、待ち回数、結果カード |
| `roulette-wheel.js` | 丸型・カジノ・柔道の描画、ギリギリ演出 |
| `roulette-skins.js` | 丸型、カジノ、柔道の塗り分け |
| `roulette-strip.js` | 横スライド型ルーレット |
| `roulette-reel.js` / `roulette-reel.css` | スロット台型のリール、筐体、電球、レバー |
| `reel-plan.js` | スロット台で各リールを止める項目と3本のリーチ計画 |
| `roulette-gift.js` | ギフトを送った人の名前 |
| `slot-core.js` | スロット絵柄の対応表と開示演出の時刻表 |
| `slot-casino.css` | カジノ風スロットの見た目 |

## つながり

各ウィジェットの HTML から読み込まれ、サーバー（`server.js` / `src/`）とは WebSocket と `/api/` でつながります。`test/public-js.test.js` で、公開 JavaScript が Chromium 103 で動く書き方か(ES2022 まで)を確かめます。

最後に直した日: 2026-10-21
