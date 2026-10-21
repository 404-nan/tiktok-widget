# src/

サーバー側の設定、配信状態、TikTok 接続、演出、記録を置くフォルダです。`server.js` が起動時に読み込み、`public/` の画面と WebSocket・HTTP API でつながります。

| ファイル | 役目 |
| --- | --- |
| `actions.js` | 演出結果に応じたタイマー・WIN・Minecraft などの動作を実行する |
| `admin.js` | MCP と CLI から使う設定・操作をまとめる |
| `admin-auth.js` | 管理画面の合言葉を確認する |
| `ai-api.js` | 外部 AI 用の認証付き API を扱う |
| `ai-mcp.js` | 外部 AI 用 MCP の HTTP 接続を扱う |
| `ai-prompt.js` | AI に送る指示と安全上の説明を作る |
| `ai-tokens.js` | 外部 AI 用トークンを要約だけ保存する |
| `ai.js` | AI の設定案を作り、内容を検証する |
| `api-keys.js` | 管理画面の API キーを保存・伏せ字表示する |
| `billing.js` | 利用期限・プラン・課金状態を判定する |
| `boss.js` | ボスの HP と討伐の演出を管理する |
| `config.js` | YAML 設定を検証・読み書きする |
| `cutin-style.js` | カットインの設定値を検証する |
| `demo.js` | デモ用イベントを流す |
| `env.js` | 開発環境と本番環境を判定する |
| `events.js` | 名前付きイベントを配る |
| `gift-display.js` | ギフトの表示名を日本語にする |
| `gift-names-ja.json` | GiftID と日本語名の対応表 |
| `gift-sounds.js` | ギフトに対応する音の待ち列を管理する |
| `gift-coins.json` | ギフトのコイン数の控え |
| `gifts.js` | ギフト一覧を読み込み、条件検索する |
| `gacha.js` | ガチャの抽選と状態を管理する |
| `healthz.js` | 稼働確認と配信中人数だけの応答を作る |
| `history.js` | 配信ごとの集計記録を保存する |
| `hub.js` | イベントを集計し、画面へ配る |
| `media-alerts.js` | 画像・動画・音声の通知を管理する |
| `minecraft.js` | ギフトや演出を Minecraft の RCON へつなぐ |
| `normalize.js` | TikTok のイベントを共通の形にそろえる |
| `notes.js` | 管理画面のお知らせを保存する |
| `pinlogin.js` | 短い URL と数字のログインを扱う |
| `rcon.js` | Minecraft RCON の通信を行う |
| `rental.js` | 貸し出し枠と自動接続の条件を判定する |
| `roulette.js` | ルーレットの抽選と結果を配る |
| `rush.js` | RUSH の状態と時間を管理する |
| `runtime.js` | 配信者1人分の接続・集計・演出・API を組み立てる |
| `schema.js` | 設定項目・初期値・説明を定義する |
| `signkey.js` | TikTok 署名 API キーを安全に保存する |
| `slot.js` | スロットの抽選と状態を管理する |
| `superstream.js` | Minecraft 側の演出一覧を読む |
| `tenants.js` | 配信者一覧と配信者ごとの runtime を管理する |
| `tiktok.js` | TikTok LIVE への接続と再接続を行う |
| `timer.js` | 延長タイマーを管理する |
| `vault.js` | Cloudflare 上で data/ を退避・復元する |
| `wins.js` | WIN 数と全画面演出の段階を管理する |

主な呼び出し元は `server.js`、`mcp/server.js`、`bin/tw.js` です。設定は `src/schema.js` と `src/config.js`、配信者ごとの組み立ては `src/runtime.js`、複数配信者は `src/tenants.js` が担当します。
| `ingest.js` | 外部ツールからイベントを受け、重複・直接接続との競合を整理してhubへ流す |
| `ingest-keys.js` | 外部イベント受け口の鍵を保存・照合する |
| `chat.js` | コメントの表示対象と読み上げを扱う |
| `stepup.js` | ステップアップ予告の合計・段階・冷却を管理する |
| `swarm.js` | 群予告の個数・種類・冷却を管理する |

## つながり

- 使われる場所: `server.js` がruntimeと配信者APIを起動する。
- 外部イベント: `server.js` → `tenants.js` → `runtime.js` → `ingest.js` → `normalize.js` / `hub.js`。
- 設定・記録: `config.js` と各機能のストアが `config.yaml` / `data/` を扱う。
サーバー側の設定、イベント処理、配信状態、ウィジェットの仕組みを置くフォルダです。

