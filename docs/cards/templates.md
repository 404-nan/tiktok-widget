# templates: 「どの配信をするか」を選ぶだけで、要るウィジェットと設定がそろう(配信テンプレート 最初の3つ)

仕事の種類: 作り込み(データ + 画面 + 配線)
見た目が変わるか: はい(「かんたん」に新しい画面「配信テンプレート」が増える。ウィジェット自体の見た目は変えない)

目的: 配信者が設定を覚えなくても、配信の種類を選ぶだけで始められるようにする。最初の3つは「妨害マイクラ」「罰ゲーム雑談」「耐久・目標配信」。入れる前に「何がどう変わるか」を見せ、押したら反映し、元に戻せる。今の設定を黙って消さない。
名前を「ライコネ」にする仕事は別のカード(`docs/cards/brand-raikone.md`)。このカードでは名前の文字を変えない。

## 前提(今のコードで分かっていること)
- 設定は `config.yaml`(schema は `src/schema.js`)。変更は `{ op: 'set'|'merge'|'delete', path, value, label }` の形で、`src/ai.js` の `checkChanges` が確かめ、`cfg.applyChanges(text, changes)`(`src/config.js`)が当てる。
- 「AI にたのむ」の流れ(`src/runtime.js` の `/api/ai/apply`・`/api/ai/undo`、`public/dashboard/ai.js`)は、案を見せる → 押して反映 → `aiUndo = { before, after }` で元に戻す。反映のあとに別の変更が入っていたら戻さない(409)。**この仕組みを使い回す**(新しく作り直さない)。
- 配信者ごとの URL(テナント)では、使うウィジェットの一覧 `me.widgets`(`/api/me/widgets`、`setWidgets`)と、遊び方の名前 `me.template`(`/api/me/template`、`setTemplate`)がある。1人用では全部使えるので `widgets` は無い。
- 今ある `public/dashboard/stage.js` の `TEMPLATES`(初めて開いた配信者が選ぶ「おしゃべり・歌」など6つ)と、`simple.js` の `PLAY_MODES` は**そのまま残す**。新しい配信テンプレートは別の入口(「かんたん」の新しい画面)にする。2つが並ぶことは報告で伝え、めにくんが整理を決める。
- 豪華な演出(`cutins`・`imageCutins`・`rush`・`winsFx`)と `ai` は、管理者が配信者ごとに使える/使えないを決める(`entitled`)。`minecraft.enabled/host/port/password` は AI でも変えられない(`checkChanges`)。テンプレートも同じ決まりを守る。

## 作るもの
- `src/templates/bougai.json`、`src/templates/bakkin.json`、`src/templates/endurance.json`(テンプレート1つにつき1ファイル。データだけで、コードを書かない)
- `src/templates.js`(新): 読み込み、検証、「入れたらどう変わるか」の計算
- `public/dashboard/templates.js`(新): 「配信テンプレート」の画面
- 足すだけ(最小限): `src/runtime.js`(API と元に戻す記録)、`public/dashboard/editor.js`(サイドバーの項目と表示の切り替え)、`public/dashboard/index.html`(表示の入れ物)、`public/dashboard/style.css`(置き場所と大きさだけ)、`public/admin/admin.js`(`TEMPLATE_NAMES` に3つの名前)、`mcp/server.js`・`bin/tw.js`(一覧・見る・入れる)、`README.md`(説明を数行)、`docs/knowledge/decisions.md`(決定を1行)
- 触らない: ウィジェット本体(`public/widgets/` 全部)、`src/schema.js`、`src/hub.js`、`src/ai-prompt.js`、`stage.js` の `TEMPLATES`、`simple.js` の `PLAY_MODES`、`src/minecraft.js`。ほかのセッションが作っている新しいウィジェット(コンボ・ステップアップ・投票など)は使わない(統合のあとで各テンプレートの `config` に足す)

## テンプレートのデータの形(1ファイル)
```
{
  "id": "bougai",                 // 英数字と - _ だけ。me.template にも入る
  "name": "妨害マイクラ",
  "desc": "ギフトで配信者のクリアを邪魔する配信",   // カードのひとこと(やさしい日本語、40字まで)
  "flow": "配信者が Minecraft をクリアしようとし、視聴者がギフトで妨害する",
  "peaks": ["大妨害・壊滅", "WIN 数の目標達成"],        // 山場。画面に出す
  "widgets": ["wins", "cutins", "rush", "alerts", "rankings"],   // 使うウィジェット(section の名前)
  "optionalWidgets": ["winsFx"],  // 管理者が許していれば足す。許していなければ「入れない」と見せる
  "changes": [ { "op": "merge", "path": "wins.default", "value": { ... }, "label": "..." } ],
  "notes": ["マイクラ連携は「マイクラ連携」の画面で自分で設定してください"]
}
```
- `changes` は `checkChanges` をそのまま通る形。`minecraft` は触らない(`rules` も入れない)。
- `widgets` に書いた section の設定が config に無ければ、`changes` で `defaultsFor` 相当の最小の設定を作る(`set`)。作るときの名前は下の各テンプレートに書いたとおり。

