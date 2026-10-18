# brand-raikone: 配信者が見る画面と説明の製品名を「ライコネ」にする

仕事の種類: 配線(文言の置き換え)
見た目が変わるか: 文字だけ(見出し・タイトル・説明の名前が変わる。色・配置・部品は変えない)

目的: 配信者が見る画面と説明の製品名を「ライコネ」にそろえる。今は「TikTok LIVE ウィジェット」。
決まり: 名前はカタカナ「ライコネ」だけ。ローマ字の書き方は未定なので、ローマ字(Raikone など)を**どこにも書かない**。リポジトリ名・パッケージ名・URL・ドメイン・MCP の登録名(`tiktok-widget`)・サービス名・内部の識別子(localStorage のキーなど)は**変えない**。

## 変えるもの(配信者が見る文字と説明)
- `public/dashboard/index.html`: `<title>` と `.brand-title` を「ライコネ」にする(「TikTok LIVE 配信用」という説明は、説明文の中に残してよい)
- `public/dashboard/editor.js`: テナントのとき `.brand-title` に入れる文字(今は `${me.name} のウィジェット`)を `${me.name} のライコネ` にする(1 行だけ)
- `public/help/index.html`: `<title>`(「使い方 — ライコネ」)。見出しの下の一文に「ライコネの使い方です」を足してよい
- `public/admin/index.html`: `<title>`(「管理画面 · ライコネ」)
- `server.js`: 起動時の表示行 `TikTok LIVE ウィジェット` → `ライコネ`
- `README.md`: 先頭の見出しと最初の説明(`# ライコネ`、「ライコネは TikTok LIVE 配信用のオーバーレイ集です。…」)。文中の「このウィジェット集」などの呼び方も製品名に合う所だけ置き換える。インストール手順の中の `tiktok-widget` というディレクトリ名・サービス名・URL は変えない
- `config.example.yaml` の 1 行目: `# ライコネの設定`。**この 1 行に合わせて、`test/ai.test.js` の `/^# TikTok LIVE ウィジェットの設定/`(63 行目付近)だけを `/^# ライコネの設定/` に直してよい**(名前を変えることがこの仕事の中身なので、これはテストを緑にするための書き換えではない)。ほかのテストは触らない
- `docs/knowledge/decisions.md`: 決定を 1 行足す(「画面と説明の製品名は『ライコネ』。ローマ字の書き方・リポジトリ名・URL は未定のまま」)。個人名・金額は書かない
- `AGENTS.md` の見出し `tiktok-widget の作業規則` は変えない(リポジトリの作業規則で、配信者は見ない)

## 触らないもの
`package.json` の `name`・`description`・`repository`、`package-lock.json`、`cloudflare/`、`deploy/`、`mcp/server.js` と `src/ai-mcp.js` の MCP 名、`bin/tw.js`、`src/runtime.js`、`public/widgets/` 全部(ウィジェットの `<title>` は機能の名前で製品名ではない)、`public/dashboard/style.css`、`public/dashboard/simple.js`、`src/schema.js`、画像・ロゴ(ロゴは作らない。本物のロゴはめにくんのデザイン待ち)

## 完成の条件
- AC-1 上の「変えるもの」の各所で、「TikTok LIVE ウィジェット」という製品名が「ライコネ」に変わっている。`grep -rn "TikTok LIVE ウィジェット" --include=*.html --include=*.js --include=*.md --include=*.yaml .`(`node_modules`・`docs/reviews`・`docs/slot-design` を除く)が 0 件
- AC-2 リポジトリのどこにも、製品名としてのローマ字 `Raikone`・`RAIKONE`・`raikone` が新しく入っていない(大文字小文字を区別せず検索して 0 件。ただし、このカードのファイル自身とこのブランチ名 `dev/templates` に関係する文は除く)
- AC-3 `package.json` の `name`・`repository`、MCP の登録名 `tiktok-widget`、`tiktok-widget.service` などの名前、URL・ドメインの文字が 1 文字も変わっていない(`git diff` でその行が出ない)
- AC-4 ダッシュボードを開くと、左上(PC はサイドバーの頭、スマホは上の帯)の名前が「ライコネ」。テナントでは「<配信者の名前> のライコネ」。ブラウザのタブの題も「ライコネ」
- AC-5 `test/brand.test.js`(新)が AC-1〜3 を確かめる: 対象の HTML/JS/MD に「ライコネ」があり、旧名が無く、ローマ字の製品名が無く、`package.json` の `name` が `tiktok-widget`
- AC-6 見た目の確認: 1280 幅・390 幅 × 明・暗でダッシュボード(接続前)を撮る。名前が見切れない・折り返しで崩れない(390 幅の上の帯に収まる)。画像は `C:/Users/user/lulwork/templates-shots/brand-*.png`(コミットしない)
- AC-7 今あるテストは全部そのまま通る(Windows で元から落ちる 6 件を除く。`test/ai.test.js` の 1 行だけ上の理由で直す)。`public/widgets/` は 1 行も変えない
作らないもの: ローマ字の綴り、ロゴ・アイコン、ドメイン・URL・リポジトリ名の変更、ウィジェットの中の文字の変更、英語版
証拠: `test/brand.test.js`、`npm test`、撮影(AC-6)

## めにくんに決めてほしいこと(報告に並べる)
1. ローマ字の書き方(Raikone / Rai-kone など)とドメイン。決まったら package.json・URL・MCP 名を別の仕事で変える
2. テナントの上の帯の文「<名前> のライコネ」でよいか(案: そのまま)
3. ロゴはいつ・どの形で渡すか(今は文字だけ)
