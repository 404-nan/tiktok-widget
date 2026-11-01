# obs-attempt-count: 配信ごとに OBS の接続回数を記録し、断られた接続を journal に残す

for: 北極星
仕事の種類: 作る(小さく)
見た目が変わるか: 変わらない

目的: 配信したのにウィジェットの接続時間が0の配信が2件あった(ops docs/research/northstar-zero-connection-2026-11-01.md)。「OBS に入れていない」のか「入れたが断られた・すぐ切れた」のかを今の記録では分けられない。入口(cloudflared)にもアクセス記録は無い(2026-11-01 確認: tiktok-widget-tunnel の journal は0行)。次の配信から分けられるようにする。

前提(今のコード):
- upgrade の入口は `server.js` 487行あたり。鍵が無い・無効なら `socket.destroy()` するだけで何も残らない
- 配信の記録は `src/history.js`(接続時間 43・135・153・199行あたり)。接続の回数は持っていない
- テストは `npm test`

## 作るもの
- `src/history.js`: 配信ごとの記録に `obsConnects`(その配信中に obs 役が新しくつながった回数)を足す。preview は数えない
- `server.js`: upgrade で断ったとき、journal に1行 `ws rejected: <理由>` を出す。理由は `no-tenant`(鍵が見つからない)・`disabled`(止めた配信者)・`bad-path` の3つだけ。鍵・URL・IP・配信者のIDは出さない。同じ理由は1分に1行まで(連打でログが溢れないように)

## 触ってよいファイル
`src/history.js`、`server.js`、`test/` の該当テスト(無ければ `test/history.test.js` か近いもの)、README(機能の一覧と `src/README.md`)

完成の条件:
- AC-1 配信中に obs 役が2回つながると、終わった配信の記録の `obsConnects` が 2 になる
- AC-2 preview 役の接続は `obsConnects` に入らない
- AC-3 obs が1回もつながらなかった配信は `obsConnects` が 0(今の接続時間0と区別できる)
- AC-4 無効な鍵の upgrade は `ws rejected: no-tenant` を出し、出た文に鍵の文字列が入っていない
- AC-5 同じ理由で1分に何回断っても、出る行は1行
- AC-6 `npm test` が全部通る。README を直す

作らないもの: 画面の変更、新しい保存ファイル、試行の数を外へ送ること、IP の記録、過去の配信の作り直し
証拠: AC-1〜5 の新しいテストが直す前に落ち、直した後に通る出力
