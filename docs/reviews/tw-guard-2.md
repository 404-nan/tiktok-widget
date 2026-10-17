# レビュー: tw-guard 2巡目

レビュー完了（リポジトリ: `~/tiktok-widget-wt/guard`、19716bd...HEAD、`npm test` 実走 276/276 全緑）。`artifacts/shots/` は存在しない。
**問題あり:**
1. **AC-3 を文字どおり満たしていない（test_event の宛先チェックなし）**
   `src/admin.js:127` — `testEvent` はローカル環境判定（`refuseLocalOperation`）だけで、`spinRoulette`（133-134行）が持つ宛先チェック `destinationIsHosted()` を呼んでいない。1人用環境で `TW_SERVER` を本番に向けて `tw test` / `test_event` を実行すると、リクエストは実際に**送信される**（本番側は `/api/simulate` が開発環境以外 403 — `src/runtime.js:613` — で止まるが、カードはクライアント側が「送らずに理由を返す」ことを要求）。テストも test_event の TW_SERVER→hosted ケースを補っていない。
2. **本番で起きそうな問題: 宛先チェックがフェイルオープン**
   `src/admin.js:40-42` — `/api/me` が 5xx 等で `!res.ok` のとき `false` を返し、到達可能な hosted サーバーへ未認証の `/api/control` を POST する。カードの「分からないときは今までどおりのエラー」は「サーバーが止まっている」前提の書き方なので、応答あり・/api/me 異常のケースが網の外。この分岐はテストされていない。
3. **カード外の追加**
   `.lane-impl`（内容 `codex`）がリポジトリに入っている。実装には影響しないワークフロー用マーカー。
4. **テストの弱い箇所**
   `test/acceptance/guard.test.js:224` 等 — `rec.count('/api/simulate')` が URL 完全一致。クエリやパス違いが付くと「送った」と数えられず、不通保証が緩い（round2 側は `startsWith` で正しい）。
