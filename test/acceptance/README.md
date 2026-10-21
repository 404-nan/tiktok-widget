# test/acceptance/

完成条件カード（`docs/cards/*.md`）を、利用者から見える動きとして確かめる受け入れテスト置き場です。実装より先に書くカードもあり、最初は失敗します。

| ファイル | 何をするか |
| --- | --- |
| `guard.test.js` / `guard-round2.test.js` / `guard-round3.test.js` | 1人用の操作を本番で使わせないガードの確認 |
| `obs.test.js` | 偽の obs-websocket と vm 上のページで OBS カードの AC-1〜13 を確認する。AC-14 は全体テストで確認する |
| `dareba.test.js` | ダレ場の判定、進行、停止、テスト送信を確認する |
| `peka.test.js` / `peka-wiring.test.js` | ペカの完成条件とランタイム・API・CLI・MCP・画面の配線を確認する |
| `throne.test.js` / `throne-wiring.test.js` | 動く王座の完成条件と設定・操作経路・画面の配線を確認する |
| `ootori.test.js` / `ootori-wiring.test.js` | 大トリの完成条件と設定・操作経路・画面の配線を確認する |
| `relay-stop.test.js` / `relay-stop-wiring.test.js` | リレー停止の完成条件と設定・操作経路・画面の配線を確認する |
| `push-button.test.js` | 押しボタンの設定・集計・操作入口・公開コードを確認する |
| `participation-vote-review.test.js` | コメント投票のレビュー条件を確認する |
| `cheer.test.js` / `cheer-public.test.js` | いいね応援の設定・集計・操作入口・公開コードを確認する |
| `templates.test.js` / `pre-ship-review-templates.test.js` | 配信テンプレートの完成条件と画面のつなぎ目を確認する |
| `info-feed.test.js` | ニュースティッカーと最近のサポーターの AC を確認する |
| `visitors.test.js` | 初見・常連の匿名記録と来場テロップの境界、保存、設定、画面を確認する |
| `combo.test.js` / `combo-wiring.test.js` / `combo-pre-ship.test.js` | コンボの回数・段階・終了・配線・公開スクリプトを確認する |
| `cutin-premium.test.js` | カットインのプレミア演出カードの完成条件を確認する |
| `mc-named-sabotage.test.js` | 名前入りMinecraft妨害の安全化、状態、上限、テスト隔離を確認する |
| `mc-goal-alert.test.js` / `mc-goal-alert-wiring.test.js` | ゴール接近警報の距離、段階警報、到達、RCON、画面を確認する |
| `perf-hub.test.js` / `perf-history.test.js` / `perf-cleanup.test.js` | 差分配信、履歴保存、ウィジェット側の後片付けを確認する |
| `ai-screenshot.test.js` / `ai-streamer-entry.test.js` / `pre-ship-review-ai.test.js` | 開発用撮影と配信者専用AI入口の安全境界・提案・テスト送信・失効を確認する |
| `pre-ship-regressions.test.js` / `pre-ship-review.test.js` | 本番前レビューで見つかった実接続・再起動・二重処理などの回帰を確認する |

## 使われ方

`npm test`（`node --test`）から実行されます。テストは一時ディレクトリと一時ポートを使い、本番の `config.yaml` や `data/` は変更しません。`src/`、`public/`、`bin/tw.js`、`mcp/server.js` の利用者から見える結果を確認します。

## つながり

- 使うもの: `src/`、`public/`、`../helpers/guard-harness.js`
- 使われるところ: `test/README.md` と `npm test`

最後に直した日: 2026-10-21
