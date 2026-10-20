# 環境

## 本番・開発・トンネル

- 本番サービスは `PORT=3939`、待受は通常 `127.0.0.1`、公開名は `widget.lul.works`。
- 開発サービスは `PORT=3940`。設定は `TW_CONFIG`、記録は `TW_DATA`、必要なら `TW_ENV=dev` を使う。
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
- `ok` と `live`（配信中またはつなぎ直し中の配信者数）だけを返し、配信者名や ID は返さない。
- `demo` と `idle` は `live` に数えない。公開人数を変えるときは [healthz-live カード](../cards/healthz-live.md) も更新する。

## 本番への反映

- `tiktok-widget-deploy.timer` が1分ごとに `deploy/server/auto-deploy.sh` を動かす。`~/tiktok-widget` の HEAD が進み、未コミットの変更がなく、`/healthz` の `live` が 0 なら、`npm test` を通してから本番を再起動する。
- 手で再起動しない。本番に出したいものは `~/tiktok-widget` にコミットすれば、配信が終わったあとに入る。

## 配信中の禁止事項

- 本番サービスを止めない、再起動しない、`/reload` を実行しない。
- 本番の `config.yaml`、`data/`、テナント設定、接続設定を開発確認のために変更しない。
- 確認は開発サーバー（3940）か、専用の一時ディレクトリ・一時ポートで行う。