## 3つのテンプレートの中身(数字は最初の案。めにくんが決める。報告に並べる)

### 妨害マイクラ(`bougai`)
- 流れ: 配信者が Minecraft をクリアしようとし、視聴者がギフトで妨害する。山場: 大妨害・壊滅、WIN 数の目標達成
- widgets: `wins`・`cutins`・`rush`・`alerts`・`rankings`(任意: `winsFx`)
- `wins.default`(merge): `title: "WIN"`、`goal: 10`、`negative: true`、`lossPreset: "medium"`、`gainPreset: "medium"`、`comboUp: true`、`clearFx: true`、`rules`: ① `{gifts:[Finger Heart], add:-1, text:"妨害"}` ② `{gifts:[Doughnut], add:-3, text:"大妨害"}` ③ `{gifts:[Lion], add:-10, text:"超妨害"}`(減らすギフトは案。ライオンで 0 に戻すルールは入れない)
- `cutins.default`(merge): 「ふつう」の境目(`minCoins:100, greenCoins:300, redCoins:1000, goldCoins:5000, rainbowCoins:20000`)
- `rush`(merge): `enabled:true`、`enterCoins:5000`、`extendMinCoins:50`
- `alerts.default`(merge): `events:[gift, follow]`、`bigCoins:100`
- `rankings.default`(merge): `metric:"coins"`、`limit:5`
- notes: 「マイクラ連携は『マイクラ連携』の画面で自分で設定してください(ここでは変えません)」

### 罰ゲーム雑談(`bakkin`)
- 流れ: 雑談しながら、ギフトでルーレットを回して罰ゲーム。山場: 激辛・恥ずかしい罰が当たる瞬間
- widgets: `roulettes`・`cutins`・`goals`・`chats`・`alerts`
- `roulettes.punishment`(set。すでに同じ名前があれば merge で `name/style/gifts` だけ。`items` は置き換えるので「今の値 → 新しい値」を必ず見せる): `name:"罰ゲーム"`、`style:"wheel"`(時計回りの丸)、`gifts:["Rose"]`、`items:["歌う*2","変顔*2","一発ギャグ","モノマネ","激辛チャレンジ","セーフ*2"]`
- `cutins.default`(merge): 妨害マイクラと同じ「ふつう」
- `goals.default`(merge): `title:"フォロー目標"`、`metric:"follows"`、`goal:100`、`step:100`
- `chats.default`(merge): `style:"telop"`、`maxItems:8`、`hideCommands:true`
- `alerts.default`(merge): `events:[gift, follow]`
- 「当たりが近いとき」「罰の候補が見えたとき」の見せ方は、ほかのセッションの新しいウィジェットが統合されてから足す(今は入れない)

### 耐久・目標配信(`endurance`)
- 流れ: 目標まで終われない。ギフトで時間が延びる。山場: 目標達成、残り時間ギリギリ
- widgets: `timers`・`goals`・`alerts`・`rankings`・`cutins`
- `timers.default`(merge): `title:"残り"`、`startMinutes:60`、`maxHours:12`、`coinSeconds:10`、`followSeconds:30`、`likeEvery:100`、`likeSeconds:10`、`warnMinutes:10`、`dangerMinutes:1`
- `goals.default`(merge): `title:"目標コイン"`、`metric:"diamonds"`、`goal:10000`、`step:10000`
- `alerts.default`・`rankings.default`・`cutins.default`: 妨害マイクラと同じ
- ステップアップ・役物落下は統合のあとで足す(今は入れない)