| ファイル | 何をするか |
| --- | --- |
| `dareba.js` | ギフトの勢いが落ちたときの事件を判定し、種類・送信者・進行状態を配信する |
| `peka.js` | 遅れて光る告知ランプの抽選、予定時刻、点灯、待ち行列をサーバーで管理する |
| `throne.js` | 直近10分のギフト合計、王座の在位、接近VS、王冠移動、終了称号をサーバーで管理する |
| `ootori.js` | ラスト10分の席、大トリ、参加者一覧、終了演出の時間をサーバーで管理する |
| `relay-stop.js` | 既存スロットの固定結果、3本の停止順、送信者、10秒の自動停止、待機列をサーバーで管理する |
| `schema.js` | ダレ場を含む設定項目、初期値、説明を定義する |
| `minecraft-name.js` | Minecraftの名前入り妨害を安全化し、状態保存・再起動時の片付け・コマンドを管理する |
| `mc-goal-alert.js` | Minecraftのゴール距離、警報段階、再通知、ゴール到達をサーバーで管理する |
| `rcon.js` | MinecraftのRCONへ接続し、通常コマンドとゴール距離問い合わせを送る |
| `runtime.js` | 大トリ・ダレ場などを配信イベント、API、WebSocket、設定へつなぐ |
| `admin.js` | CLI と MCP からダレ場の状態・開始・停止を呼ぶ |
| `hub.js` | TikTokイベントを集め、集計とWebSocket配信を行う |
| `*.js` | 配信、設定、履歴、ゲーム、外部連携などのサーバー側機能 |

## つながり

Peka、動く王座、リレー停止、大トリ、ダレ場、ゴール接近警報は `runtime.js` から `hub.js` のイベントを購読し、公開ウィジェットへAPIとWebSocketで状態を渡します。既存のイベントは `testEvent` を集計しません。
設定検証、配信状態、管理操作などサーバー側の中心部です。

| ファイル | 役目 |
| --- | --- |
| `schema.js` | `obs`を含む設定項目・既定値・日本語説明 |
| `config.js` | 設定値とOBSルールの検証・既定値への補完 |
| `admin.js` | CLI・MCPから共通利用する操作 |

`server.js`からruntimeが使い、CLIは`bin/tw.js`、MCPは`mcp/server.js`から呼びます。
サーバー側の設定定義、イベント集計、ウィジェットの状態、外部操作を置く場所です。

| ファイル | 役目 |
| --- | --- |
| `push-button.js` | コメントといいねを押し数へ集計し、結果を WebSocket で配る |
| `vote.js` | コメントの番号投票を1人1票で集計し、結果を WebSocket で配る |
| `cheer.js` | いいねをため、満タンと次の目標を WebSocket で配る（記録しない） |
| `schema.js` | `pushButtons` を含む設定項目・初期値・日本語説明を定義する |
| `runtime.js` | 投票・応援・押しボタンを起動し、HTTP 操作とテナント制限をつなぐ |
| `hub.js` | イベントを集め、配信中のテストを本番集計から分ける |
| `admin.js` | CLI と MCP から押しボタンを操作する共通入口 |
| `ai-api.js` / `ai-mcp.js` | AI 用の操作入口に応援ゲージを足す |

`server.js` が `runtime.js` を起動し、`runtime.js` が `hub.js` のイベントを `push-button.js` へ渡します。
`runtime.js` は `vote.js` にコメント、`cheer.js` にいいね、`push-button.js` にコメントといいねを渡し、公開画面へ状態を配ります。
サーバー側の設定、配信状態、TikTok 接続、管理 API と、テンプレートの読み込みを置くフォルダです。

