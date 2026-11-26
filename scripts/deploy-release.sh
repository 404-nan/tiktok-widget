#!/bin/bash
# 本番への投入を1つの命令にした道具（2026-11-22）。LuLServer の ~/tiktok-widget で回す。
# 使い方: bash scripts/deploy-release.sh [--with-tests] <入れる枝>
# 順番: 配信が無いこと → 入れる側の一時 worktree で関門 → 未保存変更の退避 → 早送り → 再起動 → /healthz の応答で確認 → 退避の復帰。
# 途中で失敗したら、戻しの命令を表示して止まる（自動では戻さない）。一時 worktree は成功でも失敗でも外す。
set -u
cd "$(dirname "$0")/.." || exit 2

WITH_TESTS=0
BRANCH=""
for arg in "$@"; do
  case "$arg" in
    --with-tests) WITH_TESTS=1 ;;
    --*) echo "知らない引数: $arg"; exit 2 ;;
    *)
      if [ -n "$BRANCH" ]; then echo "入れる枝は1つだけ指定すること"; exit 2; fi
      BRANCH="$arg"
      ;;
  esac
done
[ -n "$BRANCH" ] || { echo "使い方: bash scripts/deploy-release.sh [--with-tests] <入れる枝>"; exit 2; }

LEDGER=${TW_RELEASE_LEDGER:-$HOME/backups/RELEASE-LEDGER.jsonl}
HEALTHZ_URL=${TW_HEALTHZ_URL:-http://127.0.0.1:3939/healthz}
RESTART_CMD=${TW_RESTART_CMD:-systemctl --user restart tiktok-widget.service}
VERIFY_TIMEOUT=${TW_VERIFY_TIMEOUT:-30}
case "$VERIFY_TIMEOUT" in ''|*[!0-9]*) echo "TW_VERIFY_TIMEOUT は秒の整数で指定すること"; exit 2 ;; esac
BACKUP_DIR=$(dirname "$LEDGER")
mkdir -p "$BACKUP_DIR"
export XDG_RUNTIME_DIR=/run/user/$(id -u)

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

