#!/bin/bash
# 死活の見張り（2026-11-22）。healthz を見て、3回続けて落ちていたら診断の束を残す。
# LuLServer で利用者タイマー（2分ごと）から回す。自動では戻さない（診断と記録まで）。
STATE=~/backups/health-watch.state
INCIDENTS=~/backups/incidents
mkdir -p "$INCIDENTS"
count=0; reported=""
[ -f "$STATE" ] && { count=$(sed -n 's/^count=\([0-9]*\)$/\1/p' "$STATE"); reported=$(sed -n 's/^reported=//p' "$STATE"); }
if curl -sf -m 5 http://127.0.0.1:3939/healthz >/dev/null 2>&1; then
  printf 'count=0\nreported=\n' > "$STATE"
  exit 0
fi
count=$((count + 1))
if [ "$count" -ge 3 ] && [ -z "$reported" ]; then
  ts=$(date +%Y%m%d-%H%M%S)
  dir="$INCIDENTS/$ts"
  mkdir -p "$dir"
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  (cd ~/tiktok-widget && git log --oneline -3 && git status --porcelain | head -20) > "$dir/git.txt" 2>&1
  systemctl --user status tiktok-widget.service --no-pager > "$dir/service.txt" 2>&1
  journalctl --user -u tiktok-widget.service -n 200 --no-pager > "$dir/journal.txt" 2>&1
  ss -tnp 2>/dev/null | head -30 > "$dir/connections.txt"
  curl -s -m 5 http://127.0.0.1:3939/healthz > "$dir/healthz.txt" 2>&1
  echo "healthz が $count 回続けて返らない。診断の束: $dir" > "$dir/INCIDENT.txt"
  reported="$ts"
fi
printf 'count=%s\nreported=%s\n' "$count" "$reported" > "$STATE"
