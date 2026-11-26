#!/bin/bash
# 死活の見張り（2026-11-22）。healthz を見て、3回続けて落ちていたら診断の束を残し、設定された知らせ口へ届ける。
# LuLServer で利用者タイマー（2分ごと）から回す。自動復帰は TW_HEALTH_AUTORESTART=1 のときだけで、既定ではしない。
HEALTHZ_URL=${TW_HEALTHZ_URL:-http://127.0.0.1:3939/healthz}
STATE_DIR=${TW_HEALTH_STATE_DIR:-$HOME/backups}
APP_DIR=${TW_APP_DIR:-$HOME/tiktok-widget}
NOTIFY_CMD=${TW_HEALTH_NOTIFY_CMD:-}
AUTORESTART=${TW_HEALTH_AUTORESTART:-}
RESTART_CMD=${TW_RESTART_CMD:-systemctl --user restart tiktok-widget.service}
RESTART_WAIT_SECONDS=${TW_HEALTH_RESTART_WAIT_SECONDS:-15}

STATE="$STATE_DIR/health-watch.state"
INCIDENTS="$STATE_DIR/incidents"
OPS_STATUS="$STATE_DIR/ops-status.json"
LEDGER="$STATE_DIR/RELEASE-LEDGER.jsonl"
mkdir -p "$INCIDENTS"

current_now() {
  case "${TW_HEALTH_NOW:-}" in
    ''|*[!0-9]*) date +%s ;;
    *) printf '%s\n' "$TW_HEALTH_NOW" ;;
  esac
}
NOW=$(current_now)

# 社内の状態を1つの JSON にまとめる（コンソールと AI レーンが読む口。失敗しても見張りは止めない）
write_status() {
  local ok=$1 body=$2 live="" version="" head="" last="null" inc=0
  live=$(printf '%s' "$body" | sed -n 's/.*"live":\([0-9]*\).*/\1/p')
  version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$APP_DIR/package.json" 2>/dev/null | head -1)
  head=$(cd "$APP_DIR" 2>/dev/null && git rev-parse --short HEAD 2>/dev/null)
  [ -f "$LEDGER" ] && last=$(tail -1 "$LEDGER")
  inc=$(find "$INCIDENTS" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  printf '{"ts":"%s","ok":%s,"live":%s,"version":"%s","head":"%s","lastDeploy":%s,"incidents":%s}\n' \
    "$(date -Is)" "$ok" "${live:-null}" "$version" "$head" "$last" "$inc" > "$OPS_STATUS.tmp" \
    && mv "$OPS_STATUS.tmp" "$OPS_STATUS"
}

read_state() {
  count=0; reported=""; down_since=""; down_notified=""; restart_attempted=""; restart_notified=""; last_restart_at=""
  [ -f "$STATE" ] || return 0
  count=$(sed -n 's/^count=\([0-9]*\)$/\1/p' "$STATE" | tail -1)
  reported=$(sed -n 's/^reported=//p' "$STATE" | tail -1)
  down_since=$(sed -n 's/^down_since=\([0-9]*\)$/\1/p' "$STATE" | tail -1)
  down_notified=$(sed -n 's/^down_notified=//p' "$STATE" | tail -1)
  restart_attempted=$(sed -n 's/^restart_attempted=//p' "$STATE" | tail -1)
  restart_notified=$(sed -n 's/^restart_notified=//p' "$STATE" | tail -1)
  last_restart_at=$(sed -n 's/^last_restart_at=\([0-9]*\)$/\1/p' "$STATE" | tail -1)
  case "$count" in ''|*[!0-9]*) count=0 ;; esac
  # 前の形には down_notified が無いので、報告済みの印があれば知らせ済みとして扱う。
  [ -n "$reported" ] && [ -z "$down_notified" ] && down_notified=1
}

write_state() {
  printf 'count=%s\nreported=%s\ndown_since=%s\ndown_notified=%s\nrestart_attempted=%s\nrestart_notified=%s\nlast_restart_at=%s\n' \
    "$count" "$reported" "$down_since" "$down_notified" "$restart_attempted" "$restart_notified" "$last_restart_at" > "$STATE.tmp" \
    && mv "$STATE.tmp" "$STATE"
}

notify() {
  [ -n "$NOTIFY_CMD" ] || return 0
  # 通知の命令には固定の引数を含められるように、ここだけ変数を分けて展開する。本文は1つの引数として渡す。
  $NOTIFY_CMD "$1" >/dev/null 2>&1
  return 0
}

incident_timestamp() {
  date -d "@$NOW" +%Y%m%d-%H%M%S 2>/dev/null || date +%Y%m%d-%H%M%S
}

