# 操作方法

## CLI

`npm run tw -- <command>` または `node bin/tw.js <command>` を使う。

- 設定: `reference`, `get`, `set`, `merge`, `unset`, `validate`
- 確認: `urls`, `gifts`, `media`, `media add <url> [name]`, `status`, `history [id]`
- テスト: `test gift|like|follow|share|chat`, `spin [id]`, `rush [start|stop]`
- 状態操作: `win`, `wins`, `timer`, `boss`。各コマンドの詳しい引数は `bin/tw.js` のHELPを見る。
- Minecraft: `superstream`, `mc <command>`。連携が有効な開発環境だけで試す。

## MCP

- 起動は `npm run mcp`。登録例は `npm run tw -- mcp` で表示する。
- 主な道具は `get_config_reference`、`get_config`、`set_config`、`merge_config`、`delete_config`、`replace_config`、`validate_config`。
- 表示・確認は `list_widget_urls`、`list_gifts`、`list_media`、`get_history`、`get_status`。
- 動作確認は `test_event`、`spin_roulette`、`wins`、`timer`、`boss`、`rush`、`list_superstream_actions`、`minecraft_command`。
- 最初に設定の説明を読み、現在値を確認してから小さく変更する。保存前に検証されるが、変更後もテストする。

## エージェント用の MCP(LuLServer)

- LuLServer の Claude Code と Codex には `tiktok-widget-dev` が登録してある。中身は `~/.local/bin/tw-dev-mcp` で、`TW_SERVER=http://127.0.0.1:3940`(開発サーバー)に固定し、リモートモード(`/ai/v1`)で動く。
- トークンは `~/.config/tiktok-widget/dev-agent.env` に置く(開発の管理画面で、テスト用の配信者に発行したもの。権限 600)。無ければ起動せずに理由を出す。
- 開発サーバーは `~/tiktok-widget-wt/dev`(本体のブランチの最新を detached で置いた worktree)から動く。データは `~/tiktok-widget-dev-data` で、本番とは別。

## 接続先と安全柵

- CLI/MCPが見るHTTPサーバーは `TW_SERVER`。既定は `http://127.0.0.1:3939`。開発では3940などを明示する。
- リモートAI用MCPは `TW_SERVER` と `TW_AI_TOKEN` が両方あると `/ai/v1` を呼ぶ。トークンの値は文書・ログに書かない。
- `/ai/v1` はBearerトークン、scope、テナント範囲で制限する。読み取り、書き込み、操作、テスト、管理、課金申請を分ける。
- 本番の書き込みは `TW_AI_WRITE=on` が必要。配信中の接続・切断・再起動や秘密の設定変更はAI APIからできない。
- 課金変更は即時適用ではなく申請・承認の流れ。監査記録と取り消し用の状態を残す。

## テスト送信

- `test_event` とCLIの `test` は画面確認用。配信中は画面とルーレット表示だけに流れ、集計、ランキング、WIN数、タイマー、ボス、Minecraft、履歴を変えない。
- 配信前のテスト・デモで増えた一時集計は、LIVE接続開始時にリセットされる。永続状態のWIN数・タイマー・ボスは別扱い。
