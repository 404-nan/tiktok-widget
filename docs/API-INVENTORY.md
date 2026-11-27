# API 一覧（口の地図）

この製品と社内の仕組みが持つ「口」（外から叩ける境界）の一覧です。新しい口を足したら、この一覧も同じ変更で足すこと（`test/api-inventory.test.js` が、登録された経路がこの一覧に無いと落とします）。

認証の考え方（共通）：
- テナントの口は、そのテナントの範囲だけ。テナントをまたぐのは運営の口だけ
- AI の口はトークン必須・読み取りと提案が中心・配信中は書き込み不可・課金は申請だけ（`src/ai-api.js` の形が正本）
- 鍵の値はこの一覧にも記録にも書かない
- 公開の口（/healthz）は最小のまま（ok と live だけ）

## 1. 配信者・画面向け（src/runtime-routes.js、テナントの範囲）

画面（ダッシュボードとウィジェット）が使う口。認証はテナントのセッション。

| 経路 | 役目 |
| --- | --- |
| GET /api/me | ログイン中のテナント自身 |
| GET /api/me/widgets | 自分のウィジェット |
| GET /api/me/template | 自分のテンプレート |
| GET /api/me/guide | 自分向けの案内 |
| POST /api/me/name | 名前の変更 |
| POST /api/preparation/auto | 準備の自動化 |
| POST /api/preparation/dismiss | 準備の却下 |
| GET /api/env | 環境の種別 |
| GET /api/status | 接続と配信の状態 |
| GET /api/config | 設定の読み取り |
| GET /api/config/schema | 設定の項目定義 |
| GET /api/config/reference | 設定の参照情報 |
| GET /api/announcements | お知らせ |
| GET /api/notes | メモ |
| GET /api/history | 配信の履歴 |
| GET /api/history/:id | 履歴の詳細 |
| GET /api/session-records | 配信の記録 |
| GET /api/draw-results | 抽選の記録 |
| GET /api/points | ポイント |
| GET /api/gifts | ギフト |
| GET /api/gift-names | ギフト名 |
| GET /api/visitors | 入室の記録 |
| GET /api/widget-versions | ウィジェットの版数 |
| GET /api/preparation | 準備の状態 |
| GET /api/euler-usage | 利用量 |
| GET /api/info-feed | 情報フィード |
| GET /api/sample | 見本モードの状態 |
| POST /api/sample | 見本モードの切り替え |
| GET /api/presets | プリセット |
| POST /api/presets/active | プリセットの適用 |
| GET /api/templates | テンプレート |
| POST /api/templates/preview | テンプレートの試し |
| POST /api/templates/apply | テンプレートの適用 |
| POST /api/templates/undo | テンプレート適用の取り消し |
| GET /api/media | メディア |
| POST /api/media | メディアの追加 |
| GET /api/media-alerts | メディア通知 |
| GET /api/media-alerts/:id/file | メディアのファイル |
| POST /api/media-alerts/ack | メディア通知の確認 |
| POST /api/media-alerts/autoplay | メディア通知の自動再生 |
| GET /api/gift-sounds | ギフト音 |
| POST /api/gift-sounds/ack | ギフト音の確認 |
| POST /api/gift-sounds/autoplay | ギフト音の自動再生 |
| GET /api/connect | 接続の状態 |
| POST /api/disconnect | 切断 |
| POST /api/control | 操作（テスト送信など） |
| POST /api/reset | 状態のリセット |
| POST /api/simulate | イベントの模擬 |
| POST /api/dev/trigger | 開発用の起動（開発環境だけ） |
| GET /api/demo | デモ |
| GET /api/gacha | おみくじの状態 |
| GET /api/card-draw | カードめくり |
| GET /api/gacha-viewers | おみくじの視聴者 |
| POST /api/gacha-viewers/:id/adjust | 視聴者の調整 |
| POST /api/gacha-viewers/reset-free | 無料分のリセット |
| GET /api/omikuji | おみくじ |
| GET /api/door | 扉の確率ゲームの状態 |
| ALL /api/door/:id/:action | 扉の操作（開始・選択・リセット） |
| GET /api/quiz | クイズの状態 |
| ALL /api/quiz/:id/:action | クイズの操作（出題・終了など） |
| GET /api/dareba | ダレバ |
| GET /api/ootori | 大鳥 |
| GET /api/peka | ペカ |
| GET /api/relay-stop | リレー停止 |
| GET /api/slot | スロット |
| GET /api/throne | 王座 |
| GET /api/ingest | 取り込みの状態 |
| POST /api/ingest/key | 取り込み鍵の発行 |
| GET /api/minecraft | マイクラ連携の状態 |
| GET /api/minecraft/goal-alert | マイクラ目標通知 |
| GET /api/minecraft/named-sabotage | 名前つき妨害 |
| POST /api/minecraft/check | マイクラの確認 |
| POST /api/minecraft/command | マイクラへの命令 |
| GET /api/mc-gifts | マイクラ用ギフト |
| GET /api/ai | AI の状態 |
| GET /api/ai/state | AI の状態（詳細） |
| POST /api/ai/ask | AI への相談 |
| POST /api/ai/apply | AI 提案の適用 |
| POST /api/ai/undo | AI 適用の取り消し |

