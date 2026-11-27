# エラー記録と再発防止テスト

## 記録の形

サーバーと配信画面のエラーは `<TW_DATA>/errors/errors-YYYY-MM-DD.jsonl`（日本時間の日付、権限 0600）に JSON Lines で残す。`TW_ERROR_DIR` で置き場を変えられる。1行には時刻、service、env、version、level、kind、where、message、cause、stack、context、fingerprint を入れる。`/t/<鍵>`、key/token/sign、Authorization、メール、長い英数字は `***` に伏せる。

同じ fingerprint は1分に1行まで書き、その間の回数は次の行の `repeat` に入れる。古い日付のファイルは消さない。

## 直した印

`docs/error-fixes.json` の1件はこの形。

```json
{
  "fingerprint": "9f2c1a7b3d10",
  "summary": "何が起きていたか",
  "fixedIn": "コミットか PR",
  "fixedAt": "2026-11-27",
  "test": { "file": "test/example.test.js", "name": "同じ失敗が起きない" }
}
```

`fingerprint` は `src/error-log.js` の `fingerprintOf` が作る12文字。直した後にまた出たかどうかは、この fingerprint と `fixedAt` で判定する。`test/error-fixes.test.js` が、必要な欄・実在するテストファイル・同じ名前のテストを全部見る。テストが無い「直した印」は付けられない。

## AI 向けの要約

`node scripts/errors-digest.mjs [--dir <置き場>] [--days 7] [--max 20]` が、いま起きているエラーと直したエラーの短い Markdown を標準出力へ出す。60行まで。配信者を特定できる文字は出さない。
