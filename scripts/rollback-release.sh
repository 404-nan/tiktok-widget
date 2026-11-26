#!/bin/bash
# 台帳にある、いちばん新しい「確かめ済み」の投入の from へ戻す道具（2026-11-22）。LuLServer の ~/tiktok-widget で回す。
# 使い方: bash scripts/rollback-release.sh
# 未保存の変更は退避→復帰で守る。戻したあとは /healthz の commit を確かめ、結果を台帳に残す。
set -u
cd "$(dirname "$0")/.." || exit 2

LEDGER=${TW_RELEASE_LEDGER:-$HOME/backups/RELEASE-LEDGER.jsonl}
HEALTHZ_URL=${TW_HEALTHZ_URL:-http://127.0.0.1:3939/healthz}
RESTART_CMD=${TW_RESTART_CMD:-systemctl --user restart tiktok-widget.service}
VERIFY_TIMEOUT=${TW_VERIFY_TIMEOUT:-30}
case "$VERIFY_TIMEOUT" in ''|*[!0-9]*) echo "TW_VERIFY_TIMEOUT は秒の整数で指定すること"; exit 2 ;; esac
BACKUP_DIR=$(dirname "$LEDGER")
export XDG_RUNTIME_DIR=/run/user/$(id -u)
[ -f "$LEDGER" ] || { echo "台帳が無いため戻せない"; exit 1; }

FROM=$(LEDGER_PATH="$LEDGER" node -e '
const fs = require("node:fs");
const started = new Map();
let target = "";
for (const line of fs.readFileSync(process.env.LEDGER_PATH, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let row;
  try { row = JSON.parse(line); } catch { continue; }
  if (row.event === "started" && row.deployId) started.set(row.deployId, row);
  if (row.event === "verified") {
    const start = started.get(row.deployId) ?? {};
    if (row.from || start.from) target = row.from || start.from;
  } else if (!row.event && row.from && row.to && row.rollback !== true) {
    // 2026-11-27 より前の台帳は1行だけ。event が無く rollback 印も無い行は確かめ済みの投入として読む。
    target = row.from;
  }
}
process.stdout.write(target ?? "");
') || { echo "台帳を読めないため戻せない"; exit 1; }
NOW=$(git rev-parse HEAD)
[ -n "$FROM" ] || { echo "台帳に確かめ済みの投入が無いため戻せない"; exit 1; }
DEPLOY_ID="rollback-$(date +%Y%m%dT%H%M%S)-$$"

json_quote() {
  local s=${1//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '"%s"' "$s"
}

ledger_event() {
  local event="$1"
  shift
  {
    printf '{"ts":'; json_quote "$(date -Is)"
    printf ',"deployId":'; json_quote "$DEPLOY_ID"
    printf ',"event":'; json_quote "$event"
    while [ "$#" -ge 2 ]; do
      printf ',"%s":' "$1"
      json_quote "$2"
      shift 2
    done
    printf '}\n'
  } >> "$LEDGER"
}

json_string_field() {
  printf '%s' "$1" | sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p"
}

json_number_field() {
  printf '%s' "$1" | sed -n "s/.*\"$2\":\([0-9][0-9]*\).*/\1/p"
}

live=$(json_number_field "$(curl -s "$HEALTHZ_URL" 2>/dev/null)" live)
if [ "${live:-x}" != "0" ]; then echo "配信中（live=${live:-不明}）のため止める"; exit 1; fi

STASHED=""
LOCAL_SHAS="$BACKUP_DIR/rollback-local-shas.txt"
restore_local() {
  if [ -n "$STASHED" ]; then
    git stash pop -q || { echo "退避の復帰でぶつかった。stash に残してあるので手で戻すこと"; return 1; }
    while read -r sha f; do
      now=$(sha256sum "$f" | awk '{print $1}')
      [ "$now" = "$sha" ] || { echo "復帰後の指紋が違う: $f"; return 1; }
    done < "$LOCAL_SHAS"
  fi
}

mods=$(git status --porcelain --untracked-files=no | awk '{print $2}')
if [ -n "$mods" ]; then
  for f in $mods; do sha256sum "$f"; done > "$LOCAL_SHAS"
  git stash push -q -m "rollback-release: 戻し前の退避" -- $mods || { echo "退避に失敗したため止める"; exit 1; }
  STASHED=1
fi
if ! git reset --hard -q "$FROM"; then
  echo "戻し先へ移れなかった"
  restore_local || true
  exit 1
fi
if ! restore_local; then
  ledger_event failed stage restore error "退避の復帰で失敗した" from "$NOW" to "$FROM"
  exit 1
fi

if ! bash -c "$RESTART_CMD"; then
  ledger_event failed stage activate error "再起動の命令が失敗した" from "$NOW" to "$FROM"
  echo "戻したあとの再起動に失敗した"
  exit 1
fi

LAST_HEALTH_COMMIT=""
health_matches() {
  local body
  body=$(curl -sf "$HEALTHZ_URL" 2>/dev/null) || return 1
  LAST_HEALTH_COMMIT=$(json_string_field "$body" commit)
  [ "$LAST_HEALTH_COMMIT" = "$FROM" ]
}

elapsed=0
while [ "$elapsed" -lt "$VERIFY_TIMEOUT" ]; do
  if health_matches; then break; fi
  sleep 1
  elapsed=$((elapsed + 1))
done
if ! health_matches; then
  ledger_event failed stage verify error "戻したあとの応答 commit が違う（${LAST_HEALTH_COMMIT:-不明}、期待: $FROM）" from "$NOW" to "$FROM"
  echo "戻したあとの確認で失敗（応答 commit: ${LAST_HEALTH_COMMIT:-不明} / 期待: $FROM）"
  exit 1
fi
ledger_event rolled-back from "$NOW" to "$FROM" commit "$FROM"
echo "戻し完了: $NOW → $FROM"