ウィジェットの状態を読む口（各ウィジェットの描画用、同じ形）：
GET /api/boss / GET /api/cheer / GET /api/combo / GET /api/rush / GET /api/stepup / GET /api/swarm / GET /api/superstream / GET /api/timer / GET /api/vote / GET /api/wins / GET /api/push-button

## 2. 運営向け（server.js の /admin/api、運営の管理認証）

| 経路 | 役目 |
| --- | --- |
| GET /admin/api/tenants | テナント一覧 |
| POST /admin/api/tenants | テナント作成（`referralCode` は任意） |
| POST /admin/api/tenants/:id/rekey | 鍵の再発行 |
| POST /admin/api/tenants/:id/repin | PIN の再発行 |
| POST /admin/api/tenants/:id/billing/code | 紹介コードの発行 |
| POST /admin/api/tenants/:id/referral | 初回入金の記録前に紹介コードを適用 |
| POST /admin/api/tenants/:id/billing/credit | 課金の残高 |
| GET /admin/api/money | 紹介元、入金、紹介報酬、残高、月額案 |
| POST /admin/api/money/payments | 共通の台帳に確認済み月額入金を記録（`tenantId`、整数の `amount`、一意の `reference`、日本時間の入金日 `paidOn: YYYY-MM-DD`、`confirmed: true`） |
| POST /admin/api/money/payments/:id/correction | 入金の訂正を台帳に追記（正しい整数の `amount`、`reason`） |
| POST /admin/api/money/payments/:id/void | 入金記録の取り消しを台帳に追記（`reason`）。取り消した入金の照合番号は再利用可 |
| POST /admin/api/money/payments/:id/payout | 確認した金額（`confirmedAmount`）で報酬の支払いを記録。現在の未払い額と異なる場合は 409 |
| GET /admin/api/lul | 全テナントの概要 |
| POST /admin/api/ledger/sync | 集金台帳へ貸出の発生・訂正差分を同期 |
| GET /admin/api/ledger/summary | 集金台帳の人ごとの残高と今月の集計 |
| GET /admin/api/ledger/streamers/:id | 集金台帳の1人の詳細 |
| GET /admin/api/ledger/streamers/:id/sales | 1人の月次売上推移 |
| GET /admin/api/ledger/streamers/:id/entries | 1人の台帳の行 |
| POST /admin/api/ledger/collections | 集金を記録 |
| POST /admin/api/ledger/adjustments | 訂正・値引きを記録 |
| POST /admin/api/ledger/entries/:id/reversal | 台帳の行を取り消す |
| GET /admin/api/widget-usage | ウィジェットの利用状況 |
| GET /admin/api/deploy-status | 投入の状態 |
| GET /admin/api/keys | 鍵の一覧（値は出さない） |
| POST /admin/api/keys | 鍵の発行 |
| GET /admin/api/api-keys | API キーの一覧（値は出さない） |
| POST /admin/api/api-keys | API キーの発行 |
| GET /admin/api/notes | 運営メモ |
| POST /admin/api/notes | 運営メモの追加 |
| GET /admin/api/ai-tokens | AI トークンの一覧（値は出さない） |
| POST /admin/api/ai-tokens | AI トークンの発行 |
| GET /admin/api/ai-audit | AI の監査記録 |
| GET /admin/api/ai-approvals | AI の承認待ち |
| POST /admin/api/ai-approvals/:id/approve | AI 提案の承認 |
| POST /admin/api/ai-approvals/:id/reject | AI 提案の却下 |
| PUT /admin/api/access | 接続先の設定 |
| PUT /admin/api/sign-key | 署名鍵の設定 |
| PUT /admin/api/billing | 課金の設定 |
| DELETE /admin/api/keys/:id | 鍵の削除 |
| DELETE /admin/api/api-keys/:id | API キーの削除 |
| DELETE /admin/api/notes/:id | 運営メモの削除 |
| DELETE /admin/api/ai-tokens/:id | AI トークンの削除 |

