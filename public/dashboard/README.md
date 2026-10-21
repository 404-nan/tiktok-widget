# public/dashboard/

配信者が接続、設定、外部ツール受け口、テスト送信、ウィジェット、AI接続を行う画面です。公開画面の JavaScript は ES5 ですが、管理画面はこの制約の対象外です。

## ファイルの地図

| ファイル | 役目 |
| --- | --- |
| `index.html` | ダッシュボードの画面構造、日本語の説明、入力欄 |
| `app.js` | 接続状態、設定、イベント、各画面の起動 |
| `ingest.js` | 外部ツール受け口の状態表示、鍵の作成・削除・コピー |
| `ai-streamer.js` | 配信者専用AIトークンの発行・コピー・取り消しと期限表示 |
| `ai.js` | 「AIにたのむ」案の表示と反映 |
| `templates.js` | 配信テンプレートのカード、差分、適用、元戻し |
| `stage.js` | 配信画面の見本、遊び方、ウィジェット配置の表示と保存 |
| `editor.js` | かんたん・くわしい設定フォームとプレビューを組み立てる |
| `simple.js` | かんたん設定の機能一覧、分類、項目名、単位、説明 |
| `dashboard-descriptions.js` | 共通の短い説明と表示モードごとの説明文 |
| `editor-layout.js` | 詳細設定の折りたたみ条件 |
| `roulette-urls.js` | ルーレットごとの個別URLを詳細設定に描画 |
| `cutin-crop.js` | 写真の切り抜き入力 |
| `gift-picker.js` | ギフト選択欄 |
| `gift-sounds-form.js` | ギフト音の設定欄と状態 |
| `rules.js` | 条件ルールの編集欄 |
| `status-text.js` | 状態表示と接続状態 |
| `timer-length.js` | タイマーのギフト延長量 |
| `weight.js` | ルーレット重み入力 |
| `common.js` | API、コピー、テーマ、画面共通の処理 |
| `charts.js` | 履歴画面などのグラフ |
| `dev-features.js` | 開発時だけ使う機能 |
| `style.css` | ダッシュボード全体とAI入口の見た目 |

## 使われ方

`index.html` が `app.js` を読み、`app.js` が各画面部品を読みます。`src/schema.js` の設定定義を `simple.js` と対応させ、保存は `/api/config`、配信テンプレートは `/api/templates`、受け口の状態は `/api/ingest` と `/api/status` を使います。`/t/<ダッシュボード鍵>/dashboard/` から `/api/ai/streamer` を使い、OBS鍵ではこの入口を開けません。段階写真は `media/` の候補を選びます。

最後に直した日: 2026-10-21
