# 構成

## 全体

- 起動入口は `server.js`。Express と HTTP サーバーを作り、静的ファイル、API、WebSocket を載せる。
- `src/runtime.js` が1人用またはテナントごとの実行単位を作る。イベントを `src/hub.js` に集める。
- TikTok のイベントは正規化して集計し、履歴、ルーレット、タイマー、WIN数、ボス、Minecraft へ配る。
- WebSocket は `/ws`（1人用）または `/t/<鍵>/ws`（テナント用）。接続時に状態・公開設定・最近のコメントを送り、その後のイベントを全接続へ配る。
- `hub.js` はサーバー側に状態を持つ。OBS の再読み込み後も、サーバーの状態から表示を再開する。

## テナント、設定、保存

- テナント一覧は `data/tenants.json`、個別の設定と記録は `data/tenants/<id>/` に置く。
- 1人用は `config.yaml` と `data/`。公開モードでは管理画面とテナントURLを使う。
- 設定の項目・初期値・型・説明は `src/schema.js`。読み書きと検証は `src/config.js`。
- 秘密を含む設定は公開用に削る。AI、WebSocket、ウィジェットへは `publicConfig` 相当の値だけを渡す。

## 画面とウィジェット

- `public/widgets/`: OBS / TikTok LIVE Studio の公開ウィジェット。公開JSはES5を守る。
- `public/dashboard/`: 設定画面。`/dashboard/` は1人用、テナントは `/t/<鍵>/dashboard/`。
- `public/monitor/`、`public/history/`、`public/admin/`: モニター、統計、管理画面。
- ウィジェットの設定URLや推奨サイズは設定と schema から作る。テナントのOBS鍵はウィジェットだけに許可する。

## AI、課金、Minecraft

- `src/ai.js` は管理画面の「AIにたのむ」。案を検証してから人が承認し、undoできる。秘密やMinecraft接続情報は送らない。
- `src/ai-api.js` と `src/ai-mcp.js` はBearerトークン付きの `/ai/v1` と `/ai/mcp`。操作範囲、配信中の変更、課金申請を分け、監査と承認を残す。
- `src/billing.js` と `src/tenants.js` が利用状態とウィジェットの利用可否を管理する。未払い等でOBS接続を静かにできる。
- `src/minecraft.js` はギフト、ルーレット、ボス討伐のルールをRCONへ送る。`src/superstream.js` はSuperStreamの演出を解決する。

## 主な地図

- 入力・接続: `src/tiktok.js`, `src/normalize.js`, `src/hub.js`
- 機能: `src/roulette.js`, `src/timer.js`, `src/wins.js`, `src/boss.js`, `src/rush.js`, `src/gacha.js`（おみくじも同じクラス）, `src/slot.js`
- 機能: `src/roulette.js`, `src/timer.js`, `src/wins.js`, `src/boss.js`, `src/rush.js`, `src/stepup.js`, `src/swarm.js`, `src/gacha.js`, `src/slot.js`
- 操作: `mcp/server.js`, `bin/tw.js`, `src/admin.js`
- 公開画面: `public/`。仕様と判断は [docs/DESIGN.md](../../docs/DESIGN.md)、[docs/IDEAS.md](../../docs/IDEAS.md) にある。
