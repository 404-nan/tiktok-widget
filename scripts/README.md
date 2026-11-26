# scripts/

運用補助・データ作成・性能計測のスクリプトを置くフォルダです。

| ファイル / フォルダ | 役目 |
| --- | --- |
| `build-gift-names.js` | ギフト名の対応表を生成する |
| `giftlist.js` | TikTok の gift/list API からギフト一覧を取り込む（既存の名前は残し、コインを更新してブラウザ用の表も作り直す） |
| `fixtures/` | リハーサル用の設定・記録データ |
| `perf/` | 本番・開発サーバーから隔離して性能を測る道具 |
| `rehearse*.mjs` / `rehearse.sh` | リハーサルの収集と報告を行う |
| `release-check.mjs` | 出す前の関門を一続きで回す（一時置き場の空き・全体テスト・版数とお知らせの対応・保存形式の後方互換の材料。テストの一時フォルダは自動で消す）。`deploy-release.sh` から入れる側の一時 worktree で呼ばれる |
| `quiet-hours.mjs` | 配信の記録から、曜日ごとの静かな時間帯といちばん近い静かな時間を読み取り専用で出す |
| `prod-tree-check.sh` | 本番の作業ツリーに未保存の変更が無いかを見る |
| `deploy-release.sh` | 本番への投入。配信が無いことの確認・入れる側の一時 worktree での関門・未保存変更の退避と復帰・出来事ごとの台帳・早送り・再起動・`/healthz` の `version` と `commit` での確認。既定は速い関門だけ、`--with-tests` で全体テストも回す |
| `rollback-release.sh` | 台帳にあるいちばん新しい `verified` の投入の `from` へ戻し、`/healthz` の `commit` で確かめる。失敗した投入は戻し先にしない。版とコミットを返せない古いサーバーへ戻す時だけ、応答と木のコミットを合わせる移行用の確認になる |
| `health-watch.sh` / `systemd/` | 死活の見張り。healthz が3回続けて返らなければ診断の束を残し、設定された知らせ口へ届ける。自動復帰は既定ではしない。利用者タイマーで2分ごとに回す |

## health-watch.sh の変数

既定では今までどおり本番の `http://127.0.0.1:3939/healthz` を見て、状態を `~/backups` に置きます。試験や置き場の違う機械では、次の変数で差し替えられます。

| 変数 | 既定 | 意味 |
| --- | --- | --- |
| `TW_HEALTHZ_URL` | `http://127.0.0.1:3939/healthz` | 見る healthz の URL |
| `TW_HEALTH_STATE_DIR` | `~/backups` | `health-watch.state`、`incidents/`、`ops-status.json` を置く場所 |
| `TW_APP_DIR` | `~/tiktok-widget` | 版数とコミットを読む場所 |
| `TW_HEALTH_NOTIFY_CMD` | 空（知らせない） | 知らせる命令。固定の引数を含められ、最後に本文が1つの引数として渡る。命令が失敗しても見張りは止めない。命令の中身はこのリポジトリに書かず、動かす機械側で入れる |
| `TW_HEALTH_AUTORESTART` | 空（自動復帰しない） | `1` のときだけ自動復帰を試す |
| `TW_RESTART_CMD` | `systemctl --user restart tiktok-widget.service` | 自動復帰で呼ぶ命令 |
| `TW_HEALTH_RESTART_WAIT_SECONDS` | `15` | 再起動後に healthz の復帰を待つ秒数。主に試験で短くする |
| `TW_HEALTH_NOW` | 空（実際の時計） | 試験用の時刻（Unix 時間）。15分の間隔を確かめるときに使う |

## 知らせる時

同じ障害では、それぞれ1回だけ知らせます。元気な間は何も送りません。

1. 3回続けて応答が無い（約6分）とき: 「ライコネが応答していません（6 分）。診断を残しました: <束の名前>」
2. 自動復帰を試したとき: 「自動で再起動しました。結果: 戻りました／戻りませんでした」
3. 応答が戻ったとき: 「ライコネが戻りました（落ちていた時間: 約 N 分）」。1〜2回で戻り、落ちた知らせを出していない短い失敗では送りません

文には、鍵・URLの鍵の部分・配信者の名前を入れません。

## 自動復帰

自動復帰は既定で切ってあります。`TW_HEALTH_AUTORESTART=1` を動かす機械側で入れた時だけ動きます。

- 3回続けて healthz が応答しない時だけ試す。healthz が 200 を返している間は、何があっても再起動しない
- 同じ障害では1回だけ試す
- 再起動の前に必ず診断の束を残す。束を作れない時は再起動しない
- 暴走を止めるため、再起動は15分に1回まで。最後に呼んだ時刻は障害が直っても残り、次の障害にも効く
- 再起動後は最大15秒だけ healthz の復帰を待ち、結果を知らせる

## 状態ファイル

`health-watch.state` には `count` と `reported` に加えて、落ち始めた時刻 `down_since`、落ちたことを知らせ済みか `down_notified`、この障害で自動復帰を試したか `restart_attempted`、結果を知らせ済みか `restart_notified`、最後に再起動した時刻 `last_restart_at` を書きます。前の形（`count=` と `reported=` だけ）のファイルも読めます。

## つながり

`perf/` は `server.js` と `public/widgets/` を読みますが、計測時は一時設定・一時データ・一時ポートだけを使います。

`deploy-release.sh` と `rollback-release.sh` は、試験のために台帳 `TW_RELEASE_LEDGER`、確認先 `TW_HEALTHZ_URL`、再起動命令 `TW_RESTART_CMD`、確認の秒数 `TW_VERIFY_TIMEOUT`（既定30秒）を差し替えられます。本番では差し替えず、既定の `~/backups/RELEASE-LEDGER.jsonl`・`http://127.0.0.1:3939/healthz`・`systemctl --user restart tiktok-widget.service` を使います。

最後に直した日: 2026-11-27
