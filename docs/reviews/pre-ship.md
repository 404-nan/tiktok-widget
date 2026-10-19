重い順に5件です。

1. **`src/runtime.js:400` と `src/runtime.js:429`(本番のテナントで案内が消える)**
   - `setTemplate` は `tenants.js:344` で `guideDone=false` にします。
   - テンプレートを入れるか元に戻すたびに、その配信者の初回案内が最初から出直します。
   - 元に戻しても `guideDone` は戻りません。カードの「元に戻すと、入れる前の設定・ウィジェット・遊び方の名前に戻る」を満たしていません。
   - 同じ理由で、`bougai` などの id が `template` に入り、既存の `stage.js` の遊び方と同じ枠を上書きします。

2. **`src/templates/endurance.json:2` と `public/admin/admin.js:258`(既存の配信者の表示が変わる)**
   - 新テンプレートの id `endurance` が、既存の遊び方 `endurance`(`stage.js:17`、「耐久・カウントダウン」)とぶつかっています。
   - 管理画面の名前表示を「耐久・目標配信」に書き換えたので、すでに「耐久・カウントダウン」を選んだ配信者の表示が変わります。
   - `stage.js` の `TEMPLATES` には手を入れていません(カードの決まり)。ただ、同じ id を使ったために元の遊び方と区別できなくなっています。

3. **`src/templates.js:79` と `src/runtime.js:399`(画面の説明と実際の動きが違う)**
   - プレビューは、テナントで `optionalWidgets`(`winsFx`)が未使用なら「使うものに足す」と出します。
   - `apply` が足すのは `template.widgets` だけで、`optionalWidgets` は足しません。
   - 画面は「足す」と言うのに、実際は入りません。

4. **`public/dashboard/templates.js:63` と `public/dashboard/templates.js:66`(失敗しても何も出ない)**
   - 入れる・元に戻す・プレビューの `api()` 呼び出しに `catch` がありません。
   - 409(配信中・設定が変わった)や 422 が起きても、メッセージが出ません。
   - 失敗しても `applied=true` や再描画に進むか、未処理のまま止まります。
   - 配信中に押したときが一番困ります。ほかの画面は `.catch(setMessage)` で揃えています。

5. **`src/runtime.js:428` と `src/runtime.js:498`(元に戻すと遊び方の名前が戻らない場合がある)**
   - `setWidgets` と `setTemplate` を `beforeState.widgets` が真のときだけ戻します。
   - 元のウィジェットが空の配列でも真なので通常は動きます。
   - ただし `templates/undo` は `aiUndo` を AI の反映と共有します。AI の反映のあとに `templates/undo` を押すと、AI 反映では `beforeState` が同じ値のままなので、何も戻りません(エラーも出ません)。

**確認していない点:** テストと画面は実行していません。AC-14 の撮影も未確認です。README の機能表(`README.md:10`)は、1 と 3 のぶんだけ「できた」より状態が低いはずですが、直す必要があるかは判断していません。