| ファイル | 役目 |
| --- | --- |
| `runtime.js` | 1人分の配信状態と HTTP API を組み立てる |
| `tenants.js` | 配信者、鍵、使えるウィジェット、遊び方を保存する |
| `templates.js` | 配信テンプレートを読み込み、検証し、プレビューを作る |
| `templates/` | 妨害マイクラ・罰ゲーム雑談・耐久・目標配信の設定データ |
| `config.js` | YAML の読み書き、検証、差分適用を行う |
| `schema.js` | 設定項目、初期値、説明を定義する |
| `hub.js` | イベント、集計、WebSocket 配信を管理する |
| `tiktok.js` | TikTok LIVE に接続し、切断時に再接続する |
| `normalize.js` | TikTok のイベントをアプリ内の形にそろえる |
| `events.js` | イベント名と配信時刻を整える |
| `demo.js` | デモと開発用イベントを作る |
| `gifts.js` | ギフト名、ID、コイン数を扱う |
| `gift-names-ja.json` | GiftID ごとの日本語ギフト名を持つ |
| `gift-coins.json` | ギフトの控えのコイン数を持つ |
| `gift-display.js` | ギフトを画面表示用の形にする |
| `gift-sounds.js` | ギフト音の設定と再生待ちを扱う |
| `actions.js` | ギフトなどから起こす動作を実行する |
| `roulette.js` | ルーレットを抽選し、結果を配る |
| `rush.js` | RUSH の突入、延長、終了を管理する |
| `gacha.js` | ガチャの抽選と状態を管理する |
| `wins.js` | WIN 数の増減と履歴を管理する |
| `timer.js` | 延長タイマーの状態を管理する |
| `boss.js` | ボスの HP、ダメージ、討伐を管理する |
| `slot.js` | スロットの抽選と結果を管理する |
| `cutin-style.js` | カットインの見た目設定を検証する |
| `media-alerts.js` | 画像・音声の通知設定を扱う |
| `chat.js` | コメントの表示対象と読み上げを扱う |
| `history.js` | 配信ごとの履歴を保存する |
| `vault.js` | data/ の退避と復元を行う |
| `minecraft.js` | ルールから Minecraft の動作を作る |
| `rcon.js` | Minecraft RCON に接続する |
| `superstream.js` | Minecraft 演出プロフィールを読む |
| `rental.js` | 貸し出し期間と自動接続を判定する |
| `billing.js` | 支払い状態と利用制限を管理する |
| `admin.js` | 管理画面と CLI 共通の操作を提供する |
| `admin-auth.js` | 管理 API の合言葉を確認する |
| `api-keys.js` | 外部 API キーを安全に保存し、伏せて返す |
| `signkey.js` | 鍵の署名に使う秘密を管理する |
| `notes.js` | 管理画面のお知らせを保存する |
| `pinlogin.js` | 数字のログインと試行制限を管理する |
| `env.js` | 開発・本番の環境判定を行う |
| `ai.js` | AI の案を検証し、設定変更の形にする |
| `ai-api.js` | AI 向け HTTP API と承認を扱う |
| `ai-mcp.js` | AI 向け MCP の HTTP 入口を作る |
| `ai-prompt.js` | AI に渡す説明文を作る |
| `ai-tokens.js` | AI トークンを要約して保存し、期限と失効を確認する |

主な呼び出し元は `server.js`、`mcp/server.js`、`bin/tw.js`、`public/dashboard/`、`public/admin/` です。
# src の地図

配信イベントを受けて状態を管理し、設定・API・各ウィジェットへ渡すサーバー側の機能です。入口は `runtime.js` で、`hub.js` がイベントを各機能へ配ります。

## ファイル

- `actions.js`: ルーレットなどから呼ぶ動作を検証して実行する。
- `admin.js`: CLI と MCP が共有する管理操作。
- `admin-auth.js`: 管理画面の認証。
- `ai.js`: AI の設定提案。
- `ai-api.js`: AI の HTTP API。
- `ai-mcp.js`: AI の MCP 接続。
- `ai-prompt.js`: AI に渡す指示文。
- `ai-tokens.js`: AI のトークン利用量管理。
- `api-keys.js`: 外部 API キーの保存と取得。
- `billing.js`: 契約・利用状態の管理。
- `boss.js`: ボスの HP と討伐状態。
- `config.js`: YAML 設定の読み書きと検証。
- `cutin-style.js`: 画像付きカットインの切り抜き設定。
- `demo.js`: デモイベントとテストイベントの生成。
- `env.js`: 実行環境の判定。
- `events.js`: 内部イベントバス。
- `gacha.js`: ガチャの抽選と状態。
- `gift-display.js`: ギフト名の表示。
- `gift-names-ja.json`: GiftID と日本語名の対応表。
- `gift-sounds.js`: ギフト別サウンドの状態。
- `gifts.js`: ギフトのコイン計算とカタログ。
- `history.js`: 配信履歴の保存。
- `hub.js`: TikTok イベントの集計と配信。
- `media-alerts.js`: メディア通知の待ち行列。
- `minecraft.js`: Minecraft のルールを RCON へ送る。
- `rcon.js`: RCON クライアント。
- `superstream.js`: Minecraft 側の演出プロフィールを読む。
- `normalize.js`: TikTok イベントを内部形式へそろえる。
- `notes.js`: 配信者メモの保存。
- `pinlogin.js`: PIN ログイン。
- `signkey.js`: 署名鍵の補助。
- `vault.js`: 秘密情報の保存場所との同期。
- `rental.js`: 接続枠の貸し出し判定。
- `tenants.js`: テナントと利用機能の管理。
- `roulette.js`: ルーレットの抽選。
- `runtime.js`: 1配信者分の機能・API・WebSocket を組み立てる入口。
- `rush.js`: RUSH の状態と時間。
- `schema.js`: 設定項目・初期値・説明の定義。
- `slot.js`: スロットの結果と開示状態。
- `stepup.js`: ステップアップ予告の合計・段階・冷却。
- `swarm.js`: 群予告の個数・種類・冷却。
- `tiktok.js`: TikTok LIVE への接続。
- `timer.js`: 延長タイマーの状態。
- `wins.js`: WIN 数の保存と増減。

## 使われ方

