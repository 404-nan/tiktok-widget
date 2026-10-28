# deploy/server/

lulserver の本番（127.0.0.1:3939）を、再起動の手作業なしで新しくするための仕組みです。

| ファイル | 役目 |
| --- | --- |
| `auto-deploy.sh` | 新しいコミットがあり、誰も配信していなければ（`/healthz` の `live` が 0）、テスト(全体15分・1件2分で打ち切り)が通ったときだけ本番を再起動する |
| `tiktok-widget-deploy.service` | `auto-deploy.sh` を1回動かす systemd のユーザーサービス |
| `tiktok-widget-deploy.timer` | 上のサービスを1分ごとに動かす |
| `tw-flow` | 開発の流れの道具。`status`(本番・開発・まだ入っていないブランチの一覧)、`preview <branch>`(開発サーバー3940をそのブランチにする。テストが通ったときだけ)、`clean`(本番に入り終わったブランチの worktree を片付ける。ブランチは残す) |

- 入れ方: `cp tiktok-widget-deploy.* ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now tiktok-widget-deploy.timer`
- 様子: `journalctl --user -u tiktok-widget-deploy -n 20`。反映したコミットは `~/.local/state/tiktok-widget/deployed`
- 配信中は待ち、終わってから反映します。未コミットの変更があるときも待ちます
- テストが通らなかったコミットは出しません（`~/.local/state/tiktok-widget/last-test.log`）。次のコミットでもう一度試します
- `tw-flow` は `ln -s ~/tiktok-widget/deploy/server/tw-flow ~/.local/bin/tw-flow` で入れる。本番には触らない

最後に直した日: 2026-10-21
