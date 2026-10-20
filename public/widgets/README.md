# public/widgets — 配信画面に重ねるウィジェット

OBS / TikTok LIVE Studio の「ブラウザ」ソースで開くページです。サーバー（`src/runtime.js`）から `/ws` の WebSocket と `/api/*` で状態を受け取り、表示だけをします。抽選や数の計算はサーバーでします。

決まり: ここの JavaScript は ES5。外部 CDN は使わない（`test/es5-public.test.js` が確かめます）。

| ファイル | 役目 | 使う API・設定 |
| --- | --- | --- |
| `all.html` | 全部まとめて1枚で出す | 各ウィジェット |
| `gift-alert.html` | ギフト・フォロー・シェアの通知 | `alerts` |
| `chat.html` | コメント欄 | `chats` |
| `cutin.html` / `image-cutin.html` | カットイン / 写真付きカットイン | `cutins` / `imageCutins` |
| `rush.html` | RUSH（確変モード） | `/api/rush` |
| `gift-jar.html` | ギフト瓶 | `jars` |
| `roulette.html` / `roulette-strip.html` | ルーレット（丸 / 横） | `roulettes` |
| `counter.html` / `goal.html` / `ranking.html` | 数・目標・ランキング | `counters` / `goals` / `rankings` |
| `wins.html` / `wins-fx.html` | WIN数 / その全画面演出 | `/api/wins` |
| `timer.html` | 延長タイマー | `/api/timer` |
| `boss.html` | ボス討伐 | `/api/boss` |
| `media.html` + `media.js` | メディア通知 | `/api/media-alerts` |
| `sounds.html` + `sounds.js` | ギフト別サウンド（画面には出ない） | `/api/gift-sounds` |
| `gacha.html` + `gacha.js` | ガチャ | `/api/gacha` |
| `omikuji.html` | おみくじ。ガチャと同じ抽選を、みくじ筒とみくじ紙で見せる。結果の名前に「大吉」は金、「凶」は墨 | `/api/gacha` |
| `slot.html` + `slot.js` | スロット | `/api/slot` |
| `locked.html` | 使えないウィジェットを開いたときの案内 | — |
| `lib/` | 共通の CSS・JS（デザイン `overlay.css`、ギフト名、ルーレット、カットインなど） | — |
| `img/` | ボスの絵 | — |
