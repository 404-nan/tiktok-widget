#!/usr/bin/env bash
# Cloudflare Tunnel と公開先の名前が、この機械の DNS で引けるか確認する。

check_srv() {
  local name=$1 answers type target
  if command -v resolvectl >/dev/null; then
    timeout 5s resolvectl --type=SRV query "$name" >/dev/null 2>&1 && return 0
  fi
  if command -v dig >/dev/null; then
    answers=$(timeout 5s dig +noall +answer -t SRV "$name" 2>/dev/null) || return 1
    while read -r _ _ _ type _ _ _ target; do
      [[ $type == SRV && -n $target && $target != . ]] && return 0
    done <<< "$answers"
  elif ! command -v resolvectl >/dev/null; then
    printf 'SRV の確認には resolvectl または dig が必要です。\n' >&2
  fi
  return 1
}

report_failure() {
  printf 'DNS 異常: %s の名前を引けません。LuLServer の LAN DNS (192.168.11.60) の応答と /etc/systemd/resolved.conf.d/lul-fallback.conf を確認してください。\n' "$1" >&2
  status=1
}

status=0
for host in region1.v2.argotunnel.com widget.lul.works; do
  if ! timeout 5s getent ahosts "$host" >/dev/null 2>&1; then
    report_failure "$host"
  fi
done

srv=_v2-origintunneld._tcp.argotunnel.com
check_srv "$srv" || report_failure "$srv"

if [[ $status == 0 ]]; then
  printf 'Cloudflare Tunnel の接続先（SRV を含む）と widget.lul.works の名前を引けました。\n'
fi
exit "$status"
