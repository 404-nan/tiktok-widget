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
