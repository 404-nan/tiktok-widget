# test/acceptance/

カードの完成条件を、外部から見える動作で確かめる受け入れテストです。

| ファイル | 役目 |
| --- | --- |
| `push-button.test.js` | 押しボタンの設定・集計・操作入口・公開コードを検査する |
| `participation-vote-review.test.js` | コメント投票のレビュー条件を検査する |
| `cheer.test.js` | いいね応援の設定・集計・操作入口・記録分離を検査する |
| `cheer-public.test.js` | いいね応援の公開コードと一覧登録を検査する |

テストは一時ディレクトリを使い、本番の `config.yaml` と `data/` は変更しません。
