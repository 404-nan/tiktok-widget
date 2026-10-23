# test/

Node.js の組み込みテストランナーで、サーバーの機能、公開画面の配線、受け入れ条件を確かめるフォルダです。

| ファイル | 役目 |
| --- | --- |
| `acceptance/guard.test.js` / `guard-round2.test.js` / `guard-round3.test.js` | ガード機能の受け入れテスト |
| `acceptance/ingest.test.js` / `ingest-round2.test.js` / `ingest-round3.test.js` | ingest AC-1〜24の受け入れテスト |
| `acceptance/ingest-review.test.js` / `ingest-review.test.js` | ingestレビューのHTTP境界・単体テスト |
| `acceptance/ingest-status.test.js` | ingest-statusの画面・説明の受け入れテスト |
| `acceptance/dareba.test.js` / `dareba-wiring.test.js` | ダレ場の判定、状態、停止、配線を確認する |
| `acceptance/peka.test.js` / `peka-wiring.test.js` | ペカの完成条件と配線を確認する |
| `acceptance/throne.test.js` / `throne-wiring.test.js` | 王座の完成条件と配線を確認する |
| `acceptance/ootori.test.js` / `ootori-wiring.test.js` | 大トリの完成条件と配線を確認する |
| `acceptance/relay-stop.test.js` / `relay-stop-wiring.test.js` | リレー停止の完成条件と配線を確認する |
| `acceptance/mc-named-sabotage.test.js` | 名前入りMinecraft妨害の安全化、状態、上限、テスト隔離を確認する |
| `acceptance/mc-goal-alert.test.js` / `mc-goal-alert-wiring.test.js` | ゴール距離、段階警報、RCON、公開画面を確認する |
| `acceptance/obs.test.js` | 偽obs-websocketを使ったOBS連携の受け入れテスト |
| `acceptance/templates.test.js` / `pre-ship-review-templates.test.js` | 配信テンプレートの完成条件と画面のつなぎ目を確認する |
| `acceptance/push-button.test.js` | 押しボタンの設定・集計・操作入口・公開コードを確認する |
| `acceptance/participation-vote-review.test.js` | コメント投票のレビュー条件を確認する |
| `acceptance/cheer.test.js` / `cheer-public.test.js` | いいね応援の設定・集計・操作入口・公開コードを確認する |
| `acceptance/combo.test.js` / `combo-wiring.test.js` / `combo-pre-ship.test.js` | コンボの回数・段階・終了・配線・公開スクリプトを確認する |
| `acceptance/cutin-premium.test.js` | カットインのプレミア演出カードを確認する |
| `acceptance/info-feed.test.js` | ニュースティッカーと最近のサポーターを確認する |
| `acceptance/visitors.test.js` | 初見・常連の匿名記録と来場テロップを確認する |
| `acceptance/perf-hub.test.js` / `perf-history.test.js` / `perf-cleanup.test.js` | WebSocket差分、履歴保存、後片付けを確認する |
| `acceptance/pre-ship-regressions.test.js` / `pre-ship-review.test.js` | 本番前レビューの回帰条件を確認する |
| `acceptance/ai-screenshot.test.js` / `ai-streamer-entry.test.js` / `pre-ship-review-ai.test.js` | 開発用撮影と配信者専用AI入口の安全境界を確認する |
| `helpers/guard-harness.js` | 一時サーバーを起動するテストヘルパー |
| `actions.test.js` | アクションのテスト |
| `admin-features.test.js` | 管理画面機能のテスト |
| `agents-docs.test.js` | 作業規則とドキュメントのテスト |
| `ai.test.js` / `ai-control.test.js` | AI設定と操作制御のテスト。使ったトークンの記録も確かめる |
| `billing.test.js` / `rental.test.js` | 利用制限、利用期間、課金のテスト |
| `boss.test.js` / `boss-rank.test.js` | ボス機能と順位のテスト |
| `chat.test.js` | コメント処理のテスト |
| `coins-nan.test.js` | コイン値の異常系テスト |
| `config.test.js` / `keep-settings.test.js` | 設定読み書きと保持のテスト |
| `cutin-style.test.js` | カットイン設定のテスト |
| `dev-trigger.test.js` | 開発用トリガーのテスト |
| `env.test.js` | 環境判定のテスト |
| `public-js.test.js` | 公開ウィジェットとダッシュボードの JavaScript が Chromium 103 で動く書き方か(ES2022 まで、新しすぎる関数と外部 CDN なし) |
| `widget-tenant-paths.test.js` | overlay.js を使わない公開ウィジェットが、配信者ごとの URL の下の API と WebSocket を使うか |
| `gacha-viewers.test.js` | ガチャの視聴者ごとの無料回・有料回、リセット、コメントで回す |
| `gacha-room.test.js` | 無料回は配信の roomId が変わったときだけ戻る |
| `events.test.js` | イベントバスのテスト |
| `gacha.test.js` | ガチャのテスト |
| `gift-display.test.js` / `gift-names.test.js` / `obs-gift-names.test.js` | ギフト表示名と対応表のテスト |
| `gifts.test.js` / `gift-sounds.test.js` | ギフト処理と音のテスト |
| `history.test.js` / `history-test-send.test.js` | 履歴保存とテスト送信のテスト |
| `widget-usage.test.js` | OBS ウィジェット利用時間の合計・判定・表示のテスト |
| `hub.test.js` | イベント集計と配信のテスト |
| `ingest-keys.test.js` | ingest鍵の保存・作り直し・削除の単体テスト |
| `media-alerts.test.js` | メディア通知のテスト |
| `minecraft.test.js` | Minecraft連携のテスト |
| `monitor-status.test.js` | モニター状態のテスト |
| `normalize.test.js` | 入力正規化のテスト |
| `pinlogin.test.js` | PINログインのテスト |
| `reconnect.test.js` | 再接続のテスト |
| `hub-clients.test.js` | ハブが、つながっている画面の役目(obs)を答え、つながったことを知らせるか |
| `roulette-actions.test.js` / `roulette-trigger.test.js` | ルーレット操作と起動のテスト |
| `hidden-limits.test.js` | 待ちを捨てるコードが README の「上限と飛ばすルール」に全部書いてあるか |
| `gift-streaks.test.js` | 連打ギフトが途中で切れても数え落とさない・二重に数えないか |
| `rush.test.js` / `rush-odds.test.js` | RUSHと抽選率のテスト |
| `signkey.test.js` | 署名鍵のテスト |
| `slot.test.js` / `timer.test.js` / `timer-length.test.js` | スロットとタイマーのテスト |
| `tenants.test.js` | 配信者管理のテスト |
| `tiktok.test.js` | TikTok接続のテスト |
| `vault.test.js` | データ退避のテスト |
| `weight.test.js` | 重み付き抽選のテスト |
| `wins.test.js` | WIN数のテスト |

## つながり

テストは `npm test` で実行します。受け入れテストは一時ディレクトリと一時ポートを使い、本番の `config.yaml` や `data/` は使いません。OBS連携だけは `node --test test/acceptance/obs.test.js` でも実行できます。

最後に直した日: 2026-10-21
