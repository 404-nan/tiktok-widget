# 引き継ぎ書 — tiktok-widget 開発

作成日: 2026-10-15
作成者: マリー (めにくんのAI相棒)

このファイルは Grok CLI (GrokBot) から Claude Code への開発引き継ぎ書。
Claude Code は作業開始前にこのファイルと `AGENTS.md` / `CLAUDE.md` を読むこと。

## プロジェクト概要

- **tiktok-widget**: TikTok配信用ウィジェット (Node.js ESM + express)
- 本体: `~/tiktok-widget` (branch: `claude/tiktok-widgets-2qpqbk`)
- 用途: TikTokライブ配信の演出 — ルーレット、ガチャ、カットイン、RUSH(確変)、ボス、メディアアラート、履歴・統計

## 開発ルール（厳守）

- UIは全部日本語
- 公開ウィジェットJS (`public/widgets/`) は **ES5**
- `config.yaml` と `data/` は絶対に触らない
- commitはするが **pushはしない**
- `npm test` (`node --test`) を常に緑に保つ
- ギフト名は必ず日本語表示 (`src/gift-names-ja.json` の対応表を使う。詳細は `AGENTS.md`)

## 現在の状態 (2026-10-15 15:16 JST 検証済み)

- 全worktreeクリーン (未コミット変更なし)
- cutinブランチ (`dev/cutin-styles`): 最新 `19716bd`「カットインに縞フレームと写真切り抜き」、テスト **259/259 緑**
- `config.yaml` と `data/` は無事

## worktree一覧

| worktree | branch | 最新コミット |
|---|---|---|
| `~/tiktok-widget` | `claude/tiktok-widgets-2qpqbk` | `d03dd38` |
| `~/tiktok-widget-dev` | `dev/monitor-status-fix` | `8e3fad3` |
| `~/tiktok-widget-dev-admin` | `dev/lul-admin` | `3874afe` |
| `~/tiktok-widget-dev-billing` | (detached HEAD) | `385dee1` |
| `~/tiktok-widget-dev-cutin` | `dev/cutin-styles` | `19716bd` |
| `~/tiktok-widget-dev-feat` | `dev/features-4` | `4b889aa` |
| `~/tiktok-widget-dev-random` | `dev/random-fx` | `4b889aa` |
| `~/tiktok-widget-dev-rush` | `dev/rush-roulette-odds` | `73de5c8` |
| `~/tiktok-widget-dev-staging` | `staging/reconnect-jp-names` | `3847fdf` |
| `~/tiktok-widget-dev-styles` | `dev/dashboard-styles` | `7fab7da` |

- `~/tiktok-widget-dev-data` はgitリポジトリではなくデータ用ディレクトリ (`config.yaml`、`data/` 等)
- `~/tiktok-widget-data-backup-*` が22件・合計約20M溜まっている (整理は未実施)

## 直近の作業領域

ルーレット、ガチャ、カットイン演出、履歴・統計、RUSH、ボス、メディアアラート

## オーケストレーション構成 (2026-10-15〜)

- **親 (orchestrator)**: このClaude Code (Opus 5.5)
- **子 (workers)**: Claude Code の subagents (Task tool)。必要に応じてworktreeを分けて並行作業
- 旧構成 (Grok CLIがCopilotとしてClaude Code/Codex/GrokBuildへ命令) は廃止
- Grokの全データは `~/grok-export-20261015-063257.tar.gz` にエクスポート済み (auth.json除く)。再取得は `~/grok-export-all.sh`

## 次の一手の候補

1. cutinブランチ (`dev/cutin-styles`) の続き確認・マージ判断
2. 各devブランチのレビューと本体への統合
3. `tiktok-widget-data-backup-*` 22件の整理 (削除前に中身確認のこと)

最終判断はめにくん。迷ったら聞くか、最も安全な一手を選ぶこと。
