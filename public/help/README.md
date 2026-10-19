# public/help

配信者向けの「使い方」ページです。ダッシュボードから開きます。

## ファイル

- `index.html`: 使い方のページ1枚。はじめに、OBS に出す、ルーレット、延長タイマー、ためす、困ったとき、くわしい説明(docs/guide への行き先)の節がある。見た目は `../dashboard/style.css` の部品を使い、このページ専用の CSS は置き場所と大きさだけ。

## つながり

- 使われる側: ダッシュボード(`public/dashboard/`)から「使い方」として開かれる
- 使う側: `../dashboard/style.css`。「くわしい説明」の節は GitHub 上の `docs/guide/` へリンクする
- 文書の中身は `docs/guide/` と `docs/news/` にある。この HTML は短い入口だけを持つ

最後に直した日: 2026-10-19
