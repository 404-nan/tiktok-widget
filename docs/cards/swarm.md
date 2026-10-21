# swarm: 群予告(5秒以内のギフトの数が境目を超えたら、ギフトのアイコンの大群が横切り「群」がドンと出る)の仕組み

仕事の種類: 作り込み(サーバーの仕組み+設定+操作口)
見た目が変わるか: いいえ(画面は `stepup-screens.md`)
順番: `stepup.md` の後(同じ共有ファイルに足す)。`stepup.md` で作った足し込みの形を真似る

目的: 配信全体で、短い時間(既定5秒)に届いたギフトの「個数」が境目を超えた瞬間を「お祭り」にする。1コインの小さなギフトでも数で参加できる。状態はサーバー、WebSocket で配る、テナントごと。

## 作るもの
- `src/swarm.js`: `SwarmEngine`(`constructor(hub)`、`setConfig`、`snapshot`、`onEvent`、`trigger`(見本を出す)、`reset`、`close`)
- `src/runtime.js` に `stepup` と同じ足し込み: エンジン作成 / `applyEngines` / `FEATURE_ORDER` と `PREMIUM_KEYS` に `'swarm'` / `OBS_ALLOWED` に `/api/swarm` / `GET /api/swarm` / `performControl` の `swarm` / `readSwarm()` / `close()`
- `SCHEMA.swarm`(kind: 'object'、page: 'swarm'、`size: () => [1080, 1920]`)、`simple.js`、`config.example.yaml`
- `src/admin.js` の `swarm(action)`、`mcp/server.js` の `swarm` ツール、`bin/tw.js` の `swarm [trigger|reset]`
- `docs/IDEAS.md` の「群予告」に ✅(完成後)

## 設定(日本語の説明)
- `enabled`(true)、`windowSeconds`(既定 5、2〜30)
- `scale`: `small` / `medium` / `large` / `custom`(既定 `medium`)。窓の中のギフトの個数(`gift.count` の合計)の境目: small 10 / medium 30 / large 100 / custom は `threshold`(1以上、既定 30)
- `cooldownSeconds`(既定 20、0〜300): 一度出したあと、次が出るまで
- `text`(既定 `群`、1〜2文字): ドンと出す文字
- `maxIcons`(既定 60、10〜120): 一度に飛ばすアイコンの上限(軽さのため)
- `sound`(true)、`volume`(0.5)

## 動き(サーバー)
- ギフトが届くたびに `{ ts, count, coins, gift: { id, name(日本語名), image, icon }, user }` を窓(`windowSeconds`)の履歴に入れ、古いものを捨てる。窓の中の `count` の合計が境目以上で、`cooldown` が終わっていれば群を起こす
- 起こしたら次を配る: `{ kind: 'swarm', count(窓の合計), coins, gifts: [{ name, image, icon, count }(種類ごと、多い順、最大12種類)], users(最近の送った人の名前、最大3), iconCount(min(count, maxIcons)), level }`。`level` は境目の何倍か: 1倍以上=1、2倍以上=2、3倍以上=3、10倍以上=4。窓の履歴は空にして、次は新しく数える
- `snapshot()`: `{ active, last, cooldownUntil, window(今の窓の個数), threshold, now }`(`active` は演出中の約4秒間)
- 配信中のテスト送信は **窓にも `last` にも入れない**(`testEvent` で聞いて、画面にだけ `{ kind: 'preview' }` を出す)。つなぐ前のテストは数え、`hub.on('reset')` で空に戻す(`stepup.md` と同じ決まり)
- 操作: `performControl('swarm', 'trigger')` は、ギフトの履歴がなくても見本(`DEMO_GIFTS` の12種類)の群を画面にだけ出す(状態は変えない)。ほかに `reset`、`status`

## 完成の条件
- AC-1 medium で、5秒以内に合計30個(1件に複数の `count` も数える)に届いた件で `swarm` が1回だけ流れる。29個では流れない
- AC-2 `gifts` は種類ごとにまとめられ、多い順で最大12種類。`iconCount` は `maxIcons` を超えない。`level` は 1倍・2倍・3倍・10倍で 1・2・3・4
- AC-3 `windowSeconds` を過ぎた古いギフトは数えない(`t.mock.timers`)。`cooldownSeconds` の間は境目を超えても起こさず、終わったら起こせる
- AC-4 4 つのプリセットの境目が上のとおり。`custom` の `threshold` が 0 以下なら日本語のエラーを返す
- AC-5 配信中のテスト送信は `snapshot` を変えず `preview` だけ流す。つなぐ前のテストは数え、`hub.reset()` で空になる。`enabled: false` や `entitled` が false のときは何も数えない
- AC-6 `GET /api/swarm`、`POST /api/control {target:'swarm', action:'trigger'|'reset'|'status'}`、`tw swarm`、MCP の `swarm` が同じ結果を返す。テナントごとに別
- AC-7 `normalize`・`config.example.yaml` の往復・`widgetList`・`simple.js` の項目名の検査が通る(`stepup.md` の AC-8 と AC-9 と同じ)
- AC-8 既存のテストが書き換わらず `npm test` が通る(Windows の既知6件を除く)

## ファイルの範囲
`stepup.md` と同じ。足すのは `src/swarm.js`(新)、`test/acceptance/swarm.test.js`(新)と、共有ファイルへの足し込みだけ。画面は作らない。

## 証拠
`test/acceptance/swarm.test.js` と `npm test`。受け入れテストは実装と別の呼び出しで先に書き、テストを書き換えて緑にしない。
