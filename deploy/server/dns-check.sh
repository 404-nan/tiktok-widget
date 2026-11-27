#!/usr/bin/env bash
# Cloudflare Tunnel と公開先の名前が、この機械の DNS で引けるか確認する。

has_srv_target() {
  local line record='^[^[:space:]]+[[:space:]]+([0-9]+[[:space:]]+)?IN[[:space:]]+SRV[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+([^[:space:]]+)'
  while IFS= read -r line; do
    [[ $line =~ $record && ${BASH_REMATCH[2]} != . ]] && return 0
  done <<< "$1"
  return 1
}

check_srv() {
  local name=$1 answers
  if command -v resolvectl >/dev/null &&
    answers=$(timeout 5s resolvectl --type=SRV query "$name" 2>/dev/null); then
    has_srv_target "$answers"
    return
  fi
  if command -v dig >/dev/null; then
    answers=$(timeout 5s dig +noall +answer -t SRV "$name" 2>/dev/null) || return 1
    has_srv_target "$answers"
    return
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
