# scripts/

運用補助・データ作成・性能計測のスクリプトを置くフォルダです。

| ファイル / フォルダ | 役目 |
| --- | --- |
| `build-gift-names.js` | ギフト名の対応表を生成する |
| `giftlist.js` | TikTok の gift/list API からギフト一覧を取り込む（既存の名前は残し、コインを更新してブラウザ用の表も作り直す） |
| `fixtures/` | リハーサル用の設定・記録データ |
| `perf/` | 本番・開発サーバーから隔離して性能を測る道具 |
| `rehearse*.mjs` / `rehearse.sh` | リハーサルの収集と報告を行う |
| `release-check.mjs` | 出す前の関門を一続きで回す（一時置き場の空き・全体テスト・版数とお知らせの対応・保存形式の後方互換の材料）。`deploy-release.sh` から入れる側の一時 worktree で呼ばれる |
| `prod-tree-check.sh` | 本番の作業ツリーに未保存の変更が無いかを見る |
| `deploy-release.sh` | 本番への投入。配信が無いことの確認・入れる側の一時 worktree での関門・未保存変更の退避と復帰・出来事ごとの台帳・早送り・再起動・`/healthz` の `version` と `commit` での確認。既定は速い関門だけ、`--with-tests` で全体テストも回す |
| `rollback-release.sh` | 台帳にあるいちばん新しい `verified` の投入の `from` へ戻し、`/healthz` の `commit` で確かめる。失敗した投入は戻し先にしない。版とコミットを返せない古いサーバーへ戻す時だけ、応答と木のコミットを合わせる移行用の確認になる |
| `health-watch.sh` / `systemd/` | 死活の見張り。healthz が3回続けて返らなければ診断の束を ~/backups/incidents/ に残す。利用者タイマーで2分ごとに回す |

## つながり

`perf/` は `server.js` と `public/widgets/` を読みますが、計測時は一時設定・一時データ・一時ポートだけを使います。

`deploy-release.sh` と `rollback-release.sh` は、試験のために台帳 `TW_RELEASE_LEDGER`、確認先 `TW_HEALTHZ_URL`、再起動命令 `TW_RESTART_CMD`、確認の秒数 `TW_VERIFY_TIMEOUT`（既定30秒）を差し替えられます。本番では差し替えず、既定の `~/backups/RELEASE-LEDGER.jsonl`・`http://127.0.0.1:3939/healthz`・`systemctl --user restart tiktok-widget.service` を使います。

最後に直した日: 2026-11-27
