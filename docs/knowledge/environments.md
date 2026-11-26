# 環境

## 本番・開発・トンネル

- 本番サービスは `PORT=3939`、待受は通常 `127.0.0.1`、公開名は `widget.lul.works`。
- 開発サービスは `PORT=3940`。設定は `TW_CONFIG`、記録は `TW_DATA`、必要なら `TW_ENV=dev` を使う。ただし開発サーバー 3940 と `dev.lul.works` は止まっていると記録されている（2026-11-27 の棚卸し）。
- トンネルサービスはCloudflare Tunnel。アプリを再起動するものではなく、公開URLを本番アプリへ転送する。
- systemd のサービス定義は `tiktok-widget.service`、`tiktok-widget-dev.service`、`tiktok-widget-tunnel.service`。値や鍵はこの文書に書かない。

## 判定とデータ

- 既定ポートは3939。`TW_ENV=dev` だけでは開発扱いにならず、ポートが3939以外で、本番ホストでないことも必要。
- 判定の実装は `src/env.js`。不明・例外時は本番扱い（fail closed）。
- データの場所を変える環境変数は `TW_DATA`、設定ファイルは `TW_CONFIG`。ホストとポートは `HOST`、`PORT`。
- `TW_HOSTED` はテナント公開モード、`TW_RENTAL_STATE` と `TW_RENTAL_AUTOCONNECT` は運用環境の補助設定。
- `TW_AI_KEY`、`TW_AI_PROVIDER`、`TW_AI_MODEL`、`TW_AI_BASE_URL` はAI接続設定の名前だけを示す。値は書かない。

## 公開 healthz

- `/healthz` は Cloudflare の稼働確認から認証なしで呼ぶ公開口。
- `ok` と `live`（配信中またはつなぎ直し中の配信者数）に加え、起動した時の `version`（`package.json` の製品版数）と `commit`（動いている木のコミット。読めなければ `null`）を返す。配信者名や ID は返さない。リポジトリは公開で、版数とコミットは秘密ではない。
- `demo` と `idle` は `live` に数えない。配信が `live` から `connecting` / `error` になった場合は、最後に `live` だった時刻から15分未満だけ同じ配信として数える。手動切断・配信終了で猶予は消える。公開人数を変えるときは [healthz-live カード](../cards/healthz-live.md) も更新する。

## 本番への反映

- 自動反映（`deploy/server/auto-deploy.sh` と `tiktok-widget-deploy.timer`）は 2026-11-18 ごろから止めてあると記録されている（2026-11-27 の棚卸し）。動かし直すかはオーナーが決める。
- 今の反映は手で回す `scripts/deploy-release.sh <入れる枝>`。配信者がいない時に、オーナーの許可を取って回す。入れる側の一時 worktree で `scripts/release-check.mjs` の速い関門を通し（`--with-tests` を付けた時だけ全体テストも）、早送り・再起動のあと `/healthz` の `version` と `commit` が入れた物と同じになるまで確かめる。
- 戻すときは `scripts/rollback-release.sh`。台帳の失敗した投入ではなく、いちばん新しい `verified` の投入の `from` へ戻し、戻したあとも `/healthz` の `commit` で確かめる。版とコミットを返せない古いサーバーへ戻す時だけ、応答と木のコミットを合わせる移行用の確認になる。
- 切断直後の誤再起動を防ぐため、`/healthz` は最後に `live` だった時刻から15分未満の `connecting` / `error` も配信中に数える。
- 外部取り込み用のリポジトリ（raikone-widgets）の main へは、取り込みの定期処理を止めるまでマージしない（本番の部品が古い版へ巻き戻るおそれ。2026-11-27 の棚卸し）。

## 配信中の禁止事項

- 本番サービスを止めない、再起動しない、`/reload` を実行しない。
- 本番の `config.yaml`、`data/`、テナント設定、接続設定を開発確認のために変更しない。
- 確認は専用の一時ディレクトリ・一時ポートで行う。開発サーバー（3940）が再開された時だけ、開発サーバーも使う。

## TikTok への接続(配信者ごと)

- 配信していないあいだは、OBS / TikTok LIVE Studio 用の鍵でウィジェットが開いているときだけ、署名なしの公開プロフィールHTML/API判定を行う。最初の30分は1分ごと、その後は5分ごとに確かめ、始まったときだけ Euler 署名でつなぐ。公開窓口が読めない・ブロックされたときは probe を止め、従来のEuler接続へ戻す。ウィジェットが閉じていれば試すのを止め、開いた瞬間に再開する
- 配信中に切れたときは、ウィジェットが開いていなくても今までどおり再接続する
- 1人用(local)は今までどおり、ずっと試し続ける
- Euler の呼び出し数は `data/euler-usage.json` に日付・配信者・種類別で残り、`tw euler-usage` または `/api/euler-usage` で確認できる。鍵や個人情報は記録しない
