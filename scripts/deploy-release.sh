#!/bin/bash
# 本番への投入を1つの命令にした道具（2026-11-22）。LuLServer の ~/tiktok-widget で回す。
# 使い方: bash scripts/deploy-release.sh <入れる枝>
# 順番: 配信が無いこと → 未保存変更の退避 → 台帳へ記録 → 早送り → 再起動 → 実物確認 → 退避の復帰。
# 途中で失敗したら、戻しの命令を表示して止まる（自動では戻さない）。
set -u
cd "$(dirname "$0")/.." || exit 2
BRANCH="${1:?入れる枝を指定すること}"
NODE=/home/lul/.hermes/node/bin/node
LEDGER=~/backups/RELEASE-LEDGER.jsonl
mkdir -p ~/backups
export XDG_RUNTIME_DIR=/run/user/$(id -u)

live=$(curl -s http://127.0.0.1:3939/healthz | sed -n 's/.*"live":\([0-9]*\).*/\1/p')
if [ "${live:-x}" != "0" ]; then echo "配信中（live=${live:-不明}）のため止める"; exit 1; fi

FROM=$(git rev-parse HEAD)
TO=$(git rev-parse "$BRANCH") || exit 1
VERSION=$(git show "$BRANCH:package.json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')

# 未保存の変更は、ファイルごとの指紋を取ってから退避する
STASHED=""
mods=$(git status --porcelain --untracked-files=no | awk '{print $2}')
if [ -n "$mods" ]; then
  for f in $mods; do sha256sum "$f"; done > ~/backups/deploy-local-shas.txt
  git stash push -q -m "deploy-release: 投入前の退避" -- $mods || { echo "退避に失敗したため止める"; exit 1; }
  STASHED=1
  echo "未保存の変更を退避した: $mods"
fi

restore_local() {
  if [ -n "$STASHED" ]; then
    git stash pop -q || { echo "退避の復帰でぶつかった。stash に残してあるので手で戻すこと"; return 1; }
    while read -r sha f; do
      now=$(sha256sum "$f" | awk '{print $1}')
      [ "$now" = "$sha" ] || { echo "復帰後の指紋が違う: $f"; return 1; }
    done < ~/backups/deploy-local-shas.txt
    echo "未保存の変更は元のまま復帰した"
  fi
}

echo "{\"ts\":\"$(date -Is)\",\"from\":\"$FROM\",\"to\":\"$TO\",\"version\":\"$VERSION\",\"branch\":\"$BRANCH\"}" >> "$LEDGER"
if ! git merge --ff-only "$BRANCH" >/dev/null; then
  echo "早送りできないため止める（台帳には記録済み。頭は動いていない）"
  restore_local
  exit 1
fi
systemctl --user restart tiktok-widget.service
sleep 4
ok=1
curl -sf http://127.0.0.1:3939/healthz >/dev/null || ok=0
running=$($NODE -e "import('./src/version.js').then(v => console.log(v.PRODUCT_VERSION))" 2>/dev/null)
[ "$running" = "$VERSION" ] || ok=0
if [ "$ok" != "1" ]; then
  echo "再起動後の確認で失敗（動いている版数: ${running:-不明} / 期待: $VERSION）"
  echo "戻すとき: bash scripts/rollback-release.sh"
  restore_local
  exit 1
fi
restore_local || exit 1
echo "投入完了: $FROM → $TO（版数 $VERSION）。台帳: $LEDGER"