create_incident() {
  local base ts dir n
  base=$(incident_timestamp)
  ts=$base
  dir="$INCIDENTS/$ts"
  n=1
  while [ -e "$dir" ]; do
    ts="$base-$n"
    dir="$INCIDENTS/$ts"
    n=$((n + 1))
  done
  mkdir -p "$dir" 2>/dev/null || return 1
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  (cd "$APP_DIR" && git log --oneline -3 && git status --porcelain | head -20) > "$dir/git.txt" 2>&1
  systemctl --user status tiktok-widget.service --no-pager > "$dir/service.txt" 2>&1
  journalctl --user -u tiktok-widget.service -n 200 --no-pager > "$dir/journal.txt" 2>&1
  ss -tnp 2>/dev/null | head -30 > "$dir/connections.txt"
  curl -s -m 5 "$HEALTHZ_URL" > "$dir/healthz.txt" 2>&1
  echo "healthz が $count 回続けて返らない。診断の束: $dir" > "$dir/INCIDENT.txt"
  printf '%s\n' "$ts"
}

ensure_incident() {
  if [ -n "$reported" ] && [ -d "$INCIDENTS/$reported" ]; then
    return 0
  fi
  local created
  created=$(create_incident)
  [ -n "$created" ] || return 1
  if [ -z "$reported" ]; then
    reported=$created
    down_notified=1
    notify "ライコネが応答していません（6 分）。診断を残しました: $reported"
  else
    reported=$created
  fi
  return 0
}

downtime_minutes() {
  local by_count=$((count * 2)) by_clock=0 elapsed=0 minutes
  if [ -n "$down_since" ]; then
    elapsed=$((NOW - down_since))
    [ "$elapsed" -lt 0 ] && elapsed=0
    by_clock=$(( (elapsed + 59) / 60 ))
  fi
  minutes=$by_count
  [ "$by_clock" -gt "$minutes" ] && minutes=$by_clock
  [ "$minutes" -lt 1 ] && minutes=1
  printf '%s\n' "$minutes"
}

recover_if_needed() {
  if [ -n "$reported" ]; then
    local minutes
    minutes=$(downtime_minutes)
    notify "ライコネが戻りました（落ちていた時間: 約 $minutes 分）"
  fi
  count=0
  reported=""
  down_since=""
  down_notified=""
  restart_attempted=""
  restart_notified=""
}

restart_wait_seconds() {
  case "$RESTART_WAIT_SECONDS" in
    ''|*[!0-9]*) printf '15\n' ;;
    *) printf '%s\n' "$RESTART_WAIT_SECONDS" ;;
  esac
}

wait_for_health() {
  local wait elapsed
  wait=$(restart_wait_seconds)
  elapsed=0
  while :; do
    if curl -sf -m 2 "$HEALTHZ_URL" >/dev/null 2>&1; then
      return 0
    fi
    [ "$elapsed" -ge "$wait" ] && return 1
    sleep 1
    elapsed=$((elapsed + 1))
  done
}

restart_due() {
  [ "$AUTORESTART" = "1" ] || return 1
  # 同じ障害では1回だけにする。15分の間隔は、直った後の別の障害にも効かせる。
  [ -z "$restart_attempted" ] || return 1
  [ -z "$last_restart_at" ] && return 0
  [ $((NOW - last_restart_at)) -ge 900 ]
}

read_state

body=$(curl -sf -m 5 "$HEALTHZ_URL" 2>/dev/null)
if [ $? -eq 0 ]; then
  health_ok=true
else
  health_ok=false
fi
write_status "$health_ok" "$body" || true

if [ "$health_ok" = true ]; then
  recover_if_needed
  write_state
  exit 0
fi

count=$((count + 1))
[ -z "$down_since" ] && down_since=$NOW

incident_ready=false
if [ "$count" -ge 3 ] && ensure_incident; then
  incident_ready=true
fi

if [ "$incident_ready" = true ] && restart_due; then
  # 再起動の前に必ず診断の束があることを確かめる。作れない時は再起動しない。
  if ensure_incident; then
    $RESTART_CMD >/dev/null 2>&1
    restart_rc=$?
    restart_attempted=1
    last_restart_at=$NOW
    restart_back=false
    if [ "$restart_rc" -eq 0 ] && wait_for_health; then
      restart_back=true
    fi
    if [ -z "$restart_notified" ]; then
      if [ "$restart_back" = true ]; then
        notify "自動で再起動しました。結果: 戻りました"
      else
        notify "自動で再起動しました。結果: 戻りませんでした"
      fi
      restart_notified=1
    fi
    if [ "$restart_back" = true ]; then
      recover_if_needed
    fi
  fi
fi

write_state
