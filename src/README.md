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
サーバー側のイベント処理、設定、TikTok接続、配信者ごとのruntimeを置くフォルダです。

| ファイル | 役目 |
| --- | --- |
| `actions.js` | 設定されたイベントアクションを実行する |
| `admin.js` | 管理画面とCLIから使う設定操作をまとめる |
| `admin-auth.js` | 管理画面の認証を行う |
| `ai.js` | AIプロバイダーの設定と呼び出しを扱う |
| `ai-api.js` | AI向けAPIのルートを提供する |
| `ai-mcp.js` | AI向けMCP操作を提供する |
| `ai-prompt.js` | AIに渡すシステム指示を定義する |
| `ai-tokens.js` | 外部AI用トークンを安全に保存・照合する |
| `api-keys.js` | APIキーを管理する |
| `billing.js` | 利用制限と課金状態を扱う |
| `boss.js` | ボス討伐の状態とイベントを管理する |
| `config.js` | YAML設定の読み書きと検証を行う |
| `cutin-style.js` | カットインの見た目設定を扱う |
| `demo.js` | デモイベントとテスト送信を作る |
| `env.js` | 実行環境を判定する |
| `events.js` | 共通イベントバスを提供する |
| `gacha.js` | ガチャの抽選と状態を管理する |
| `gift-coins.json` | ギフトIDごとのコイン数を定義する |
| `gift-display.js` | ギフトの表示情報を作る |
| `gift-names-ja.json` | GiftIDと日本語ギフト名を対応付ける |
| `gifts.js` | ギフトの集計とルールを処理する |
| `gift-sounds.js` | ギフト音の再生状態を管理する |
| `history.js` | 配信履歴を保存・取得する |
| `hub.js` | イベントを集計し、接続中の画面へ配信する |
| `ingest.js` | 外部ツールからイベントを受け、重複・直接接続との競合を整理してhubへ流す |
| `ingest-keys.js` | 外部イベント受け口の鍵を保存・照合する |
| `media-alerts.js` | メディア付き通知を管理する |
| `minecraft.js` | Minecraft連携のルールを処理する |
| `normalize.js` | TikTokと外部入力を画面用イベントへ正規化する |
| `notes.js` | 管理用メモを保存する |
| `pinlogin.js` | 短いURLの4桁PINログインを扱う |
| `rcon.js` | Minecraft RCONへ接続する |
| `rental.js` | 配信者の利用期間を管理する |
| `roulette.js` | ルーレットの抽選を行う |
| `runtime.js` | 配信者1人分の接続・API・集計を組み立てる |
| `rush.js` | RUSHモードの状態を管理する |
| `schema.js` | 設定項目と検証ルールを定義する |
| `signkey.js` | TikTok署名サービスの鍵を管理する |
| `slot.js` | スロットの抽選と結果を処理する |
| `superstream.js` | Minecraft演出プロフィールを読む |
| `tenants.js` | 配信者一覧、runtime、配信者ごとの鍵を管理する |
| `tiktok.js` | tiktok-live-connectorでLIVEへ接続し、TikTok由来の印を付ける |
| `timer.js` | 延長タイマーの状態と操作を管理する |
| `vault.js` | Cloudflare環境のデータ退避と復元を行う |
| `wins.js` | WIN数の状態と操作を管理する |

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
