# scripts/

運用補助・データ作成・性能計測のスクリプトを置くフォルダです。

| ファイル / フォルダ | 役目 |
| --- | --- |
| `build-gift-names.js` | ギフト名の対応表を生成する |
| `giftlist.js` | TikTok の gift/list API からギフト一覧を取り込む |
| `fixtures/` | リハーサル用の設定・記録データ |
| `perf/` | 本番・開発サーバーから隔離して性能を測る道具 |
| `rehearse*.mjs` / `rehearse.sh` | リハーサルの収集と報告を行う |

## つながり

`perf/` は `server.js` と `public/widgets/` を読みますが、計測時は一時設定・一時データ・一時ポートだけを使います。
