#!/usr/bin/env bash
# Cloudflare Tunnel と公開先の名前が、この機械の DNS で引けるか確認する。

status=0
for host in region1.v2.argotunnel.com widget.lul.works; do
  if ! timeout 5s getent ahosts "$host" >/dev/null 2>&1; then
    printf 'DNS 異常: %s の名前を引けません。LuLServer の LAN DNS (192.168.11.60) の応答と /etc/systemd/resolved.conf.d/lul-fallback.conf を確認してください。\n' "$host" >&2
    status=1
  fi
done

if [[ $status == 0 ]]; then
  printf 'Cloudflare Tunnel と widget.lul.works の名前を引けました。\n'
fi
exit "$status"
