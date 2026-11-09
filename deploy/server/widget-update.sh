#!/usr/bin/env bash
# 部品だけの更新（配信中でも、使われていない部品だけ）。
# 使い方: deploy/server/widget-update.sh <部品ID> <取り込むコミット> [--live-ok]
# --live-ok は「使用中の部品に、見た目だけの変更を配信中のまま入れる」形。
# フォルダ内の差分が .html / .css だけのときだけ進む。プレビュー確認と
# 配信画面に重ねた絵の確認を済ませた側が、付けてよい（台帳に mode=live-ok と prev が残る）。
#
# 順序：
#   1. 本番で配信中の人がその部品を使っていないか、管理用の入口で確かめる（使っていたら止まる）
#   2. 取り込むコミットの側の作業場で、その部品の対象テストを回す（落ちたら止まる）
#   3. その部品が読む共有ファイルが本番と食い違っていたら止まる（共有の変更は全体の関門で出す）
#   4. 本番の木へ、その部品のフォルダだけを取り込んで保存する。サーバーは再起動しない
#   5. 台帳（~/.local/state/tiktok-widget/widget-updates.log）に1行残す
set -euo pipefail

WIDGET="${1:?使い方: widget-update.sh <部品ID> <コミット> [--live-ok]}"
REF="${2:?使い方: widget-update.sh <部品ID> <コミット> [--live-ok]}"
LIVE_OK=0
[ "${3:-}" = "--live-ok" ] && LIVE_OK=1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STATE_DIR="$HOME/.local/state/tiktok-widget"
PORT="${TW_PORT:-3939}"

fail() { echo "止めました: $1" >&2; exit "${2:-1}"; }

git rev-parse --verify "$REF^{commit}" >/dev/null 2>&1 || fail "コミット $REF が見つからない"
[ -d "public/widgets/$WIDGET" ] || fail "部品 $WIDGET のフォルダが本番の木にない"
git cat-file -e "$REF:public/widgets/$WIDGET/widget.json" 2>/dev/null || fail "コミット $REF に部品 $WIDGET がない"

# 本番の木の、その部品の場所に未保存の変更があったら触らない。
# 未保存の新規ファイル（_baseline 等）は、取り込む版に同じ置き場所が無い限り触られないので妨げない
DIRTY="$(git status --porcelain -- "public/widgets/$WIDGET" | grep -v '^?? ' || true)"
[ -z "$DIRTY" ] || fail "本番の木の $WIDGET に未保存の変更がある"
for UNTRACKED in $(git status --porcelain -- "public/widgets/$WIDGET" | sed -n 's/^?? //p'); do
  if git cat-file -e "$REF:$UNTRACKED" 2>/dev/null; then
    fail "本番の木の $UNTRACKED が未保存で、取り込む版にもある"
  fi
done

# 1. 使用中チェック
TOKEN_FILE="data/admin-token.txt"
[ -f "$TOKEN_FILE" ] || fail "管理用の合言葉ファイルがない"
USAGE="$(curl -s -m 10 -H "x-admin-token: $(cat "$TOKEN_FILE")" "http://127.0.0.1:$PORT/admin/api/widget-usage")" \
  || fail "使用状況の入口に届かない"
printf '%s' "$USAGE" | grep -q '"live"' || fail "使用状況を確認できない（入口がまだ本番に入っていないか、合言葉が違う）"
IN_USE="$(printf '%s' "$USAGE" | WIDGET="$WIDGET" node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log((j.inUse||[]).includes(process.env.WIDGET)?'yes':'no')}catch{console.log('bad')}})")"
if [ "$IN_USE" != "no" ] && [ "$LIVE_OK" != "1" ]; then
  fail "配信中の人が $WIDGET を使っている間は触らない"
fi
if [ "$LIVE_OK" = "1" ]; then
  CHANGED="$(git diff --name-only HEAD "$REF" -- "public/widgets/$WIDGET")"
  [ -n "$CHANGED" ] || fail "取り込む差分がない"
  if printf '%s\n' "$CHANGED" | grep -qvE '\.(html|css)$'; then
    fail "見た目だけの変更ではない（.html / .css 以外が混ざっている）。配信が終わってから出す"
  fi
fi

# 2. 対象テスト（取り込む側の作業場で回す。本番の木では回さない）
TMP="$(mktemp -d)"
trap 'git worktree remove --force "$TMP/wt" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
git worktree add --detach "$TMP/wt" "$REF" >/dev/null 2>&1 || fail "作業場を作れない"
ln -s "$ROOT/node_modules" "$TMP/wt/node_modules"
TESTS=()
for f in "$TMP/wt/test/"*"$WIDGET"*".test.js"; do [ -e "$f" ] && TESTS+=("${f#"$TMP"/wt/}"); done
TESTS+=("test/public-js.test.js")
( cd "$TMP/wt" && node --test --test-timeout=120000 "${TESTS[@]}" ) || fail "対象テストが落ちた"

# 3. 共有ファイルの食い違いチェック（食い違っていたら全体の関門へ回す）
while IFS= read -r libref; do
  name="${libref#lib/}"
  prod="public/widgets/lib/$name"
  [ -f "$prod" ] || fail "共有ファイル lib/$name が本番にない。全体の関門で出す"
  cmp -s <(git show "$REF:public/widgets/lib/$name" 2>/dev/null) "$prod" \
    || fail "共有ファイル lib/$name が本番と違う。全体の関門で出す"
done < <(grep -rhoE "lib/[A-Za-z0-9._-]+\.(js|css)" "$TMP/wt/public/widgets/$WIDGET" --include='*.html' --include='*.js' --include='*.css' | sort -u)

# 4. 取り込み（その部品のフォルダだけ）
PREVHEAD="$(git rev-parse --short HEAD)"
git checkout "$REF" -- "public/widgets/$WIDGET"
EXTRA="$(git status --porcelain | grep -v '^??' | grep -v "public/widgets/$WIDGET/" || true)"
if [ -n "$EXTRA" ]; then
  git checkout HEAD -- "public/widgets/$WIDGET"
  fail "部品の外にも変更が出たので戻した"
fi
git add -- "public/widgets/$WIDGET"
MSG="部品だけ更新: $WIDGET（$REF から、配信中の部分更新）"
[ "$LIVE_OK" = "1" ] && MSG="部品だけ更新: $WIDGET（$REF から、使用中のまま見た目だけ）"
git commit -q -m "$MSG" -- "public/widgets/$WIDGET" \
  || fail "保存できなかった（差分がないのかもしれない）"
NEWHEAD="$(git rev-parse --short HEAD)"
mkdir -p "$STATE_DIR"
MODE=""
[ "$LIVE_OK" = "1" ] && MODE=" mode=live-ok"
echo "$(date -Iseconds) widget=$WIDGET ref=$REF head=$NEWHEAD prev=$PREVHEAD$MODE" >> "$STATE_DIR/widget-updates.log"
echo "取り込みました: $WIDGET（保存 $NEWHEAD）。開いている画面は待機のときに自分で読み直します。サーバーは再起動していません。"
[ "$LIVE_OK" = "1" ] && echo "戻すとき: widget-update.sh $WIDGET $PREVHEAD --live-ok（台帳の prev と同じ）"
