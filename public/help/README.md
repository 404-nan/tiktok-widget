# public/help/

配信者向けの使い方を、日本語の静的 HTML として案内するフォルダです。ダッシュボードから開きます。

## ファイル

| ファイル | 役目 |
| --- | --- |
| `index.html` | OBS、ウィジェット、OBS連携、外部ツール受け口、配信前のテスト、外部AIの発行・dry-run・取り消し、困ったときの案内 |

## つながり

- 使われる側: `public/dashboard/` の「使い方」リンク
- 使う側: `../dashboard/style.css`、`docs/guide/`、`docs/news/`
- ページには、はじめに、OBS、ルーレット、延長タイマー、ためす、外部AI、困ったとき、くわしい説明の入口があります。

`server.js` が `/help/` として配り、ダッシュボードからリンクします。受け口の項目名と送信例は `docs/cards/ingest.md` の受け入れ名に合わせます。見た目は `public/dashboard/style.css` を使います。

最後に直した日: 2026-10-21
