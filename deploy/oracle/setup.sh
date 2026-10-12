#!/usr/bin/env bash
# Oracle Cloud の無料サーバー（Ubuntu）に TikTok LIVE ウィジェットを入れる。何度実行しても大丈夫。
#
#   curl -fsSL https://raw.githubusercontent.com/404-nan/tiktok-widget/claude/tiktok-widgets-2qpqbk/deploy/oracle/setup.sh | sudo bash
#
# https の URL は、何もしなければ「<IP>.sslip.io」（無料・自動で証明書）になる。
# 自分のドメインを Cloudflare Tunnel で使うときは、TUNNEL_TOKEN=... を付けて実行する。
set -euo pipefail

REPO="${REPO:-https://github.com/404-nan/tiktok-widget.git}"
BRANCH="${BRANCH:-claude/tiktok-widgets-2qpqbk}"
APP=/opt/tiktok-widget
DATA=/var/lib/tiktok-widget
ENV_FILE=/etc/tiktok-widget.env
PORT=3939

say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
# 途中で自分自身（このファイル）が新しくなっても崩れないよう、全部読んでから動かす
main() {
  [ "$(id -u)" = 0 ] || { echo "sudo を付けて実行してください"; exit 1; }

  say "必要なものを入れています（数分かかります）"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y git curl ca-certificates gnupg iptables-persistent
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi

  say "プログラムを取ってきています"
  id tw >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin tw
  mkdir -p "$DATA"
  if [ -d "$APP/.git" ]; then
    git -C "$APP" fetch --depth 1 origin "$BRANCH"
    git -C "$APP" reset --hard FETCH_HEAD
  else
    git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
  fi
  (cd "$APP" && npm ci --omit=dev --no-audit --no-fund)
  chown -R tw:tw "$DATA"

  # 合言葉は初回だけ作る（2回目以降はそのまま）
  if [ ! -f "$ENV_FILE" ]; then
    (umask 077 && cat > "$ENV_FILE") <<CONF
TW_HOSTED=1
HOST=127.0.0.1
PORT=$PORT
TW_DATA=$DATA
TW_ADMIN_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 28)
# TIKTOK_SIGN_API_KEY=（Euler Stream の API キーがあれば）
CONF
  fi

  say "いつも動いているように登録しています"
  cat > /etc/systemd/system/tiktok-widget.service <<UNIT
[Unit]
Description=TikTok LIVE ウィジェット
After=network-online.target
Wants=network-online.target

[Service]
User=tw
WorkingDirectory=$APP
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now tiktok-widget
  systemctl restart tiktok-widget

  if [ -z "${TUNNEL_TOKEN:-}" ] && systemctl is-enabled --quiet cloudflared 2>/dev/null; then
    say "Cloudflare Tunnel はそのまま使います"
    URL="（Cloudflare の画面で Tunnel に付けたドメイン）"
  elif [ -n "${TUNNEL_TOKEN:-}" ]; then
    say "Cloudflare Tunnel につないでいます"
    if ! command -v cloudflared >/dev/null; then
      arch=$(dpkg --print-architecture)
      curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch.deb"
      dpkg -i /tmp/cloudflared.deb
    fi
    cloudflared service uninstall >/dev/null 2>&1 || true
    cloudflared service install "$TUNNEL_TOKEN"
    URL="（Cloudflare の画面で Tunnel に付けたドメイン）"
  else
    say "https の URL を用意しています（Caddy）"
    if ! command -v caddy >/dev/null; then
      curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -y
      apt-get install -y caddy
    fi
    IP=$(curl -fsS https://api.ipify.org)
    HOSTNAME="${IP//./-}.sslip.io"
    cat > /etc/caddy/Caddyfile <<CADDY
$HOSTNAME {
  encode gzip
  reverse_proxy 127.0.0.1:$PORT
}
CADDY
    # Oracle の Ubuntu は最初から 80 / 443 を閉じているので開ける
    for p in 80 443; do
      iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $p -j ACCEPT
    done
    netfilter-persistent save
    systemctl enable caddy
    systemctl restart caddy
    URL="https://$HOSTNAME"
  fi

  sleep 2
  systemctl is-active --quiet tiktok-widget || { journalctl -u tiktok-widget -n 30 --no-pager; echo "起動できませんでした（上のログを見てください）"; exit 1; }
  TOKEN=$(grep '^TW_ADMIN_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
  cat <<DONE

===============================================
 できました
   管理画面  $URL/admin/
   合言葉    $TOKEN
 （Oracle の画面で 80 と 443 を開けていないと、まだ見られません）
 新しくするとき: sudo bash $APP/deploy/oracle/setup.sh
 様子を見るとき: journalctl -u tiktok-widget -f
===============================================
DONE
}

main "$@"
