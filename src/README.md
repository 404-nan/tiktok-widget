# src/

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
