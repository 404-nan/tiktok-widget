# レビュー: tw-guard 3巡目

**確認したもの**: リポジトリ `/home/lul/tiktok-widget-wt/guard`（base `19716bd1` 〜 HEAD、`d3ac43e`）、カード `docs/cards/tw-guard.md`、`npm test` を自分で実行（280/0 全通、ガード関係 21 件も個別に全通）。`artifacts/shots/` は存在しない（画面変更なし、参照不可）。
## 問題の報告
**1. カードを満たしていない箇所** — **問題なし**。AC-1〜AC-9 すべてに対応する実装と受け入れテストを確認した。
**2. 既存機能を壊していそうな箇所** — 大きなものはない。ただし挙動として次の 1 点が変わる：
- `testEvent` / `spinRoulette` の送り先判定は「`/api/me` が **404** → hosted」で行われる（src/admin.js:44）。`/api/me` を持たない古いバージョンのサーバー（テナント機能導入前コミット `78452f9` より前）を TW_SERVER に向けていた 1 人用環境では、これまで通っていた `tw test` / `tw spin` が新しく拒否される方向（安全側）に変わる。現在のリポジトリ内のバージョンには `/api/me` があるので、最新版どうしでは壊れない。
**3. カードに無い追加・変更**
- `.lane-impl`（内容は `codex`）がリポジトリ直下に新規コミットされている。カードに無い。ワークフロー用マーカーのようで実装には影響しない（docs/reviews/tw-guard-1.md にも記載があるが、コミットとして残したままになっている）。
- `docs/reviews/tw-guard-1.md`・`tw-guard-2.md` もカードに無い追加（レビュー記録そのもの）。
**4. テストが弱い箇所**
- `guard-round2.test.js` / `guard-round3.test.js` の `startHostedServer` がポートを `34000 + random(0..20000)` で選び、衝突時の再試行がない（同時実行や使用中ポートではテストが落ちうる）。preparedraft
- `destinationIsHosted` の「200 で非テナント（`mode` なし/HTML）を返す送り先」は hosted と判定できないまま `/api/simulate` を送る現在の仕様に対する否定テストがない（該当ケースを検証したテストは無い。ただし POST 自体は 404/エラーで止まるので実害は出にくい）。
- AC-6/AC-8 の2つのテストファイルでハーネス（`startHostedServer`・`startProxy`・`withMcp` 等約 180 行）がほぼ重複しており、片方だけ直す(items/ports等)とずれやすい。
**5. 本番で起きそうな問題**
- ガードの `isHosted()` は「CLI/MCP を実行するプロセスの `TW_HOSTED`」と「`tw` 側が見る data の場所 = `TW_DATA` が無ければ 素の `dirname(TW_CONFIG)/data`」に依存する（src/admin.js:11,14）。本番のサーバーが `TW_DATA` を指定して動いていて、agent 側の CLI/MCP プロセスに同じ `TW_DATA` が伝わっていないと、実際の `tenants.json` と別の場所を探して拒否が効かない。`TW_HOSTED=1` も同様に agent プロセスの環境に無いと効かない（デフォ構成＝TW_DATA 未指定の配置では一致する）。
- 已有 دستگاه `tw rush`・`tw wins`・`tw timer`・`tw boss`・`tw mc` には refusing も /api/me 判定も入っていない（カードの範囲では無いが事実として残る）。本番 hosted では `/api/control` はルートに無いため飛んでも 404 で止まり書き込みは発生しない。
