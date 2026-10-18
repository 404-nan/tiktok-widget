# test/

Node.jsの組み込みテストランナーで、サーバーの機能と受け入れ条件を確かめるフォルダです。

| ファイル | 役目 |
| --- | --- |
| `acceptance/guard.test.js` | ガード機能の受け入れテスト |
| `acceptance/guard-round2.test.js` | ガード2巡目の受け入れテスト |
| `acceptance/guard-round3.test.js` | ガード3巡目の受け入れテスト |
| `acceptance/ingest.test.js` | ingest AC-1〜13の受け入れテスト |
| `acceptance/ingest-round2.test.js` | ingest AC-14〜21の受け入れテスト |
| `acceptance/ingest-round3.test.js` | ingest AC-22〜24の受け入れテスト |
| `acceptance/ingest-review.test.js` | ingest 3巡目レビューのHTTP境界テスト |
| `helpers/guard-harness.js` | 一時サーバーを起動するテストヘルパー |
| `actions.test.js` | アクションのテスト |
| `admin-features.test.js` | 管理画面機能のテスト |
| `agents-docs.test.js` | 作業規則とドキュメントのテスト |
| `ai.test.js` | AI設定のテスト |
| `ai-control.test.js` | AI操作制御のテスト |
| `billing.test.js` | 利用制限と課金のテスト |
| `boss.test.js` | ボス機能のテスト |
| `boss-rank.test.js` | ボス順位のテスト |
| `chat.test.js` | コメント処理のテスト |
| `coins-nan.test.js` | コイン値の異常系テスト |
| `config.test.js` | 設定読み書きのテスト |
| `cutin-style.test.js` | カットイン設定のテスト |
| `dev-trigger.test.js` | 開発用トリガーのテスト |
| `env.test.js` | 環境判定のテスト |
| `es5-public.test.js` | 公開ウィジェットのES5検査 |
| `events.test.js` | イベントバスのテスト |
| `gacha.test.js` | ガチャのテスト |
| `gift-display.test.js` | ギフト表示のテスト |
| `gift-names.test.js` | ギフト名対応表のテスト |
| `gifts.test.js` | ギフト処理のテスト |
| `gift-sounds.test.js` | ギフト音のテスト |
| `history.test.js` | 履歴保存のテスト |
| `history-test-send.test.js` | 履歴のテスト送信 |
| `hub.test.js` | イベント集計と配信のテスト |
| `ingest-keys.test.js` | ingest鍵の保存・作り直し・削除の単体テスト |
| `ingest-review.test.js` | ingest 3巡目レビューの単体テスト |
| `keep-settings.test.js` | 設定保持のテスト |
| `media-alerts.test.js` | メディア通知のテスト |
| `minecraft.test.js` | Minecraft連携のテスト |
| `monitor-status.test.js` | モニター状態のテスト |
| `normalize.test.js` | 入力正規化のテスト |
| `obs-gift-names.test.js` | OBS向けギフト名のテスト |
| `pinlogin.test.js` | PINログインのテスト |
| `reconnect.test.js` | 再接続のテスト |
| `rental.test.js` | 利用期間のテスト |
| `roulette-actions.test.js` | ルーレットアクションのテスト |
| `roulette-trigger.test.js` | ルーレット起動のテスト |
| `rush.test.js` | RUSHのテスト |
| `rush-odds.test.js` | RUSH抽選率のテスト |
| `signkey.test.js` | 署名鍵のテスト |
| `slot.test.js` | スロットのテスト |
| `tenants.test.js` | 配信者管理のテスト |
| `tiktok.test.js` | TikTok接続のテスト |
| `timer.test.js` | タイマーのテスト |
| `timer-length.test.js` | タイマー長さのテスト |
| `vault.test.js` | データ退避のテスト |
| `weight.test.js` | 重み付き抽選のテスト |
| `wins.test.js` | WIN数のテスト |

`npm.cmd test` で全テストを実行します。受け入れテストは一時ディレクトリと一時ポートを使い、本番の `data/` には触れません。
