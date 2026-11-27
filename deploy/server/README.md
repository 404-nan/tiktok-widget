# deploy/server/

lulserver の本番（127.0.0.1:3939）と開発サーバーに関わる反映の部品を置くフォルダです。今の本番反映は、このフォルダの自動反映ではなく `scripts/deploy-release.sh` を手で回す形です。

| ファイル | 役目 |
| --- | --- |
| `auto-deploy.sh` | 止めてある自動反映の本体。新しいコミット・版数・お知らせ・配信中でないこと・テスト（一時フォルダは自動で消す）を見て本番を再起動する形 |
| `dns-check.sh` | Cloudflare Tunnel の接続先と公開ドメインを名前解決できるか確認する |
| `tiktok-widget-deploy.service` | `auto-deploy.sh` を1回動かす systemd のユーザーサービス |
| `tiktok-widget-deploy.timer` | 上のサービスを1分ごとに動かすタイマー（今は止めてある） |
| `tw-flow` | 開発の流れの道具。`status`(本番・開発・まだ入っていないブランチの一覧)、`preview <branch>`(開発サーバー3940をそのブランチにする。テストが通ったときだけ)、`clean`(本番に入り終わったブランチの worktree を片付ける。ブランチは残す) |

## 今の運用（2026-11-27 の棚卸し）

- 自動反映（`auto-deploy.sh` とタイマー）は 2026-11-18 ごろから止めてあると記録されている。動かし直すかはオーナーが決める
- 本番へ出す時は、配信者がいない時にオーナーの許可を取って `scripts/deploy-release.sh <入れる枝>` を回す。既定では速い関門だけ、`--with-tests` を付けた時は全体テストも通す
- 開発サーバー 3940 と `dev.lul.works` は止まっていると記録されている。`tw-flow preview` は開発サーバーを再開してから使う
- 外部取り込み用のリポジトリ（raikone-widgets）の main へは、取り込みの定期処理を止めるまでマージしない（本番の部品が古い版へ巻き戻るおそれ）

## 止めてある自動反映を動かし直す場合

- 入れ方: `cp tiktok-widget-deploy.* ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now tiktok-widget-deploy.timer`
- 様子: `journalctl --user -u tiktok-widget-deploy -n 20`。反映したコミットは `~/.local/state/tiktok-widget/deployed`
- 配信中は待ち、終わってから反映する。未コミットの変更があるときも待つ
- バージョンが上がっていない・お知らせが無い変更は反映しない（待ち続ける）。本番に出すときは `docs/VERSIONING.md` の「リリースの手順」どおり、版数を上げて `src/announcements.json` の先頭にお知らせを足し、同じ保存に含めること
- テストが通らなかったコミットは出さない（`~/.local/state/tiktok-widget/last-test.log`）。次のコミットでもう一度試す
- `tw-flow` は `ln -s ~/tiktok-widget/deploy/server/tw-flow ~/.local/bin/tw-flow` で入れる。本番には触らない

## Cloudflare 1033 が出た場合の DNS 診断

LuLServer 上のリポジトリで `bash deploy/server/dns-check.sh` を実行します。`region1.v2.argotunnel.com` と `widget.lul.works` のアドレスに加え、cloudflared が接続先を見つけるための `_v2-origintunneld._tcp.argotunnel.com` の SRV レコードを確認します。SRV は `resolvectl` で確認し、使えないか応答が得られなければ、利用できる場合に `dig` でも確認します。接続先が `.`（サービスなし）だけの応答は失敗とします。各照会は最大5秒です。失敗した名前と確認先を表示し、終了コード1を返します。設定は変更せず、サービスも再起動しません。

既存の死活の見張りはローカルの `/healthz` を使うため、ライコネ本体が動いていてトンネルだけ落ちた場合を検知しません。この DNS 診断は別に実行してください。成功してもトンネルへの接続や HTTP 応答を保証するものではありません。

最後に直した日: 2026-11-28
