#!/bin/bash
# 本番の作業ツリーに未保存の変更が無いかを見る（2026-11-21 の事故：1.2.3 の効果が未保存のまま取り消されていた）。
# 使い方（LuLServer の ~/tiktok-widget で）: bash scripts/prod-tree-check.sh
# 追跡されているファイルの変更があれば一覧を出して 1 で終わる。未追跡ファイルは情報として出すだけ。
cd "$(dirname "$0")/.." || exit 2
mods=$(git status --porcelain --untracked-files=no)
untracked=$(git status --porcelain --untracked-files=normal | grep '^??' || true)
if [ -n "$untracked" ]; then echo "未追跡ファイル（情報）:"; echo "$untracked"; fi
if [ -n "$mods" ]; then
  echo "未保存の変更があるため止める:"
  echo "$mods"
  exit 1
fi
echo "本番ツリーは保存済みの状態と一致している"
