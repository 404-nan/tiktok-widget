# ideas-sync: アイデア集の ✅ を実物に合わせる

for: 北極星
仕事の種類: 直す(文書だけ)
見た目が変わるか: 変わらない

目的: `docs/IDEAS.md` は「実装済みは ✅、次に作るのは ★」と言うが、もう有る演出(コンボ `public/widgets/combo.html`・`src/combo.js`、スロット `slot.html`、PUSH ボタン `push-button.html`、プレミア柄 `src/cutin-draw.js` など)に ★ や印なしが残っている。次の演出を選ぶ AI と人が、作り済みの物をまた作ろうとする。

前提: 「有る」とは `public/widgets/` に画面があるか、`src/` に動く処理があること。

## 触ってよいファイル
- `docs/IDEAS.md`
- 新規 `test/acceptance/ideas-sync.test.js`、`test/acceptance/README.md`

## 触らないファイル
- `docs/IDEAS.md` 以外のすべての画面・処理

## 完成の条件
- AC-1 IDEAS.md の `### ` 見出しのうち、`public/widgets/` か `src/` に実物がある演出は全部 ✅ で、見出しの横に画面のパス(例 `/widgets/combo.html`)がある
- AC-2 実物が無い演出には ✅ が付いていない
- AC-3 `ideas-sync.test.js` が IDEAS.md の ✅ の見出しに書かれた `/widgets/*.html` が全部 `public/widgets/` に有ることを確かめる
- AC-4 `npm test` が全部通る

作らないもの: 新しい演出、文の書き直し(印とパスだけ)

## 証拠
- `npm test` の最後の数行

## 状態と失敗時
- 本番(3939)の再起動・書き込みはしない

## 2巡目(レビューで見つかったもの)
- なし(本番で壊れる・落ちる・鍵が漏れる・データが消える・Discord の決まりを破る指摘は無かった。`npm test` の失敗は既存の AC-4 で扱う)
