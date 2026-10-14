#!/bin/sh
# 合成データ（または渡した data）で、今の release と旧版をローカルだけで比べる。
# TikTok にはつながない。本番の data/ や環境変数 TW_ENV / TW_BILLING は使わない。
set -eu

if [ $# -ne 1 ] || [ ! -d "$1" ]; then
  echo "使い方: scripts/rehearse.sh <dataディレクトリ>" >&2
  exit 2
fi

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SRC=$1
OLD_REV=d03dd38170a2577f94a3a7e310f7a2d8bfd9a729
RUN=$(mktemp -d /tmp/tw-rh-XXXX)
DATA_NEW=$RUN/data-release
DATA_OLD=$RUN/data-old
WT=$RUN/old-src
LOG_NEW=$RUN/release.log
LOG_OLD=$RUN/old.log
PID_NEW=
PID_OLD=
REPORT=$ROOT/rehearsal-report.md
SHOTS=/workspace/shots/rehearsal

cleanup() {
  if [ -n "${PID_NEW:-}" ]; then kill "$PID_NEW" 2>/dev/null || true; wait "$PID_NEW" 2>/dev/null || true; fi
  if [ -n "${PID_OLD:-}" ]; then kill "$PID_OLD" 2>/dev/null || true; wait "$PID_OLD" 2>/dev/null || true; fi
  if [ -d "$WT" ]; then git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null || true; fi
  rm -rf "$RUN"
}
trap cleanup EXIT

cp -a "$SRC" "$DATA_NEW"
cp -a "$SRC" "$DATA_OLD"
# 鍵ファイルは起動前に両方のコピーから消す（中身は読まない）
find "$DATA_NEW" "$DATA_OLD" -type f \( \
  -name 'sign-api-key.txt' -o -name 'admin-token.txt' -o -name 'ai.json' -o -name 'api-keys.json' \
  -o -name '*.pem' -o -name '*.key' -o -name '*secret*' -o -name '*credential*' \
\) -exec rm -f {} +

snapshot() {
  dir=$1
  out=$2
  : > "$out"
  find "$dir" -type f | sort | while read -r f; do
    rel=${f#"$dir"/}
    sum=$(sha256sum "$f" | awk '{print $1}')
    printf '%s %s\n' "$sum" "$rel" >> "$out"
  done
}

git -C "$ROOT" worktree add --detach "$WT" "$OLD_REV" >/dev/null
ln -s "$ROOT/node_modules" "$WT/node_modules"

start_server() {
  dir=$1
  data=$2
  port=$3
  log=$4
  pidfile=$5
  (
    cd "$dir"
    exec env \
      -u TW_ENV -u TW_BILLING -u TW_VAULT -u TW_AI_KEY -u TW_ADMIN_TOKEN \
      -u TIKTOK_USERNAME -u TIKTOK_SIGN_API_KEY \
      TW_HOSTED=1 TW_RESUME_CONNECT=0 TW_RENTAL_AUTOCONNECT=0 \
      TW_DATA="$data" PORT="$port" HOST=127.0.0.1 \
      node server.js
  ) >"$log" 2>&1 &
  echo $! > "$pidfile"
}

snapshot "$DATA_NEW" "$RUN/before-new.txt"
snapshot "$DATA_OLD" "$RUN/before-old.txt"

start_server "$ROOT" "$DATA_NEW" 3941 "$LOG_NEW" "$RUN/new.pid"
start_server "$WT" "$DATA_OLD" 3942 "$LOG_OLD" "$RUN/old.pid"
PID_NEW=$(cat "$RUN/new.pid")
PID_OLD=$(cat "$RUN/old.pid")

wait_health() {
  port=$1
  i=0
  while [ "$i" -lt 50 ]; do
    if curl -sf "http://127.0.0.1:$port/healthz" >/dev/null; then return 0; fi
    i=$((i + 1))
    sleep 0.2
  done
  echo "ポート $port が起動しませんでした" >&2
  echo "---- log ----" >&2
  cat "$2" >&2 || true
  exit 1
}
wait_health 3941 "$LOG_NEW"
wait_health 3942 "$LOG_OLD"

check_tiktok() {
  log=$1
  label=$2
  if grep -E '\[tiktok\]|再起動前の接続|webcast\.tiktok|tiktok-live-connector|Connected to room|Connecting to' "$log" >/dev/null; then
    echo "$label の起動ログに TikTok 接続の行があります" >&2
    grep -nE '\[tiktok\]|再起動前の接続|webcast\.tiktok|tiktok-live-connector|Connected to room|Connecting to' "$log" >&2 || true
    exit 1
  fi
}
check_tiktok "$LOG_NEW" "release"
check_tiktok "$LOG_OLD" "旧版"

if [ ! -d /tmp/pptr103/node_modules/puppeteer ]; then
  mkdir -p /tmp/pptr103
  if [ ! -f /tmp/pptr103/package.json ]; then
    npm init -y --prefix /tmp/pptr103 >/dev/null
  fi
  npm install --prefix /tmp/pptr103 puppeteer@14.4.1 --no-fund --no-audit
fi

node "$ROOT/scripts/rehearse-collect.mjs" "$DATA_NEW" "$SHOTS" "$RUN/collect.json"

kill "$PID_NEW" 2>/dev/null || true
kill "$PID_OLD" 2>/dev/null || true
wait "$PID_NEW" 2>/dev/null || true
wait "$PID_OLD" 2>/dev/null || true
PID_NEW=
PID_OLD=

snapshot "$DATA_NEW" "$RUN/after-new.txt"
snapshot "$DATA_OLD" "$RUN/after-old.txt"

node "$ROOT/scripts/rehearse-report.mjs" \
  "$RUN/collect.json" \
  "$RUN/before-new.txt" "$RUN/after-new.txt" \
  "$RUN/before-old.txt" "$RUN/after-old.txt" \
  "$REPORT"

echo "レポート: $REPORT"
