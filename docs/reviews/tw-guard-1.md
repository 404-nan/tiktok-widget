# レビュー: tw-guard 

**確認結果（実走込み。重大な問題は見つからなかった）**
1. **カード満たず**: なし。AC-1〜AC-5 は実装・テストどちらも満たす。`npm test` 実走 274/274 全緑（うち guard 系 15/15）。`refuseLocalOperation` は`isHosted()`（src/admin.js:14）の被る 3 デプロイ形状（oracle・PC・docker）すべてに効く。
2. **既存破壊の恐れ**: なし。diff は `src/admin.js`・`test/acceptance/guard.test.js`・カード文書・`.lane-impl` のみ。`/ai/v1`・ダッシュボード・設定項目への変更はゼロ。
3. **カード外の追加**: `.lane-impl`（内容は `codex`）だけ。ワークフロー用の目印らしく、実装に影響なし。
4. **テストの弱い箇所**: `rec.count("/api/simulate")` は **URL 文字列の完全一致**比較（test/acceptance/guard.test.js:224-225 など）。実装側が URL にクエリ文字列を付けても「送信した」とは数えられず、不通条件が弱くなる。接頭辞一致 (`startsWith()`) で見ればより固い。
5. **本番で起きそうな問題**:
   - `isHosted()` はあくまで **MCP/CLI プロセスの稼働環境**（`TW_HOSTED` と `tenants.json` の場所）での判断。カードの文言「**送り先の**サーバーが hosted と分かったら送らない」より領域が狭く、外から `TW_SERVER` で本番の spin_roulette を向けるケースはガードの網から外れる。加えて `/api/control` は server 側に認証がなく、`entitled()` のみで判断されるため、外からの `spin_roulette` が本番で刺さる可能性は残る（Caio source: src/runtime.js:601-604）。カードの文面の解釈次第だが、認識しておくべき点。
   - `tw unset`（引数なし）は `process.exitCode=1` の前に Node が未処理例外で落ちる（`bin/tw.js:89`、`set`/`merge` の `parseValue` の例外チェックが `unset` にはない）。**既存のバグ**でこの変更で増えたわけではないが、カードが対象とする CLI 表面。
6. **画面**: `artifacts/shots/` は今回のブランチには無い。
