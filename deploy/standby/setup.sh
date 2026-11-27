#!/usr/bin/env bash
# 一時的な Linux ホストでライコネと Cloudflare Tunnel を起動する。systemd は使わない。
set +x
set -euo pipefail
umask 077

repo=https://github.com/404-nan/tiktok-widget.git
ref=${REF:-e2a303df2c198a3bd2d68c0a76601ac0412185ea}
base=${STANDBY_DIR:-$HOME/.local/share/tiktok-widget-standby}
export PORT=${PORT:-3939}
origin=http://127.0.0.1:$PORT
export PATH="$HOME/.local/bin:$PATH"

say() { printf '%s\n' "$*"; }
fail() { say "$*" >&2; exit 1; }

runner_pid() {
  local pid
  local -a argv
  read -r pid 2>/dev/null < "$base/$1.pid" || return 1
  [[ $pid =~ ^[1-9][0-9]*$ && -r /proc/$pid/cmdline ]] || return 1
  mapfile -d '' -t argv < "/proc/$pid/cmdline" 2>/dev/null || return 1
  [[ ${argv[1]:-} == "$base/run.sh" && ${argv[2]:-} == "$1" ]] || return 1
  printf '%s\n' "$pid"
}

wait_runner_exit() {
  local kind=$1 attempts=$2 i
  for ((i = 0; i < attempts; i++)); do
    runner_pid "$kind" >/dev/null || return 0
    sleep 0.2
  done
  ! runner_pid "$kind" >/dev/null
}

force_stop_runner() {
  local pid=$1 group child
  read -r group < <(ps -o pgid= -p "$pid") || return 0
  if [[ $group == "$pid" ]]; then
    kill -KILL -- "-$pid" 2>/dev/null || true
  else
    # 更新前の起動プロセスは専用グループを持たない。
    while read -r child; do
      kill -KILL "$child" 2>/dev/null || true
    done < <(ps -o pid= --ppid "$pid")
  fi
}

stop_runner() {
  local pid kind=$1
  if pid=$(runner_pid "$kind"); then
    kill -TERM "$pid" 2>/dev/null || true
    if ! wait_runner_exit "$kind" 40; then
      if [[ $(runner_pid "$kind") == "$pid" ]]; then force_stop_runner "$pid"; fi
      if ! wait_runner_exit "$kind" 10; then
        say "$kind を停止できませんでした。$base/$kind.log を確認してください。" >&2
        return 1
      fi
    fi
  fi
  rm -f -- "$base/$kind.pid"
}

stop_runners() {
  local status=0
  stop_runner tunnel || status=1
  stop_runner server || status=1
  return "$status"
}

lock_setup() {
  exec 9>"$base/setup.lock"
  flock -n 9 || fail '別の起動・停止処理を実行中です。'
}

stop_standby() {
  stop_runners || return 1
  rm -f -- "$base/url.txt"
  say 'ライコネを停止しました。データは残しています。'
}

use_node() {
  command -v node >/dev/null && command -v npm >/dev/null &&
    node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)'
}

install_node() {
  use_node && return
  if command -v apt-get >/dev/null; then
    local -a elevate=()
    if ((EUID != 0)); then elevate=(sudo -n); fi
    if ((EUID == 0)) || { command -v sudo >/dev/null && sudo -n true; }; then
      if curl -fsSL https://deb.nodesource.com/setup_22.x -o "$tmp/nodesource.sh" &&
        "${elevate[@]}" bash "$tmp/nodesource.sh" &&
        "${elevate[@]}" apt-get install -y nodejs && use_node; then
        return
      fi
    fi
  fi
  local node_site=https://nodejs.org/dist/latest-v22.x tarball checksum
  curl -fsSL "$node_site/SHASUMS256.txt" -o "$tmp/node-sums"
  read -r checksum tarball < <(awk -v suffix="-linux-$node_arch.tar.xz" 'index($2, suffix) {print $1, $2; exit}' "$tmp/node-sums")
  curl -fsSL "$node_site/$tarball" -o "$tmp/$tarball"
  (cd "$tmp" && printf '%s  %s\n' "$checksum" "$tarball" | sha256sum -c - >/dev/null)
  mkdir -p "$HOME/.local/node22"
  tar -xJf "$tmp/$tarball" --strip-components=1 -C "$HOME/.local/node22"
  export PATH="$HOME/.local/node22/bin:$PATH"
}

