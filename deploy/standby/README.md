# ライコネの一時起動

本番ホストが止まった間だけ、Manus などの Debian / Ubuntu 系 Linux 機（x86_64・arm64）で使う手順です。公開先を切り替える前に、元のホストで配信中のライコネが動いていないことを確認してください。

- `setup.sh`: ライコネを本番と同じ hosted モードで起動し、Cloudflare Tunnel で公開します。systemd は使わず、機械が動いている間はプロセスが落ちても起こし直します。

```bash
curl -fsSL https://raw.githubusercontent.com/404-nan/tiktok-widget/dev/standby-host/deploy/standby/setup.sh | bash
```

- 既定は本番の 1.4.2（`e2a303d`）。版を変えるときは右側を `REF=<版やブランチ> bash` にします。待ち受けは `127.0.0.1:3939`（確認用には `PORT` を変更可能）。
- 配信者・設定・履歴を引き継ぐ場合は、**最初の起動前**に、最上位に `data/` と任意の `config.yaml` があるバックアップを用意します。手元の tar.gz は右側を `DATA_TARBALL=/path/to/backup.tar.gz bash` にします。保護された HTTPS のダウンロード先なら `DATA_URL` でも渡せます。バックアップを一般に公開したり、ダウンロードの鍵をチャットに貼ったりしないでください。同じ保存先の `data/` があるときは上書きしません。
- 一時 URL は最後に表示され、`~/.local/share/raikone-standby/url.txt` に保存されます。トンネルが起動し直すと URL は変わります。決まったドメインを使うときは Cloudflare 側で公開先を `http://127.0.0.1:3939` に設定し、`TUNNEL_TOKEN` を秘密の環境変数として渡します。その場合は表示に従い、自分で公開側の `/healthz` も確認します。元のホストと同じトンネルを同時に動かさないでください。
- 合言葉のファイル・ログは起動先に残り、停止方法は起動後に表示されます。停止は `bash ~/.local/share/raikone-standby/run.sh stop`。停止してもデータは消えません。端末を閉じても動きますが、機械が停止・再起動したときは起動コマンドを実行し直します。
