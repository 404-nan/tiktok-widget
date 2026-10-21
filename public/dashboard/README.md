# ダッシュボード

設定画面の HTML と JavaScript です。`index.html` が `app.js` を起動し、`app.js` から `editor.js`、`simple.js`、各フォーム部品を使います。公開画面で使う JavaScript は ES5 ですが、管理画面はこの制約の対象外です。

## ファイルの地図

- `index.html`: 設定画面の器と各画面要素を定義する。
- `app.js`: API を読み、設定画面を起動する。
- `editor.js`: かんたん・くわしい設定フォームとプレビューを描画する。
- `simple.js`: かんたん表示のまとまり、説明、呼び名、型を定義する。
- `dashboard-descriptions.js`: 共通の短い説明と表示モードごとの説明文を選ぶ。
- `editor-layout.js`: 詳細設定の折りたたみを作る条件を定義する。
- `roulette-urls.js`: ルーレットごとの個別 URL を詳細設定内へ描画する。`editor.js` から使う。
- `common.js`: API・コピー・画面共通の小さな処理を提供する。
- `charts.js`: 履歴画面などのグラフを描画する。
- `cutin-crop.js`: 画像カットインの切り抜きを編集する。
- `dev-features.js`: 開発時だけ使う機能を定義する。
- `gift-picker.js`: ギフト選択欄を描画する。
- `gift-sounds-form.js`: ギフト音の設定欄と状態を描画する。
- `rules.js`: 条件ルールの編集欄を描画する。
- `stage.js`: 設定プレビューのステージを管理する。
- `status-text.js`: 状態表示と接続状態の処理を提供する。
- `timer-length.js`: タイマーのギフト延長量を計算する。
- `weight.js`: ルーレット重み入力を扱う。
- `style.css`: ダッシュボード全体の見た目を定義する。

## 使われ方

`app.js` → `editor.js` → `simple.js` / `dashboard-descriptions.js` / `editor-layout.js` / `roulette-urls.js` の順で設定画面を組み立てます。`common.js`、`charts.js`、`status-text.js` は複数の管理画面から共有されます。
# public/dashboard/

配信者が接続・設定・外部ツールの受け口を管理する画面です。見た目は `style.css` の共通部品にそろえます。

| ファイル | 役目 |
| --- | --- |
| `index.html` | ダッシュボードの画面構造と入力欄 |
| `app.js` | 接続、設定、イベント表示など画面全体の起動 |
| `ingest.js` | 外部ツールの受け口の状態表示、鍵の作成・削除・コピー |
| `common.js` | API、コピー、テーマなどの共通部品 |
| `style.css` | ダッシュボード全体の見た目 |

`index.html` が `app.js` を読み、`app.js` が各画面部品を読みます。受け口の状態はサーバーの `/api/ingest` と `/api/status` から取得します。
# public/dashboard/

配信者が設定を変えるダッシュボードです。共通部品を使い、画面に出す文は日本語にします。

| ファイル | 何をするか |
| --- | --- |
| `simple.js` | 「かんたん」モードの機能一覧、説明、設定項目を定義する |

## つながり

`src/schema.js` の設定定義を `simple.js` の説明と項目に対応させ、ダッシュボードの設定画面からサーバーの API を呼びます。
# public/dashboard/

配信者がウィジェット設定を行う画面です。

| ファイル | 役目 |
| --- | --- |
| `simple.js` | 「かんたん」設定の分類・項目名・まとめ文 |

設定の項目定義は `src/schema.js` を使います。
# public/dashboard/

ダッシュボードの画面と設定フォームです。`app.js` が起動し、`editor.js` が画面を切り替えます。

| ファイル | 何をするか |
| --- | --- |
| `templates.js` | 配信テンプレートのカード、差分、適用、元戻しを表示する |
| `stage.js` | 配信画面の見本、遊び方の選択、ウィジェットの配置を表示して保存する |
| `common.js` | 共通の API 呼び出し、状態表示、コピーなどを提供する |
| `editor.js` | かんたん画面のサイドバーと各設定を組み立てる |
| `simple.js` | 既存のかんたん設定の項目名と表示方法を定義する |
| `index.html` | ダッシュボードの画面の入れ物 |
| `style.css` | ダッシュボード共通の見た目 |

設定の保存は `/api/config`、配信テンプレートは `/api/templates` を使います。
# public/dashboard/

配信者が接続、テスト送信、ウィジェット設定、AI接続を行う画面です。

| ファイル | 役目 |
| --- | --- |
| `index.html` | ダッシュボードの画面構造と日本語の説明を置く |
| `app.js` | 接続状態、設定、イベント、各画面を起動する |
| `ai-streamer.js` | 配信者専用AIトークンの発行・コピー・取り消しと期限状態を表示する |
| `ai.js` | 既存の「AIにたのむ」案の表示と反映を扱う |
| `common.js` | API、コピー、画面共通の小さな部品を提供する |
| `style.css` | ダッシュボード全体とAI入口の見た目を定義する |

`/t/<ダッシュボード鍵>/dashboard/` から `/api/ai/streamer` を使います。OBS鍵ではこの入口を開けません。
# public/dashboard/

設定画面の共通部品と「かんたん」設定を置く場所です。カットインの新しい設定名と段階写真の選択肢をここへ追加します。

| ファイル | 何をするか |
| --- | --- |
| `simple.js` | かんたん画面の項目、呼び名、単位、まとめを定義する |
| `editor.js` | 設定フォームを作り、media/の候補を入力欄へ出す |
| `cutin-crop.js` | 写真の切り抜き入力を扱う |

## つながり

- `editor.js` は `simple.js` と `src/schema.js` の定義を使う。
- 段階写真は共通の写真入力として `media/` の候補を選ぶ。