## 3. 公開・取り込み（server.js）

| 経路 | 役目 |
| --- | --- |
| GET /healthz | 死活（ok と live だけ） |
| GET /vendor/matter.min.js | 同梱ライブラリの配布 |
| GET /d/:sid | 配信者ページの短い口 |
| POST /d/:sid | 同上 |
| GET /in/:key | 取り込み（鍵つき） |
| POST /in/:key | 取り込み（鍵つき） |
| GET /in | 取り込みの案内 |
| POST /in | 取り込み |

## 4. AI 向け（src/ai-api.js の AI_ROUTES、トークン必須）

MCP（src/ai-mcp.js）と HTTP の両方で同じ道具を出す。道具名：
get_status / get_config / validate_config / get_history / analyze_effects / list_widget_urls / list_gifts / list_changes / suggest_config / set_config / merge_config / delete_config / spin_roulette / timer / wins / boss / rush / vote / cheer / push_button / combo / test_event / tenant_widgets / tenant_template / undo / request_billing_change

線：配信中は書き込み不可（読み取りと dry-run は可）。課金は申請だけ。接続・再起動・トークン発行・テナント削除はできない。

## 5. 社内の仕組み（ネットワークの口は開けない。ファイルとコマンドが口）

| 口 | 形 | 使う側 |
| --- | --- | --- |
| 死活の確認 | GET /healthz（製品側） | 見張り・コンソール |
| 社内の状態 | ~/backups/ops-status.json（見張りが2分ごとに書く：版数・頭・live・最後の投入・障害の束の数） | コンソール・AI レーン |
| 投入と戻し | scripts/deploy-release.sh / scripts/rollback-release.sh（コマンド） | AI レーン（SSH） |
| 投入の台帳 | ~/backups/RELEASE-LEDGER.jsonl | AI レーン |
| 障害の診断 | ~/backups/incidents/（見張りが自動で残す） | AI レーン・メイン |
| 関門 | scripts/release-check.mjs（終了コードと記録） | AI レーン（ローカル） |

## 6. AI 同士の連携

| 口 | 形 | 使う側 |
| --- | --- | --- |
| muse-bridge | ファイル（chat.jsonl）＋ CLI（muse m say/read/listen）、SSH/Tailscale 経由。鍵は送らない決まり（BRIDGE.md） | Claude Code・ルーくん・ミューズ |
| Hindsight | MCP（安全プロキシ 8890） | Claude Code・ミューズ |
| 製品の AI 用 MCP | 4. の道具 | AI レーン |

## まだ無い口（設計だけ決まっている物）
- アプリ＋アカウントの口：2026-11-21 の設計（認証は自前、アプリは Tauri）。契約はアプリの仕事と一体で固定する
- 動画サービス向けの出来事の読み口：読み取りだけ・トークン・テナント単位・時刻で引ける形。材料は /api/history・/api/session-records・/api/draw-results に既にある

最後に直した日: 2026-11-22
