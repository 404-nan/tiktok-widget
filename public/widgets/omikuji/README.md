# public/widgets/omikuji/

ギフトで引くおみくじのウィジェットです。OBS に入れる URL は `/widgets/omikuji.html`（このフォルダの `index.html` に転送されます）。抽選と段階はサーバーの `src/gacha.js` が決め、画面は WebSocket で受けて見せるだけです。

| ファイル | 役目 |
| --- | --- |
| `index.html` | おみくじの画面。番号を選ぶ → 筒を振る → 棒が出る → 紙が開いて運勢と朱印。大吉の確定演出の CSS 版（描けないときの控え）もここ |
| `daikichi-fx.js` | 大吉の確定演出の Three.js 版。大吉の結果（reveal）が始まったときに `three/` を読み、ウィジェットの画面いっぱいの板に3段で描く: 溜め（画面の外から光が加速して集まり、光の筋が速く・強く回り、最後の3割は舞台ごと数 px 震える）→ 解放（`--fx-delay` の瞬間に、閃光・十字の光・画面を洗う光・輪3つ・金の粉の破裂と冠を一度に。強さの頂点はここ1回）→ 余韻（回る光の柱ときらめく粉。頂点の6割以下）→ 光が中心へ集まって小さく灯り消える。震えは舞台（`#stage`）の transform の後ろに `translate()` を足し、解放の瞬間と後片付けで外す。粒は合わせて860個（千個未満）。描く細かさは画素の上限（600×600×4）を超えないよう画面の大きさで下げる。大吉が終わると描画を止め、立体・素材・WebGL・描く板を全部片付ける |
| `three/` | Three.js 0.183.0（版を固定。中身と入れ替え方は [three/README.md](three/README.md)） |
| `preview.html` | ダッシュボードの見本用。`../omikuji.html?preview=1` を枠に入れて見せる |
| `schema.js` | ダッシュボードの設定項目の定義 |
| `widget.json` | ウィジェットの名前・大きさ・受ける出来事・テスト送信の中身 |

## つながり

- 段階と運勢の文字: `../gacha.js` が `#stage` の `data-phase` / `data-tier` / `data-display` と文字を入れる
- 大吉の後光・輪・粉: `index.html` が `./omikuji/daikichi-fx.js` を読む（ページの住所は `/widgets/omikuji.html` なので、`omikuji/` から書く）。描く板は body の直下に画面いっぱいで置く。描けたときだけ `.stage.fx-3d` を付けて CSS 版を消し、周りの沈み込み（`.fx-dim`）を外側へ溶ける形に広げる。WebGL が無い・three が読めない・破裂に読み込みが間に合わないときは付けない（CSS 版のまま）。動きを減らす設定のときも付けず、CSS 版の後光・輪・粉も出さない
- 版の更新: `../lib/version-watch.js`
- テスト: `test/omikuji-*.test.js`

最後に直した日: 2026-11-16
