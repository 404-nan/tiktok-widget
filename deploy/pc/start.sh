#!/usr/bin/env bash
# 自分の PC で動かして、Cloudflare Tunnel で https の URL を付ける（Mac / Linux 用）。
#   Mac:  brew install node cloudflared
#   実行: bash deploy/pc/start.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null || { echo "Node.js が入っていません（brew install node）"; exit 1; }
command -v cloudflared >/dev/null || { echo "cloudflared が入っていません（brew install cloudflared）"; exit 1; }
[ -d node_modules ] || npm ci --omit=dev

export TW_HOSTED=1 HOST=127.0.0.1 PORT=3939
node server.js &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORT}/healthz" >/dev/null; then
    break
  fi
  sleep 0.5
done

if [ -n "${TUNNEL_TOKEN:-}" ]; then
  cloudflared tunnel run --token "$TUNNEL_TOKEN"
else
  echo
  echo "★ 下に出る https://〇〇.trycloudflare.com が公開 URL です。管理画面はその後ろに /admin/ を付けます。"
  echo "★ 合言葉は data/admin-token.txt に入っています。"
  echo
  cloudflared tunnel --url http://127.0.0.1:3939
fi