FROM=$(git rev-parse HEAD) || { echo "今の HEAD を読めないため止める"; exit 1; }
TO=$(git rev-parse --verify "${BRANCH}^{commit}" 2>/dev/null) || { echo "入れる枝を読めないため止める: $BRANCH"; exit 1; }
VERSION=$(git show "$TO:package.json" 2>/dev/null | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')
[ -n "$VERSION" ] || { echo "入れる枝の package.json から版数を読めないため止める"; exit 1; }
DEPLOY_ID="deploy-$(date +%Y%m%dT%H%M%S)-$$"

STASHED=""
LOCAL_SHAS="$BACKUP_DIR/deploy-local-shas.txt"
GATE_TMP=""
GATE_WORKTREE=""

cleanup_gate_worktree() {
  if [ -n "$GATE_WORKTREE" ]; then
    git worktree remove --force "$GATE_WORKTREE" >/dev/null 2>&1 || true
    GATE_WORKTREE=""
  fi
  if [ -n "$GATE_TMP" ]; then
    rmdir "$GATE_TMP" 2>/dev/null || true
    GATE_TMP=""
  fi
}
trap cleanup_gate_worktree EXIT

restore_local() {
  if [ -n "$STASHED" ]; then
    git stash pop -q || { echo "退避の復帰でぶつかった。stash に残してあるので手で戻すこと"; return 1; }
    while read -r sha f; do
      now=$(sha256sum "$f" | awk '{print $1}')
      [ "$now" = "$sha" ] || { echo "復帰後の指紋が違う: $f"; return 1; }
    done < "$LOCAL_SHAS"
    echo "未保存の変更は元のまま復帰した"
  fi
}

fail_deploy() {
  local stage="$1"
  local error="$2"
  local with_rollback="${3:-0}"
  ledger_event failed stage "$stage" error "$error"
  echo "投入を止めた（段: $stage）: $error"
  if [ "$with_rollback" = "1" ]; then
    echo "戻すとき: bash scripts/rollback-release.sh"
  fi
  restore_local || true
  exit 1
}

ledger_event started from "$FROM" to "$TO" version "$VERSION" branch "$BRANCH"

# 関門は「入れる側」のコードで見る。本番の木を早送り前に書き換えないよう、一時 worktree で回す。
GATE_TMP=$(mktemp -d "${TMPDIR:-/tmp}/tw-release-gates.XXXXXX") || fail_deploy prepare "一時置き場を作れなかった"
GATE_WORKTREE="$GATE_TMP/tree"
if ! git worktree add --detach "$GATE_WORKTREE" "$TO" >/dev/null 2>&1; then
  fail_deploy prepare "関門用の一時 worktree を作れなかった"
fi
if [ "$WITH_TESTS" = "1" ]; then
  # 一時 worktree には node_modules が無い。依存が土台と同じ時は今ある node_modules へリンクし、
  # 変わっている時だけ lock から入れ直す（入れないと全体テストが依存を読めない）。
  base_lock=$(git rev-parse --verify "$FROM:package-lock.json" 2>/dev/null || true)
  to_lock=$(git rev-parse --verify "$TO:package-lock.json" 2>/dev/null || true)
  if [ -n "$base_lock" ] && [ "$base_lock" = "$to_lock" ] && [ -d node_modules ]; then
    ln -s "$PWD/node_modules" "$GATE_WORKTREE/node_modules"
  elif [ -f "$GATE_WORKTREE/package-lock.json" ]; then
    (cd "$GATE_WORKTREE" && npm ci --ignore-scripts --no-audit --no-fund) || fail_deploy gates "関門用の依存を入れられなかった"
  elif [ -d node_modules ]; then
    ln -s "$PWD/node_modules" "$GATE_WORKTREE/node_modules"
  fi
fi
if [ "$WITH_TESTS" = "1" ]; then
  gate_args=(--base "$FROM")
  gate_tests=full
else
  gate_args=(--base "$FROM" --skip-tests)
  gate_tests=skipped
fi
if (cd "$GATE_WORKTREE" && node scripts/release-check.mjs "${gate_args[@]}"); then
  ledger_event gates-passed tests "$gate_tests"
else
  fail_deploy gates "出す前の関門で落ちた"
fi
cleanup_gate_worktree

# 未保存の変更は、ファイルごとの指紋を取ってから退避する。早送りの直前に行い、失敗時は元へ戻す。
mods=$(git status --porcelain --untracked-files=no | awk '{print $2}')
if [ -n "$mods" ]; then
  for f in $mods; do sha256sum "$f"; done > "$LOCAL_SHAS"
  git stash push -q -m "deploy-release: 投入前の退避" -- $mods || fail_deploy stash "未保存の変更を退避できなかった"
  STASHED=1
  echo "未保存の変更を退避した: $mods"
fi

if ! git merge --ff-only "$TO" >/dev/null; then
  fail_deploy fast-forward "早送りできないため止める（頭は動いていない）"
fi

if ! bash -c "$RESTART_CMD"; then
  fail_deploy activate "再起動の命令が失敗した" 1
fi
ledger_event activated

LAST_HEALTH_VERSION=""
LAST_HEALTH_COMMIT=""
health_matches() {
  local body
  body=$(curl -sf "$HEALTHZ_URL" 2>/dev/null) || return 1
  LAST_HEALTH_VERSION=$(json_string_field "$body" version)
  LAST_HEALTH_COMMIT=$(json_string_field "$body" commit)
  [ "$LAST_HEALTH_VERSION" = "$VERSION" ] && [ "$LAST_HEALTH_COMMIT" = "$TO" ]
}

elapsed=0
while [ "$elapsed" -lt "$VERIFY_TIMEOUT" ]; do
  if health_matches; then break; fi
  sleep 1
  elapsed=$((elapsed + 1))
done
if ! health_matches; then
  fail_deploy verify "再起動後の応答が期待と違う（version: ${LAST_HEALTH_VERSION:-不明} / commit: ${LAST_HEALTH_COMMIT:-不明}、期待: $VERSION / $TO）" 1
fi
ledger_event verified version "$VERSION" commit "$TO"

if ! restore_local; then
  ledger_event failed stage restore error "退避の復帰で失敗した"
  exit 1
fi
echo "投入完了: $FROM → $TO（版数 $VERSION）。台帳: $LEDGER"
