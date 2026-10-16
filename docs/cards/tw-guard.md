# guard: 1人用の操作(MCP のローカルモード・tw CLI)を、配信者がいる本番では使わせない

目的: AI エージェントが MCP サーバー(mcp/server.js)のローカルモードや CLI(bin/tw.js)を、本番(マルチテナントの TW_HOSTED=1 のサーバー、ポート3939)に向けて使ってしまう事故を防ぐ。1人で自分の PC で使う人(README の「自分の PC で動かして公開する」)の使い方は今までどおり。

作るもの: `src/admin.js`(または新しい `src/local-guard.js`)と、mcp/server.js・bin/tw.js からの呼び出し

完成の条件:
- AC-1 ローカルモードの設定の書き換え(set_config・merge_config・delete_config・replace_config と、tw の set・merge・delete)は、次のどれかのときに保存せず、日本語で理由を返す: 環境変数 TW_HOSTED が 1 / 書き換える設定ファイルと同じデータの場所に tenants.json がある(マルチテナントのデータ)
- AC-2 その理由の文には、代わりの方法(TW_SERVER と TW_AI_TOKEN を付けて /ai/v1 を使うリモートモード)を1行で書く
- AC-3 ローカルモードのテスト送信・ルーレット(test_event・spin_roulette と、tw の test・spin)は、送り先のサーバーが hosted(マルチテナント)だと分かったら送らずに理由を返す。分からないとき(サーバーが止まっているなど)は今までどおりのエラー
- AC-4 TW_HOSTED が無く、tenants.json も無い1人用のときは、今までと同じ動き(既存のテストが全部そのまま通る)
- AC-5 リモートモード(TW_AI_TOKEN と TW_SERVER がある)は変えない
作らないもの: /ai/v1 の変更、ダッシュボードの変更、新しい設定の項目
証拠: test/acceptance/guard.test.js(一時ディレクトリに1人用の設定と、tenants.json つきのデータを作って確かめる。本物の本番には触らない)、npm test

## 2巡目(レビューで見つかったもの)
- AC-6 TW_SERVER で hosted の本番サーバーを送り先にしたローカルモードの `spin_roulette` は、サーバー側の認証なし API を通じて実行されず、日本語で理由を返す。
- AC-7 `tw unset` に引数がない場合でも未処理例外でプロセスが落ちず、日本語で使い方または不足している引数の理由を返して終了コード 1 になる。
