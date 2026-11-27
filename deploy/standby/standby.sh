#!/usr/bin/env bash
# 待機機からデータを同期・点検し、旧本番の停止確認後だけ待機機を昇格する。
set +x
set -eEuo pipefail
umask 077

here=$(cd -- "${BASH_SOURCE[0]%/*}" && pwd -P)
export STANDBY_DIR=${STANDBY_DIR:-$HOME/.local/share/tiktok-widget-standby}
export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"
cf_token=${CF_API_TOKEN:-}
tunnel_token=${TUNNEL_TOKEN:-}
unset CF_API_TOKEN TUNNEL_TOKEN
action=${1:-status}
step=init
log() { printf '%s standby/%s/%s: %s\n' "$(date -u +%FT%TZ)" "$action" "$step" "$*" >&2; }
fail() { log "$*"; exit 1; }
trap 'log "予期しない失敗（行 $LINENO、終了コード $?）"' ERR

mkdir -p -- "$STANDBY_DIR"
base=$(cd -- "$STANDBY_DIR" && pwd -P)
export STANDBY_DIR=$base
[[ -O $base && $(stat -c %a "$base") == 700 ]] || fail '待機ディレクトリは実行ユーザー所有・権限 700 が必要です。'
lock=standby
if [[ $action == watch ]]; then lock=watch; fi
exec 8>"$base/$lock.lock"
flock -n 8 || fail '別の待機機操作を実行中です。'

sha_re='^[a-f0-9]{40}$'
ssh_opts='ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=2'
source_host=${PRIMARY_SSH:-}
source_dir=${PRIMARY_DIR:-/home/lul/tiktok-widget}
snapshot_info() {
  local slot
  slot=$(readlink "$base/current" 2>/dev/null) && [[ $slot == replica-a || $slot == replica-b ]] ||
    fail '同期済みのデータがありません。'
  snapshot="$base/$slot"
  read -r snapshot_timestamp snapshot_commit < "$snapshot/stamp" ||
    fail '同期日時と版の記録を読めません。'
  [[ $snapshot_commit =~ $sha_re ]] || fail '同期した版の記録が不正です。'
  snapshot_age=$(node "$here/standby-route.mjs" snapshot-age "$snapshot_timestamp") ||
    fail '同期日時を確認できません。'
}

source_commit() {
  $ssh_opts "$source_host" "git -C $source_dir rev-parse --verify HEAD" 2>/dev/null
}