## 画面(「かんたん」)
サイドバーの「じゅんび」に「配信テンプレート」を足す(アイコンは Lucide `layout-template`)。押すと右が切り替わる(戻るボタンは作らない)。
1. 上から: 見出し「配信テンプレート」、ひとこと「どの配信をするか選ぶと、使うものと設定がそろいます。入れる前に、何が変わるかを見せます。」
2. テンプレートのカード3枚(PC は横並び、390幅は縦)。カードには名前・ひとこと・山場・「使うもの: ギフト通知・WIN数…」。選んでいるカードに印(`aria-pressed`)
3. カードを選ぶと、その下に「入れると、こう変わります」を出す。行の種類は4つ:
   - 「使うものに足す」: ウィジェット名
   - 「新しく作る」: 例 ルーレット「罰ゲーム」(項目 6 つ)
   - 「変える」: 項目の呼び名(`SIMPLE_LABELS` を使い、なければ説明の頭)、今の値 → 新しい値
   - 「入れない」: 管理者が許していない豪華な演出など。理由を一言
   変わらない項目(今の値と同じ)は出さない。何も変わらないときは「もう入っています」と出して押せなくする
4. ボタン「この内容で入れる」(`btn primary`)と「やめる」。押すまで何も変わらない
5. 入れたあと: 「入れました。」「元に戻す」「入れたものを見る」。元に戻すと、入れる前の設定・使うウィジェット・遊び方の名前に戻る
6. 配信中(`status.mode === 'live'`)に開くと、「配信中です。入れると、すぐ画面が変わります」と出し、確認のチェック(`confirmLive`)を押さないと入れられない
- 文は全部やさしい日本語。本文 16px 以上、補足も 14px 未満にしない、文字のコントラスト 4.5:1 以上、面は不透明、押す所は 44px 以上。部品は `style.css` の `panel`・`btn primary`・`chip`・`srow`・`sgroup` などを使い、色を直接書かない。飾りのアイコンを足さない

## API(`src/runtime.js` に足す。AI の鍵が無くても使える)
- `GET /api/templates` → `[{ id, name, desc, flow, peaks, widgets }]`
- `POST /api/templates/preview` `{ id }` → `{ id, name, rows:[{ kind:'widget'|'create'|'change'|'skip', section, label, before?, after?, reason? }], notes, live, nothingToDo }`。設定は書き換えない
- `POST /api/templates/apply` `{ id, confirmLive? }` → 変更は**サーバーが id から作り直す**(画面から来た変更の中身は信じない)。`checkChanges` と `cfg.applyChanges` と `store.replaceText` を使い、エラーがあれば何も書かない(422)。配信中で `confirmLive` が無ければ 409。テナントでは `setWidgets`(今のウィジェット + テンプレートの `widgets`。**今使っているものは外さない**)と `setTemplate(id)` も行う
- `POST /api/templates/undo` → 入れる前に戻す。**元に戻す記録は `/api/ai/undo` と同じ 1 つの枠を使う**(`aiUndo` に `widgets` と `template` の入れる前の値を足す。AI の反映のあとに別の変更が入っていたら戻さない、の決まりもそのまま)。`/api/ai/undo` で戻しても同じになる
- `GET /api/templates` の応答か `/api/me` に `canUndo` を足さない。画面は `POST` の応答の `canUndo` を使う
- 使えない section(`entitled` が偽)は `rows` に `skip` で出し、書かない。`minecraft` は絶対に書かない

## CLI と MCP(足すだけ)
- `bin/tw.js`: `tw templates`(一覧)、`tw templates preview <id>`、`tw templates apply <id>`。サーバーを呼ぶ(`TW_SERVER`)。本番(hosted)には既存の `local-guard` と同じ理由で送らない
- `mcp/server.js`(ローカルモード): `list_templates`・`preview_template`・`apply_template`。リモートモード(`/ai/v1`)は変えない

