# tiktok-widget の作業規則

TikTok LIVE 配信用のオーバーレイ、ダッシュボード、管理画面を提供する Node.js アプリです。
ギフト・コメント・視聴者数などを受け、WebSocket でウィジェットへ配り、設定と履歴を保存します。

## 絶対に守ること

- 画面に出す文字は日本語。ギフト名は `src/gift-names-ja.json` の対応表を GiftID で引く。表にないものは TikTok から来た名前を使い、自分で訳さない。
- TikTok の gift/list API を呼ぶときは `webcast_language=ja-JP` を付ける。対応表の作り直しは `node scripts/giftlist.js [roomId ...]` を使う。
- 公開ウィジェットの JavaScript (`public/widgets/`) は ES5。外部 CDN は使わない。
- `config.yaml` と `data/` は本番の設定・記録。書き換えない。確かめるときは開発サーバーか自分で起こした一時サーバーを使う。
- `npm test` を常に緑にする。既存のテストの書き方に合わせる。
- 本番（ポート3939、`widget.lul.works`）に触らない。反映は `~/tiktok-widget` へのコミットで自動（配信していないとき・テストが通ったときだけ。`deploy/server/`）。配信中に再起動・`/reload`・設定変更をしない。
- `main` や本番のブランチに push しない。作業は `dev/*` などのブランチと worktree で行う。
- 見た目を変えたら、本番に出す前にオーナーが確認する。
- 鍵・トークン・配信者の個人情報をコード、ログ、コミットに出さない。
- 新しい道具・ライブラリ・Minecraft のプラグインは、公式の配布所(npm、PyPI、公式サイト、Hangar・Modrinth・SpigotMC)からだけ入れ、入れる前にオーナーに聞く。GitHub Releases の実行ファイル、フォーク、知らない配布元からは入れない。
- 説明していないルールを作らない。回数・待ちの上限、捨てる・飛ばす、確率の調整を入れるときは、同じ変更でダッシュボードの説明と README の「上限と飛ばすルール」に書く（`test/hidden-limits.test.js` が見張る）。ギフトで回る・光る演出は上限をつけず、投げた分を全部回す。
- 操作は開発サーバー(3940)に向けた MCP `tiktok-widget-dev` を使う([操作方法](docs/knowledge/operating.md))。本番に向ける MCP は用意しない。

- コードを変えたら、同じ変更の中で README も直す（一番上の README.md の機能の一覧と、フォルダごとの README.md のファイルの一覧）。ファイルの頭には何をするファイルかを1〜2行で書く。
- コードは AI にしか読めない形ではなく、人のプロが書いて整備したように書く。名前で意味が分かるようにし、1つの関数は1つのことをし、周りの書き方に合わせ、なぜそうしたかを短いコメントで書く。古いコピー(.bak など)を残さず、整理はどこでも大事にする。

## 知識

- [目次](docs/knowledge/README.md)
- [構成とファイルの地図](docs/knowledge/architecture.md)
- [本番・開発・トンネル](docs/knowledge/environments.md)
- [開発の流れ](docs/knowledge/dev-flow.md)
- [操作方法](docs/knowledge/operating.md)
- [妨害マイクラ](docs/knowledge/minecraft.md)
- [デザイン判断](docs/knowledge/design.md)
- [製品の決定記録](docs/knowledge/decisions.md)
