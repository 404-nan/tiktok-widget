# src/

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
