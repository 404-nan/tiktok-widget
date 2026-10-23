#!/usr/bin/env bash
# 本番の自動反映。新しいコミットがあり、誰も配信していなければ、テストが通ったときだけ本番を再起動する。
# systemd の tiktok-widget-deploy.timer から1分ごとに呼ぶ。配信中は何もしないで、終わってから反映する。
set -u
REPO=${TW_REPO:-$HOME/tiktok-widget}
HEALTHZ=${TW_HEALTHZ:-http://127.0.0.1:3939/healthz}
STATE_DIR=${XDG_STATE_HOME:-$HOME/.local/state}/tiktok-widget
mkdir -p "$STATE_DIR"
cd "$REPO" || exit 1

head=$(git rev-parse HEAD)
[ "$head" = "$(cat "$STATE_DIR/deployed" 2>/dev/null)" ] && exit 0
[ "$head" = "$(cat "$STATE_DIR/failed" 2>/dev/null)" ] && exit 0
# 誰かが途中まで書き換えている間は出さない（本番はこのフォルダのファイルをそのまま動かす）
git diff --quiet HEAD -- || { echo "未コミットの変更があるので待ちます"; exit 0; }

# 配信中なら待つ。サーバーが落ちていて答えないときは、そのまま反映する
health=$(curl -fsS -m 5 "$HEALTHZ" 2>/dev/null || true)
live=$(printf '%s' "$health" | grep -o '"live":[0-9]*' | cut -d: -f2)
if [ "${live:-0}" -gt 0 ]; then
  admin_token=${TW_ADMIN_TOKEN:-$(cat "${REPO}/data/admin-token.txt" 2>/dev/null || true)}
  details=$(curl -fsS -m 5 -H "x-admin-token: ${admin_token}" "${HEALTHZ%/healthz}/admin/api/deploy-status" 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const x=JSON.parse(s); console.log((x.live||[]).map(v=>v.name+'、'+v.minutes+'分').join('・'))}catch{}})" || true)
  echo "配信中（${details:-${live}人}）なので、終わってから反映します"
  exit 0
fi

echo "反映します: $(git log -1 --format='%h %s')"
if ! npm test >"$STATE_DIR/last-test.log" 2>&1; then
  echo "テストが通らないので反映しません（$STATE_DIR/last-test.log）"
  echo "$head" >"$STATE_DIR/failed"
  exit 1
fi
systemctl --user restart tiktok-widget
for _ in $(seq 1 20); do
  sleep 1
  curl -fsS -m 2 "$HEALTHZ" >/dev/null 2>&1 && { echo "$head" >"$STATE_DIR/deployed"; echo "反映しました"; exit 0; }
done
echo "再起動したのに応答がありません"
exit 1
