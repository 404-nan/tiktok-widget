# public/widgets/lib

ウィジェット（`public/widgets/*.html`）が共通で使う JavaScript と CSS。
各ウィジェットの HTML から読み込まれ、サーバー（`server.js` / `src/`）とは WebSocket と `/api/` だけでつながる。
ES5 で書くもの（LIVE Studio の古い Chromium 向け）は `test/es5-public.test.js` で確かめている。

## 共通

| ファイル | 役目 |
| --- | --- |
| `overlay.js` | 設定の読み込み、サーバーとの接続、URL パラメータ、数値の表示、ギフト画像など |
| `overlay.css` | ウィジェット共通のデザイン（色・文字・チップ） |
| `fonts.css` | 和文と数字の書体（node_modules から配信） |
| `gift-names.js` / `gift-names-ja.js` | ギフトの日本語名（`gift-names-ja.js` はスクリプトが作る。手で直さない） |
| `gift-name.js` | ギフト名の引き方（ES5 のウィジェット用） |
| `brush.js` | 筆でかすれた帯の画像（カットイン・RUSH） |
| `chat.js` | コメント欄の決まりごと（どのコメントを出すか等）。テストからも使う |
| `vessels.js` | ギフト瓶の入れ物の形 |

## カットイン

| ファイル | 役目 |
| --- | --- |
| `cutin.js` | カットインの動き。ギフトの段階の色、ルーレットのチャンス・大写し・確定演出、ルーレットの形ごとの当たり（大当たり / ジャックポット / ビッグボーナス / 一本）、スロットの大当たり |
| `cutin.css` | カットインの見た目（帯・文字・集中線・フリーズ・大写し・金貨・電球の縁・7・判） |
| `cutin-style.js` | 画像付きカットインの縦長フレームと切り抜き（ES5） |

## ルーレット（`roulette.html`）

| ファイル | 役目 |
| --- | --- |
| `roulette.js` | 設定の読み込み、待ち列、結果カード、止まる時間の定数（`CHANCE_MS`）。カットインの大写しも `prepareRoulette` を使う |
| `roulette.css` | 案内チップ、待ち回数、結果カード |
| `roulette-wheel.js` | 丸型の描画と回し方（wheel / casino / judo）。ギリギリ演出の動き（`creepRotation`）はカットインの大写しと共通 |
| `roulette-skins.js` | 丸型の塗り分け。wheel いつもの形 / casino 金の縁・電球・赤と黒の盤 / judo 畳・畳縁・黒帯 |
| `roulette-strip.js` | 横スライド型（strip） |
| `roulette-reel.js` / `roulette-reel.css` | スロット台型（slot）。赤い筐体、電球の看板、縦に回るリール、レバー |
| `roulette-gift.js` | 「◯◯さんのギフトで回転中」の名前 |

## スロット（`slot.html`）

| ファイル | 役目 |
| --- | --- |
| `slot-core.js` | 絵柄の対応表と、開示演出の時刻表（ES5。`src/slot.js` と同じ数字） |
| `slot-casino.css` | カジノの見た目（`slots.look: casino` のときだけ効く）。和パチスロの見た目は `slot.html` の中 |
