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