sync_snapshot() {
  step=sync
  if [[ -e $base/promoted || -e $base/data ]]; then
    log '稼働用データがあるため、旧本番からは同期しません。'
    return 0
  fi
  [[ $source_host =~ ^([a-zA-Z0-9_][a-zA-Z0-9_.-]*@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] ||
    fail 'PRIMARY_SSH に検証済みの SSH ホストを設定してください。'
  [[ $source_dir =~ ^(/[a-zA-Z0-9_.-]+)+$ && ! $source_dir =~ (^|/)\.\.?(/|$) ]] ||
    fail 'PRIMARY_DIR に本番リポジトリの絶対パスを設定してください。'
  local slot=replica-a next timestamp commit after prepared
  prepared=$(cat "$base/deps.commit" 2>/dev/null) && [[ $prepared =~ $sha_re ]] ||
    fail '先に standby.sh prepare で待機版を用意してください。'
  timestamp=$(date +%s)
  step=source-release
  commit=$(source_commit) && [[ $commit =~ $sha_re ]] ||
    fail 'SSH 経由で本番の版を確認できません。疎通・認証・作業パスを確認してください。'
  [[ $commit == "$prepared" ]] || fail '本番と待機版が異なります。新しい本番の版を準備してください。'
  [[ $(readlink "$base/current" 2>/dev/null || true) != "$slot" ]] || slot=replica-b
  next="$base/$slot"
  mkdir -p -- "$next"
  step=transfer
  # 保存済みの正本を上書きせず、非稼働側だけ差分更新する。prod では圧縮もチェックサム走査もしない。
  local rc
  timeout 240 rsync -rlt --modify-window=-1 --delete --timeout=30 --bwlimit=2048 --secluded-args -e "$ssh_opts" \
    --exclude=/data/backups/ --exclude='*.tmp' --exclude='*.tmp-*' \
    --include=/data/ --include='/data/***' --include=/config.yaml --exclude='*' \
    "$source_host:$source_dir/" "$next/" >/dev/null 2>&1 || {
      rc=$?
      fail "同期に失敗しました（rsync/timeout 終了コード $rc）。前回のデータは維持します。"
    }
  step=validate
  after=$(source_commit) && [[ $after == "$commit" ]] || fail '同期中に本番の版を確認できなくなりました。'
  node "$here/standby-route.mjs" validate "$next" ||
    fail '同期したデータを検証できません。前回のデータは維持します。'
  printf '%s %s\n' "$timestamp" "$commit" > "$next/stamp"
  ln -sfn "$slot" "$base/current.next"
  mv -Tf -- "$base/current.next" "$base/current"
  log "同期完了（$commit）。"
}

watch_standby() {
  local result=0 public=ok replica=ok last message marker
  step=public
  node "$here/standby-route.mjs" health || { log '外部から公開先が応答しません。'; public=down; result=1; }
  if [[ ! -e $base/promoted ]]; then
    step=freshness
    (snapshot_info) || { replica=stale; result=1; }
  else
    step=active-origin
    read -r marker _ < "$base/promoted" &&
      node "$here/standby-route.mjs" origin "$marker" ||
      { log '昇格先の公開確認に失敗しました。'; replica=unverified; result=1; }
  fi
  step=notify
  last=$(cat "$base/watch.state" 2>/dev/null || printf 'public=ok standby=ok')
  message="public=$public standby=$replica"
  if [[ $message != "$last" && -n ${STANDBY_NOTIFY_COMMAND:-} ]]; then
    [[ $STANDBY_NOTIFY_COMMAND == /* && -x $STANDBY_NOTIFY_COMMAND ]] ||
      fail '通知先には実行可能ファイルの絶対パスを指定してください。'
    timeout 15 "$STANDBY_NOTIFY_COMMAND" "ライコネ: $message（直前: $last）" 8>&- >/dev/null 2>&1 ||
      fail '通知に失敗しました。次の確認で再試行します。'
  fi
  printf '%s\n' "$message" > "$base/watch.state"
  return "$result"
}

promote() {
  step=fence
  [[ ${1:-} == --primary-fenced && $# == 1 ]] ||
    fail '旧本番の停止・書き込み遮断と配信がないことを確認してから --primary-fenced を指定してください。'
  [[ -n $cf_token && -n $tunnel_token ]] || fail 'DNS 更新鍵と待機専用トンネル鍵が必要です。'
  local route marker stage expected_commit snapshot_timestamp
  route=$(CF_API_TOKEN=$cf_token TUNNEL_TOKEN=$tunnel_token node "$here/standby-route.mjs" preflight) ||
    fail '切替前の確認で停止しました。'
  if [[ ! -f $base/promoted ]]; then
    [[ $route == primary ]] || fail '切替先に稼働中の待機機があるため、新しいライターは起動しません。'
    step=restore
    snapshot_info
    [[ $(cat "$base/deps.commit" 2>/dev/null) == "$snapshot_commit" ]] ||
      fail '同期した本番データと準備済みの版が一致しません。'
    node "$here/standby-route.mjs" validate "$snapshot" || fail '同期データの再検証に失敗しました。'
    [[ ! -e $base/data && ! -L $base/data && ! -e $base/config.yaml && ! -L $base/config.yaml ]] ||
      fail '別の稼働データがあります。上書きせず停止します。'
    stage=$(mktemp -d "$base/restore.XXXXXXXX")
    trap "rm -rf -- $(printf '%q' "$stage")" EXIT
    cp -a -- "$snapshot/data" "$stage/data"
    if [[ -f $snapshot/config.yaml ]]; then cp -p -- "$snapshot/config.yaml" "$stage/config.yaml"; fi
    marker=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
    printf '%s\n' "$marker" > "$base/app/public/help/standby-$marker.txt"
    printf '%s %s %s\n' "$marker" "$snapshot_commit" "$snapshot_timestamp" > "$stage/promoted"
    if [[ -f $stage/config.yaml ]]; then mv -T -- "$stage/config.yaml" "$base/config.yaml"; fi
    mv -T -- "$stage/data" "$base/data"
    mv -T -- "$stage/promoted" "$base/promoted"
  fi
  read -r marker expected_commit snapshot_timestamp < "$base/promoted"
  if [[ $route == primary ]]; then
    step=freshness
    node "$here/standby-route.mjs" snapshot-age "$snapshot_timestamp" >/dev/null ||
      fail '切替前の同期データが古いか、同期日時が不明です。'
  fi
  step=activate
  TUNNEL_TOKEN=$tunnel_token STANDBY_EXPECT_COMMIT=$expected_commit bash "$here/setup.sh" activate 8>&- ||
    fail "待機機が起動しません。$base/server.log と tunnel.log を確認してください。"
  step=route
  CF_API_TOKEN=$cf_token node "$here/standby-route.mjs" switch "$marker" "$snapshot_timestamp" ||
    fail '公開先を確認できません。稼働データを維持します。同じコマンドで再確認できます。'
  log '公開 URL を変えずに待機機へ切り替わりました。'
}

case $action in
  prepare) step=prepare; bash "$here/setup.sh" prepare 8>&- ;;
  sync) sync_snapshot ;;
  watch) watch_standby ;;
  status)
    step=status
    if [[ -e $base/promoted ]]; then printf 'role=promoted（公開状態は watch で確認）\n'
    else snapshot_info; printf 'role=standby snapshot_age_seconds=%s commit=%s\n' "$snapshot_age" "$snapshot_commit"; fi
    ;;
  promote) shift; promote "$@" ;;
  *) step=usage; fail '使い方: standby.sh [prepare|sync|watch|status|promote --primary-fenced]' ;;
esac
