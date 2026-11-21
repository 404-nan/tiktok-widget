#!/bin/bash
# 台帳の最後の投入を戻す道具（2026-11-22）。LuLServer の ~/tiktok-widget で回す。
# 使い方: bash scripts/rollback-release.sh
# 未保存の変更は退避→復帰で守る。戻したことも台帳に残す。
set -u
cd "$(dirname "$0")/.." || exit 2
LEDGER=~/backups/RELEASE-LEDGER.jsonl
export XDG_RUNTIME_DIR=/run/user/$(id -u)
[ -f "$LEDGER" ] || { echo "台帳が無いため戻せない"; exit 1; }
FROM=$(tail -1 "$LEDGER" | sed -n 's/.*"from":"\([0-9a-f]*\)".*/\1/p')
NOW=$(git rev-parse HEAD)
[ -n "$FROM" ] || { echo "台帳の最後の記録から戻し先を読めない"; exit 1; }

live=$(curl -s http://127.0.0.1:3939/healthz | sed -n 's/.*"live":\([0-9]*\).*/\1/p')
if [ "${live:-x}" != "0" ]; then echo "配信中（live=${live:-不明}）のため止める"; exit 1; fi

mods=$(git status --porcelain --untracked-files=no | awk '{print $2}')
if [ -n "$mods" ]; then
  for f in $mods; do sha256sum "$f"; done > ~/backups/rollback-local-shas.txt
  git stash push -q -m "rollback-release: 戻し前の退避" -- $mods || { echo "退避に失敗したため止める"; exit 1; }
fi
git reset --hard -q "$FROM" || { echo "戻し先へ移れなかった"; exit 1; }
if [ -n "$mods" ]; then
  git stash pop -q || { echo "退避の復帰でぶつかった。stash に残してあるので手で戻すこと"; exit 1; }
  while read -r sha f; do
    now=$(sha256sum "$f" | awk '{print $1}')
    [ "$now" = "$sha" ] || { echo "復帰後の指紋が違う: $f"; exit 1; }
  done < ~/backups/rollback-local-shas.txt
fi
systemctl --user restart tiktok-widget.service
sleep 4
curl -sf http://127.0.0.1:3939/healthz >/dev/null || { echo "戻した後の healthz が返らない"; exit 1; }
echo "{\"ts\":\"$(date -Is)\",\"rollback\":true,\"from\":\"$NOW\",\"to\":\"$FROM\"}" >> "$LEDGER"
echo "戻し完了: $NOW → $FROM"