## 完成の条件
- AC-1 `src/templates/` に 3 つの JSON があり、`src/templates.js` が読み込む。id は `bougai`・`bakkin`・`endurance`。形が壊れているものは起動時にはじいて理由を出す(他は使える)
- AC-2 3 つとも、`changes` が `checkChanges` を通り、`config.example.yaml` に当てた結果が `cfg.parseText` でエラーなし、警告なし。`minecraft` を含まない
- AC-3 3 つとも、`widgets` と `changes` の section が一致する(`widgets` にあるのに設定を作らない、設定を作るのに `widgets` に無い、がない)。使うウィジェットは今ある 18 種類のものだけ(ほかのセッションの新しいウィジェットの名前が無い)
- AC-4 `GET /api/templates` が 3 つ返す。`POST /api/templates/preview` は設定ファイルの文字を 1 文字も変えない
- AC-5 プレビューの `rows` が、`create`(config に無い名前)・`change`(今と違う値のとき、`before` と `after`)・`widget`(テナントで未使用のもの)・`skip`(`entitled` が偽)を正しく分ける。今と同じ値の項目は出ない。何も変わらないときは `nothingToDo: true`
- AC-6 `apply` のあと、config に変更が入り、コメントと並びは残る(`applyChanges` の性質)。`apply` の前にあった項目で、テンプレートが触らないものは 1 つも変わらない(例: 既存の `alerts.default.rules`、別の名前のルーレット)
- AC-7 今の設定を消さない: `apply` が `delete` を使わない。既存の項目を変えるときはプレビューに `before` が出ている(テストで、プレビューの `before` が `apply` 前の実際の値と一致する)。`roulettes.punishment.items` のように中身を置き換えるときも同じ
- AC-8 `undo` で、設定ファイルの文字が `apply` 前と完全に一致する。テナントでは `widgets` と `template` も戻る。`apply` のあとに別の変更が入っていたら 409 で戻さない(AI の反映と同じ)
- AC-9 `/api/ai/apply` → `/api/ai/undo`、`/api/templates/apply` → `/api/ai/undo` のどちらも、今までのテスト(`test/ai.test.js`)が全部そのまま通る
- AC-10 テナントで `apply` したとき、元から使っていたウィジェットは外れない。`entitled` が偽の section は入らず、`skip` として返る。1 人用(`widgets` なし)でも動く
- AC-11 配信中(`hub.status.mode === 'live'`)は `confirmLive` が無ければ 409 で、設定は変わらない。ある場合は入る
- AC-12 サーバーは画面から来た変更の中身を使わない(`apply` の本文に `changes` を入れて送っても無視する)。`id` が 3 つに無ければ 404
- AC-13 画面: 「かんたん」のサイドバーに「配信テンプレート」がある。カード 3 枚、選ぶと「入れると、こう変わります」、押す前は設定が変わらない、押すと「入れました。」と「元に戻す」、戻すと元の画面。配信中は確認のチェックが要る
- AC-14 画面を撮る(1280 幅・390 幅 × 明・暗)。横にはみ出さない。全テキストのコントラスト不足 0。本文 16px 以上。押せる所が 44px 以上。390 幅で、プレビューの行が折り返して読める。画像は `C:/Users/user/lulwork/templates-shots/`(コミットしない)。撮影用ポートは 4109
- AC-15 CLI: `tw templates`・`preview`・`apply` が動く(一時サーバーで確かめる)。hosted を向けたときは送らず日本語で理由を返す。MCP の 3 つの道具が同じ関数を呼ぶ
- AC-16 `public/dashboard/templates.js` は(ダッシュボードの他のファイルと同じく)モジュール。`public/widgets/` は 1 行も変えない(`test/es5-public.test.js` が通る)
- AC-17 今あるテストは全部そのまま通る(Windows で元から落ちる 6 件を除く)。テストを書き換えて緑にしない
- AC-18 公開リポジトリに、値段・プラン・戦略・人の名前が無い(JSON の文、画面の文、README、コミット文)
作らないもの: 新しいウィジェット、テンプレートの追加・編集画面、テンプレートの値段やプランによる出し分け、`minecraft` の設定、ほかのセッションのウィジェット(コンボ・ステップアップ・投票・ティッカーなど)、デザインの絵や画像、今ある「遊び方」6 つの整理
証拠: `test/acceptance/templates.test.js`(AC-1〜12。一時ディレクトリに config とテナントを作り、`createRuntime` を `express` に載せる。`test/ai.test.js` の形に合わせる)、`test/templates-cli.test.js`(AC-15)、`npm test`、撮影(AC-13・14)

## めにくんに決めてほしいこと(報告に並べる)
1. 妨害マイクラ: 減らすギフトと数(案は ひとさし指のハート -1 / ドーナツ -3 / ライオン -10)。WIN 数の目標(案 10)。ライオンで 0 に戻すルールを入れるか(案は入れない)
2. 罰ゲーム雑談: 罰の項目(案は 6 つ)。回すギフト(案はバラ)
3. 耐久・目標配信: 初めの時間(案 60 分)、上限(案 12 時間)、1 コインで延びる秒数(案 10 秒)、目標コイン(案 10,000)
4. 今ある「遊び方」6 つ(初めて開いた配信者の選択)と、新しい「配信テンプレート」を 1 つにまとめるか
5. テンプレートを入れたとき、すでにある同じ名前の設定を変えてよいか(案は「変える前に、今の値 → 新しい値を見せて、元に戻せる」)