`server.js` → `runtime.js` → `hub.js` → 各機能、という順でイベントが流れます。設定の形は `schema.js`、公開画面の配信形は各エンジンの `snapshot()` と `#send()` が決めます。公開ウィジェットは `public/widgets/`、対応テストは `test/` から使います。
サーバー側の設定、配信状態、AI操作、ウィジェットへ渡すイベントを扱います。状態はサーバーに持ち、画面へはWebSocketなどで配ります。

| ファイル | 何をするか |
| --- | --- |
| `ai-screenshot.js` | 開発用テナントのウィジェットを一覧から選び、テスト送信後に撮影する |
| `ai-mcp.js` | AI向けMCPの道具を登録し、開発用撮影の画像を返す |
| `ai-api.js` | AI用HTTP APIの認証、テナント範囲、読み取り・提案・設定・テスト操作と撮影先の安全確認を制御する |
| `ai-tokens.js` | 管理者用トークンと、テナント固定で10件までの配信者用トークンを発行・照合・失効する |
| `runtime.js` | 配信者1人分の状態とテスト送信を動かす |
| `hub.js` | イベントを集め、集計とWebSocket配信を行う |
| `schema.js` | 設定項目・初期値・説明を定義する |
| `*.js` | ギフト、履歴、ルーレット、タイマーなど各機能を分担する |

## つながり

- 使うもの: `server.js` が起動時に作るランタイム、設定、テナント情報
- 使われるところ: `server.js` と `mcp/server.js` がAI用操作を入口から呼ぶ
- 開発用撮影: `ai-mcp.js` → `ai-screenshot.js` → `list_widget_urls` / `test_event` → 既存のPuppeteer環境
サーバー側の集計・配信・設定・履歴の部品です。

| ファイル | 役目 |
| --- | --- |
| `hub.js` | イベントを集計し、通常形式または明示された compact 差分形式で WebSocket 配信する。 |
| `history.js` | 配信履歴を一定間隔または終了時に JSON 保存する。 |
| `ws-mode.js` | WebSocket URL の compact 指定を判定する。 |
| その他の `*.js` | `server.js` から使われる各機能の実装。 |

`server.js` が起動時に runtime と一緒に読み込みます。
サーバー側の接続、イベント処理、設定、配信状態を担当する。来場記録は `runtime.js` から `visitors.js` を使う。

| ファイル | 何をするか |
| --- | --- |
| `visitors.js` | 配信者ごとの秘密鍵で来場者 ID を HMAC 化し、複数設定の最短保存期間・常連回数で通知と匿名記録を管理する |
| `schema.js` | `visitors` を含む設定項目・初期値・説明を定義する |
| `runtime.js` | 来場記録を起動し、設定・API・テスト送信・終了処理につなぐ |
| `demo.js` | `member` を含むテスト用イベントを作る |
| `admin.js` | CLI と MCP からテスト送信を依頼する |
| `ai-mcp.js` | AI 向け MCP のテスト送信の入力を定義する |

## つながり

- 使うもの: `hub.js` の `status` / `event` / `testEvent` / `config`、`config.js` の設定検証
- 使われるところ: `runtime.js`、`mcp/server.js`、`bin/tw.js`
サーバー側の状態管理・設定・外部連携を置くフォルダです。

| ファイル | 役目 |
| --- | --- |
| `combo.js` | コンボの回数・段階・終了イベント・テスト用状態を管理し、Hubへ配る |
| `runtime.js` | 配信者ごとの設定・イベント・各ウィジェットをつなぐ |
| `hub.js` | 本番イベントとテストイベントを分けて配る |
| `schema.js` | 設定項目・初期値・日本語の説明を定義する |

`runtime.js` が `combo.js` と `hub.js` を使い、`public/widgets/combo.html` が `/api/combo` と WebSocket で受け取ります。
サーバー側のイベント処理、設定、配信状態を持つ場所です。カットインの抽選はここで一度だけ行います。

| ファイル | 何をするか |
| --- | --- |
| `cutin-draw.js` | カットインの抽選値を作り、柄・昇格・RUSH格上げの結果を決める |
| `hub.js` | イベントを集め、配る前の準備印を付けて全接続へ配る（準備処理の例外は隔離） |
| `runtime.js` | RUSH状態を見てカットイン抽選値をイベントへ付ける |
| `schema.js` | カットインと段階写真の設定項目・初期値・説明を定義する |
| `config.js` | schema に沿って設定を検証し、初期値を補う |
| `rush.js` | RUSHの状態をサーバーで持つ |

## つながり

- `runtime.js` が `hub.js`、`rush.js`、`cutin-draw.js` をつなぐ。
- `server.js` が runtime を起動し、設定は `schema.js` と `config.js` を通る。
- 公開側の `public/widgets/lib/cutin.js` が `cutinDraw` を受けて表示する。

最後に直した日: 2026-10-21