install_cloudflared() {
  command -v cloudflared >/dev/null && return
  command -v dpkg-deb >/dev/null || fail 'cloudflared または dpkg-deb を用意してください。'
  local cf_repo=https://pkg.cloudflare.com/cloudflared pkg checksum
  curl -fsSL "$cf_repo/dists/any/main/binary-$deb_arch/Packages" -o "$tmp/cloudflared-packages"
  read -r pkg checksum < <(awk '/^Filename: / {file=$2} /^SHA256: / && file {print file, $2; exit}' "$tmp/cloudflared-packages")
  curl -fsSL "$cf_repo/$pkg" -o "$tmp/cloudflared.deb"
  (cd "$tmp" && printf '%s  cloudflared.deb\n' "$checksum" | sha256sum -c - >/dev/null)
  dpkg-deb -x "$tmp/cloudflared.deb" "$tmp/cloudflared"
  mkdir -p "$HOME/.local/bin"
  install -m 755 "$tmp/cloudflared/usr/bin/cloudflared" "$HOME/.local/bin/cloudflared"
}

download_backup() {
  local url=$1
  [[ $url != *$'\r'* && $url != *$'\n'* ]] || return 1
  url=${url//\\/\\\\}
  url=${url//\"/\\\"}
  printf 'url = "%s"\n' "$url" | curl -q -fsSL --proto '=https' --proto-redir '=https' -K -
}

restore_data() {
  local data_url=$1
  [[ -n ${DATA_TARBALL:-}$data_url ]] || return 0
  if [[ -e $base/data ]]; then
    say '既存のデータをそのまま使います。バックアップは読み込みません。'
    return
  fi
  local backup=${DATA_TARBALL:-$tmp/backup.tar.gz}
  if [[ -z ${DATA_TARBALL:-} ]]; then
    download_backup "$data_url" > "$backup" 2>/dev/null ||
      fail 'バックアップをダウンロードできませんでした。'
  fi
  tar -tzf "$backup" 2>/dev/null | awk '
    { sub(/^\.\//, "") }
    ($0 == "" || $0 == "." || $0 == "data" || $0 == "config.yaml") { next }
    $0 !~ /^data\// || $0 ~ /(^|\/)\.\.(\/|$)/ { exit 1 }
  ' && tar -tvzf "$backup" 2>/dev/null | awk 'substr($0, 1, 1) !~ /[-d]/ { exit 1 }' ||
    fail 'バックアップは data/ と任意の config.yaml のみで、リンクは含められません。'
  mkdir "$tmp/restore"
  tar -xzf "$backup" --no-same-owner --no-same-permissions -C "$tmp/restore" 2>/dev/null ||
    fail 'バックアップを展開できませんでした。'
  [[ -d $tmp/restore/data ]] || fail 'バックアップの最上位に data/ がありません。'
  if [[ -f $tmp/restore/config.yaml && ! -e $base/config.yaml ]]; then
    install -m 600 "$tmp/restore/config.yaml" "$base/config.yaml"
  fi
  mv -T -- "$tmp/restore/data" "$base/data"
}

write_runner() {
  # 起動する版にこの設定スクリプトが入っていなくても、再起動と停止はこの機械で行える。
  {
    declare -f say fail runner_pid wait_runner_exit force_stop_runner stop_runner stop_runners lock_setup stop_standby
    cat <<'RUN'
set -u
umask 077
base=${0%/*}
kind=$1
if [[ $kind == stop ]]; then
  set -e
  lock_setup
  stop_standby
  exit
fi
child=
stop() {
  if [[ -n $child ]]; then
    kill "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  exit 0
}
trap stop TERM INT

record_quick_url() {
  local line
  while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ $line =~ https://[a-z0-9-]+\.trycloudflare\.com ]]; then
      printf '%s\n' "${BASH_REMATCH[0]}" > "$base/url.txt"
    fi
  done
}

while :; do
  if [[ $kind == server ]]; then
    cd "$base/app" || exit 1
    env -u TW_ADMIN_TOKEN TW_HOSTED=1 HOST=127.0.0.1 TW_DATA="$base/data" \
      TW_CONFIG="$base/config.yaml" node server.js &
  elif [[ $2 == named ]]; then
    cloudflared tunnel --grace-period 5s run &
  else
    rm -f -- "$base/url.txt"
    cloudflared tunnel --grace-period 5s --url "http://127.0.0.1:$PORT" > >(record_quick_url) 2>&1 &
  fi
  child=$!
  wait "$child"
  sleep 3 &
  child=$!
  wait "$child"
done
RUN
  } > "$tmp/run.sh"
  mv -- "$tmp/run.sh" "$base/run.sh"
}

start_runner() {
  nohup setsid bash "$base/run.sh" "$@" < /dev/null >> "$base/$1.log" 2>&1 9>&- &
  printf '%s\n' "$!" > "$base/$1.pid"
}

wait_health() {
  local url=$1 attempts=$2 i
  for ((i = 0; i < attempts; i++)); do
    curl -fsS --max-time 2 "$url/healthz" >/dev/null 2>&1 && return
    sleep 1
  done
  return 1
}

main() {
  local action=${1:-start} node_arch deb_arch tmp commit token=${TUNNEL_TOKEN:-}
  local data_url=${DATA_URL:-}
  unset TUNNEL_TOKEN DATA_URL
  mkdir -p -- "$base"
  base=$(cd "$base" && pwd -P)
  lock_setup
  if [[ $action == stop ]]; then
    stop_standby
    return
  fi
  [[ $action == start || $action == prepare || $action == activate ]] ||
    fail '使い方: setup.sh [start|stop|prepare|activate]'
  if [[ $action == start && -e $base/promoted ]]; then
    fail '昇格済みの待機機には standby.sh promote --primary-fenced を使ってください。'
  fi
  [[ $PORT =~ ^[1-9][0-9]{0,4}$ ]] && ((PORT <= 65535)) || fail 'PORT は 1〜65535 で指定してください。'
  [[ -z ${DATA_TARBALL:-} || -z $data_url ]] || fail 'DATA_TARBALL と DATA_URL はどちらか一方だけ指定してください。'
  if [[ -x $HOME/.local/node22/bin/node ]]; then export PATH="$HOME/.local/node22/bin:$PATH"; fi
  if [[ $action == activate ]]; then
    [[ -n $token && -d $base/data && -s $base/deps.commit && -f $base/run.sh ]] ||
      fail '待機機を昇格できません。準備済みの版・復元データ・専用トンネルが必要です。'
    [[ $(< "$base/deps.commit") == "$(git -C "$base/app" rev-parse --verify HEAD)" && -d $base/app/node_modules ]] ||
      fail '待機機を昇格できません。準備済みの版と依存ライブラリが一致しません。'
    [[ -n ${STANDBY_EXPECT_COMMIT:-} && $(< "$base/deps.commit") == "$STANDBY_EXPECT_COMMIT" ]] ||
      fail '待機機を昇格できません。準備済みの版と復元データの版が一致しません。'
    [[ -f $base/app/src/tenant-revocations.js && -n ${TW_TENANT_REVOCATIONS_CONFIG:-} ]] ||
      fail '待機機を昇格できません。失効台帳に対応する版と失効台帳の設定が必要です。'
    use_node && command -v cloudflared >/dev/null ||
      fail '待機機を昇格できません。Node.js または cloudflared がありません。'
    export TW_REQUIRE_TENANT_REVOCATIONS=1
    start_services "$token"
    return
  fi
  if [[ $action == prepare ]]; then
    [[ ! -e $base/data && -z ${DATA_TARBALL:-}$data_url ]] ||
      fail '待機機を準備できません。稼働データのない専用ディレクトリを使ってください。'
    if runner_pid server >/dev/null || runner_pid tunnel >/dev/null; then
      fail '待機機を準備できません。既にプロセスが起動しています。'
    fi
  fi
  case $(uname -m) in
    x86_64) node_arch=x64; deb_arch=amd64 ;;
    aarch64) node_arch=arm64; deb_arch=arm64 ;;
    *) fail '対応する Linux は x86_64 または aarch64 です。' ;;
  esac
  tmp=$(mktemp -d "$base/setup.XXXXXXXX")
  trap "rm -rf -- $(printf '%q' "$tmp")" EXIT
  say 'ライコネに必要なものを確認しています。'
  install_node
  install_cloudflared
  restore_data "$data_url"
  unset DATA_TARBALL
  write_runner
  if [[ ! -d $base/app/.git ]]; then
    git init -q "$base/app"
    git -C "$base/app" remote add origin "$repo"
  fi
  git -C "$base/app" fetch -q --depth=1 origin "$ref"
  commit=$(git -C "$base/app" rev-parse 'FETCH_HEAD^{commit}')
  if [[ $(git -C "$base/app" rev-parse --verify HEAD 2>/dev/null || true) != "$commit" ||
    $(cat "$base/deps.commit" 2>/dev/null) != "$commit" || ! -d $base/app/node_modules ]]; then
    stop_runners
    git -C "$base/app" checkout -q --detach "$commit"
    (cd "$base/app" && npm ci --omit=dev --no-audit --no-fund)
    printf '%s\n' "$commit" > "$base/deps.commit"
  fi
  if [[ $action == prepare ]]; then
    say "ライコネの待機版を準備しました（$commit）。公開・起動はしていません。"
    return
  fi
  start_services "$token"
}

start_services() {
  local token=$1 mode tunnel_id url i
  local requires_revocations=${TW_REQUIRE_TENANT_REVOCATIONS:-0}
  if runner_pid server >/dev/null && { [[ $(cat "$base/server.port" 2>/dev/null) != "$PORT" ]] ||
    [[ $(cat "$base/server.revocations" 2>/dev/null || printf 0) != "$requires_revocations" ]]; }; then
    stop_runners
  fi
  if ! runner_pid server >/dev/null; then
    node -e 'require("node:net").createServer().on("error", () => process.exit(1)).listen(Number(process.env.PORT), "127.0.0.1", function () { this.close(); })' ||
      fail "ポート $PORT を開けません。ライコネは起動していません。"
    start_runner server
    printf '%s\n' "$PORT" > "$base/server.port"
    printf '%s\n' "$requires_revocations" > "$base/server.revocations"
  fi
  wait_health "$origin" 30 || fail "ライコネが応答しません。$base/server.log を確認してください。"

  mode=quick
  tunnel_id=$mode
  if [[ -n $token ]]; then
    mode=named
    tunnel_id=$(printf '%s' "$token" | sha256sum)
  fi
  if ! runner_pid tunnel >/dev/null || [[ $(cat "$base/tunnel.mode" 2>/dev/null) != "$tunnel_id" ]]; then
    if ! stop_runner tunnel; then
      stop_runner server || true
      return 1
    fi
    rm -f -- "$base/url.txt"
    TUNNEL_TOKEN=$token start_runner tunnel "$mode"
    printf '%s\n' "$tunnel_id" > "$base/tunnel.mode"
  fi
  if [[ $mode == quick ]]; then
    for ((i = 0; i < 45; i++)); do
      if [[ -s $base/url.txt ]]; then
        url=$(< "$base/url.txt")
        if curl -fsS --max-time 2 "$url/healthz" >/dev/null 2>&1; then break; fi
      fi
      url=
      sleep 1
    done
    [[ -n $url ]] || fail "公開 URL が応答しません。$base/tunnel.log を確認してください。"
    say "公開 URL: $url（保存先: $base/url.txt）"
    say "管理画面: $url/admin/"
  else
    say '公開 URL: Cloudflare で設定したホスト名（公開側の疎通は別途確認してください）。'
  fi
  say "ライコネは起動しています。管理画面の合言葉の場所: $base/data/admin-token.txt"
  printf '停止: bash %q stop\n' "$base/run.sh"
}

# curl | bash でも main が終わるまで処理中のスコープを保つ。
main "$@"
