# tiktok-widget(AI・開発者向け)

TikTok LIVE 配信者向けの演出ツール。OBS / TikTok LIVE Studio のブラウザソースに出すウィジェットと、配信者のダッシュボード、運営の管理画面。
本番は LuLServer で `widget.lul.works`(マルチテナント、`TW_HOSTED=1`)。

## コマンド

- `npm run check` … ロジックのテスト(`node --test`)と ES5 チェック。2分以内。コミット前に必ず緑
- `npm run check:ui` … Playwright の画面テスト(`test/visual/`)
- `npm run dev` … 開発サーバー。空いているポートを自分で選び、`.dev/` の使い捨てデータで動く
- `npm run shot -- <widget名>` … デモで起動して撮影し `artifacts/shots/` に保存(git に入れない)

## 決まり

- 画面の文言は日本語
- 新しく足す公開 JS(`public/widgets/` の `<script>` で読むもの)は ES5。OBS の古いブラウザで動かすため。対象は `test/es5-public.test.js` の一覧に足す
- `config.yaml` と `data/` は読むのも最小限、書き換え禁止(本番・配信者の実データ)
- ギフト名は日本語で出す。決まりは `docs/gift-names.md`
- テストは常に緑。テストを通すためにテストを弱くしない、消さない
- 作業用ブランチ(`dev/<件名>`)にだけコミットする。main / next / release* に push しない。PR まで
- 開発かどうかは環境変数で決める(`TW_DEV=1` か `TW_ENV=dev`)。Host が `widget.lul.works` なら常に本番扱い

## 守られているファイル(`.claude/hooks/guard.mjs` が止める)

| 場所 | 理由 |
| --- | --- |
| `config.yaml`、`data/` | 実データ |
| `test/acceptance/` | 受け入れテストは実装したAIとは別のAI(Codex)とめにくんだけが書く |
| `test/visual/**/*-snapshots/` と `--update-snapshots` | 見本画像はめにくんが承認したものだけ |
| main / next / release* への push、`--force` | 本体は PR とブランチ保護で守る |
| 作業場所の外への `rm -rf` | ほかの作業場所や実データを消さない |

## 作業の流れ

1. 完成条件カード `docs/cards/<日付>-<件名>.md` を `docs/cards/_template.md` から作る(数行の修正は PR の説明に3行で書けばよい)
2. 受け入れテストを別のAIが `test/acceptance/` に書き、失敗することを確かめる(依頼文は `docs/codex.md`)
3. 実装する
4. `npm run check`。画面が変わるなら `npm run check:ui` と `npm run shot`
5. 書いたAIとは別のAIがレビュー(`docs/codex.md`)
6. PR(`.github/pull_request_template.md`)

## 終わりの条件

完成条件カードの全項目に、確かめた証拠(コマンドと結果、画像)を付ける。確かめられなかった項目は「未確認」と書き、完成と言わない。
見た目が変わるものは、テストが緑でも本番に出す前にめにくんが見る。
