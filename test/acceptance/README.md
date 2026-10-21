# test/acceptance/

カードに書かれた完成条件を、利用者から見える動きとして確かめます。

| ファイル | 何をするか |
| --- | --- |
| `dareba.test.js` | ダレ場の判定、進行、停止、テスト送信の受け入れ条件を確かめる |

## つながり

`test/README.md` から呼ばれ、`npm test` の一部として実行されます。
# test/acceptance

docs/cards/ の「完成の条件」(AC)を、そのまま確かめるテスト置き場です。実装より先に書き、最初は失敗します。

| ファイル | 何をするか |
|---|---|
| `guard.test.js` | dev/guard カードの AC(1人用の操作を本番で使わせない)の確認 |
| `guard-round2.test.js` | guard の 2 巡目レビューで足した確認 |
| `guard-round3.test.js` | guard の 3 巡目レビューで足した確認 |
| `obs.test.js` | obs カード(docs/cards/obs.md)の AC-1〜AC-13。偽の obs-websocket と vm 上のページで確かめる。AC-14 は `npm test` 全体で見る |

- 実行: `node --test test/acceptance/`
- 使うもの: `test/helpers/guard-harness.js`(guard 用)、`src/`・`public/widgets/`・`bin/tw.js`・`mcp/server.js`(読むだけ)
- obs.test.js は、まだ無い `public/widgets/obs-bridge.js`・`lib/sha256.js` などを読むため、実装前は失敗する
カードの完成条件を、外部から見える動作で確かめる受け入れテストです。

| ファイル | 役目 |
| --- | --- |
| `push-button.test.js` | 押しボタンの設定・集計・操作入口・公開コードを検査する |
| `participation-vote-review.test.js` | コメント投票のレビュー条件を検査する |
| `cheer.test.js` | いいね応援の設定・集計・操作入口・記録分離を検査する |
| `cheer-public.test.js` | いいね応援の公開コードと一覧登録を検査する |

テストは一時ディレクトリを使い、本番の `config.yaml` と `data/` は変更しません。
カードの完成条件を、既存テストとは別に確認する受け入れテストです。

| ファイル | 役目 |
| --- | --- |
| `perf-hub.test.js` | WebSocket の状態契約、差分配信、本番集計への非混入を確認する |
| `perf-history.test.js` | 連打時の履歴保存回数と保存 JSON の形を確認する |
| `perf-cleanup.test.js` | Chrome がある環境で性能計測を起動し、ウィジェット側の後片付け条件を確認する |

`npm test` から実行され、`src/hub.js`・`src/history.js`・`scripts/perf/`を対象にします。
# test/acceptance

完成条件カード(`docs/cards/*.md`)の AC を1つずつ確かめるテスト置き場。`npm test`(`node --test`)で他のテストと一緒に走る。

## ファイル

- `guard.test.js` / `guard-round2.test.js` / `guard-round3.test.js`: `docs/cards/tw-guard.md`(1人用の操作を本番で使わせない)の AC。`../helpers/guard-harness.js` を使う
- `info-feed.test.js`: `docs/cards/info-feed.md`(ニュースティッカーと最近のサポーター)の AC。サーバー側(AC-1〜4、13、14)は `src/info-feed.js`・`src/config.js`・`src/runtime.js` を直接動かし、画面側(AC-5〜12、15、16)はソースの文字列で確かめる。実装前は失敗するのが正しい状態
- `visitors.test.js`: `docs/cards/visitors.md`(初見・常連の匿名記録と来場テロップ)の AC。記録の境界、保存、テスト送信、設定、公開画面の契約を確かめる

## 使われ方・使うもの

- 使うもの: `src/` と `public/` の実コード、`../helpers/`
- 使われ方: `npm test` だけ。実行時のコードからは呼ばれない
