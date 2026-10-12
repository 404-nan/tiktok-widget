# TikTok LIVE ウィジェット

TikTok LIVE 配信用のオーバーレイ集です。OBS / TikTok LIVE Studio の「ブラウザ」ソースに URL を入れるだけで使えます。

| ウィジェット | 内容 | 推奨サイズ |
| --- | --- | --- |
| ギフト通知 `gift-alert` | ギフト・フォロー・シェアを中継テロップのように表示。高額ギフトは金色 | 760 × 200 |
| カットイン `cutin` | パチンコのカットイン。筆でかすれた帯が入り、「激アツ」の文字が叩きつけられ、ガガガと揺れて抜ける。コインで 青→緑→赤（激アツ）→金→虹（確定・フリーズつき） | 配信画面と同じ大きさ（例 1080 × 1920） |
| 画像付きカットイン `image-cutin` | 写真を使うカットイン。帯の中いっぱいに写真が入り縁が木炭のかすれ線になる形（inside）か、帯の横に写真が大きく乗る形（side） | 配信画面と同じ大きさ |
| RUSH `rush` | 確変モード。突入すると「RUSH突入」が叩きつけられ、左右の帯に「RUSH中」が縦に流れ、その内側に虹色の筆のかすれ線と光のシャワー。RUSH 中のギフトで時間が延び、合計コインが数え上がり、最後に結果を出す | 配信画面と同じ大きさ |
| ギフト瓶 `gift-jar` | 届いたギフトが入れ物に落ちてたまる（物理演算）。形は保存瓶・ハート・エリクサーのフラスコ。フラスコはたまるほど液体が増える | 瓶 500 × 700 / ハート 600 × 600 / フラスコ 520 × 700 |
| ルーレット `roulette` | ギフトごとに別のルーレットを回せる。丸型と横スライド型、項目ごとの色と画像 | 丸 600 × 680 / 横 820 × 330 |
| いいね・視聴者数 `counter` | いいね・視聴者・フォロー・コインなどのスコアボード | 560 × 220 |
| 目標バー `goal` | フォロー数などの目標までの進み具合。達成後に目標を自動で上げられる | 640 × 180 |
| WIN数 `wins` | 妨害マイクラなどのゲームクリア回数。クリアしたらボタンや Stream Deck で +1、「このギフトで WIN -1」「このギフトで 0 に戻す」のようにギフトで増減（マイナスまで行く）。減ると板にひびが走り、ダメージの数字が飛んで、送った人のアイコン付きのハンコ。15 秒以内に続くと「連続妨害 ×N」でだんだん派手に、0 を割ると「マイナス突入」のサイレンと危険の縞、最低記録を更新すると「最低記録更新」、0 に戻ると「マイナス脱出!」。一度に大きく減ると 大妨害（-10〜）→ 超妨害（-100〜）→ 壊滅（-1000〜）と段階が上がり、数字がドゥルルルと減っていく。5 WIN ごとと目標達成は金で祝う。数は配信をまたいで残る | 横長 600 × 200 / 大きい数字 380 × 400 |
| WIN数の全画面演出 `wins-fx` | WIN数で大きく減ったとき・連続妨害が途切れたとき・目標達成やマイナス脱出のときに、配信画面いっぱいに出す演出。大妨害は画面にガラスのひび、超妨害は全面のひび・サイレン・赤い警報、壊滅は暗転して止まってからガラスが割れて破片が落ちる。0 を割ると上下に「マイナス突入」の危険の帯。送った人の名前も大きく出す | 配信画面と同じ大きさ |
| ランキング `ranking` | この配信のトップギフター・いいねランキング。順位が入れ替わるとなめらかに動く | 420 × 416（5人） |

これからの演出・ウィジェットの案は [docs/IDEAS.md](docs/IDEAS.md) にまとめています。

管理用の画面は3つです。

| 画面 | URL | 内容 |
| --- | --- | --- |
| モニター | `/monitor/` | 配信中に手元（別画面・スマホ）で見る。コイン・視聴者などの数字、ライブのコメントとギフト、WIN 数のボタン（クリア +1 / -1 / 戻す / リセット）、RUSH の残り時間と突入・終了のボタン、ルーレットの待ちと結果、目標、トップギフター、Minecraft に送ったコマンド |
| 統計 | `/history/` | 配信ごとの記録。1分ごとのコイン・視聴者・いいねのグラフ、前回との比較、トップギフター、ギフトの内訳、ルーレットの結果 |
| 設定 | `/dashboard/` | 接続、テスト送信、各ウィジェットと Minecraft 連携の設定、YAML の編集 |

## 使い方

```bash
npm install
npm start          # http://127.0.0.1:3939/dashboard/ を開く
npm run demo       # 配信していなくても、デモのイベントを流しながら起動
```

1. ダッシュボードで TikTok のユーザー名を入れて「接続」（配信中である必要があります）
2. 「ウィジェット」で使うものを選び、設定を変えて URL を「コピー」（設定は `config.yaml` に保存されます）
3. OBS / TikTok LIVE Studio に「ブラウザ」ソースを追加し、URL と推奨サイズを入れる

「デモを流す」や「テスト送信」で、配信前に見た目を確認できます。

### 環境変数

| 変数 | 説明 |
| --- | --- |
| `PORT` | ポート（既定 3939） |
| `HOST` | 待ち受けるアドレス（既定 127.0.0.1。別の PC の OBS から使うなら `0.0.0.0`） |
| `TIKTOK_USERNAME` | 起動と同時にこのユーザーの LIVE に接続する |
| `TIKTOK_SIGN_API_KEY` | 署名サーバー（Euler Stream）の API キー。つながりにくいときに設定 |
| `TW_CONFIG` | 設定ファイルの場所（既定はこのフォルダの config.yaml） |
| `TW_SERVER` | MCP / CLI から見たサーバーの URL（既定 http://127.0.0.1:3939） |
| `TW_DATA` | 配信の記録を置く場所（既定はこのフォルダの data/） |

## 配信者ごとのダッシュボード（契約している配信者に渡す）

1つのサーバーで、契約している配信者それぞれに専用のダッシュボードを渡せます。配信者ごとに設定・配信の記録・WIN数・TikTok の接続が分かれます。

1. サーバーを起動すると、管理画面の場所と合言葉のファイルが表示されます（`data/admin-token.txt`。環境変数 `TW_ADMIN_TOKEN` でも決められます）
2. 管理画面 `/admin/` を開いて合言葉を入れ、「配信者を追加」で名前を入れると、その配信者の URL ができます
   - **ダッシュボード** `/t/<鍵>/dashboard/` … 配信者だけに渡す（設定を変えられる）。モニター・統計もこの下
   - **OBS 用** `/t/<OBS 用の鍵>/widgets/...` … 配信者のダッシュボードに出る URL を OBS に入れる。こちらでは設定は変えられず、パスワードも見えません
3. 配信者は、ダッシュボードの「使うウィジェット」で、使うものを自分で選べます

**豪華な演出**（カットイン・画像付きカットイン・RUSH・WIN数の全画面演出）は、最初は使えません。管理画面で、配信者ごとに「ずっとオン」「1時間 / 3時間 / 24時間 / ○時間だけオン」「オフ」を選べます。「全員まとめて」の欄でオンにすると、全員が使えます。使えないときは、OBS には何も表示されません（ダッシュボードのプレビューには理由が出ます）。オン/オフしたり期限が切れたりすると、配信中でも自動で切り替わります。

URL が漏れたときは、管理画面の「URL を作り直す」で古い URL を使えなくできます。「使える」のチェックを外すと、その配信者の利用を止められます。

- 1人で使うときは今までどおり `/dashboard/`（`config.yaml` と `data/`）。配信者ごとのデータは `data/tenants/<id>/`、配信者の一覧は `data/tenants.json`
- サーバーとして公開するときは `TW_HOSTED=1`（1人用の `/dashboard/` を出さず、管理画面と配信者ごとの URL だけにする）と `HOST=0.0.0.0`。HTTPS で公開してください
- AI からの設定（MCP / CLI）は、今のところ1人用の `config.yaml` だけが対象です

## 設定ファイル（config.yaml）

設定はすべて `config.yaml` にまとまっています（初回起動時に `config.example.yaml` からコピーされます）。
ダッシュボード・AI・テキストエディタのどれで書き換えても、配信中のウィジェットに自動で反映されます。
間違った値は保存前に弾かれ、どこをどう直せばよいかが表示されます。

```yaml
roulettes:
  punishment:            # 名前（URL に使う）
    name: 罰ゲーム
    style: wheel         # wheel 丸 / strip 横スライド
    gifts: [Rose]        # このギフトで回る
    items:
      - ハズレ
      - 歌う*2           # 「*2」で2倍当たりやすい
      - {label: 激辛, color: "#E5484D", image: media/chili.png}
  reward:
    name: ご褒美
    style: strip
    gifts: [Doughnut]
    minCoins: 100        # 100 コイン以上のギフトでも回る
    items: [名前を呼ぶ, リクエスト曲]
```

- **ギフトごとのルーレット**: `roulettes` を複数作ると、`/widgets/roulette.html` 1つで、届いたギフトに合うルーレットに切り替わって回ります。ギフト名の指定はコイン数の条件より優先されます。`?ids=punishment` で1つだけにもできます
- **色**: 項目ごとに `color` と `textColor`。`#RRGGBB` か、テーマの色の名前（`accent` 朱 / `gold` 金 / `ink` 墨 / `ink-2` / `paper` 白）
- **画像**: 項目の `image` に画像の URL か `media/` フォルダのファイル名。画像がなければ今までどおり文字だけを中央に出します
- **条件ごとの通知**: `alerts.<名前>.rules` で、ギフト名・ユーザー・コイン数ごとに色・金色の演出・秒数・文を変えられます
- **WIN数**: クリアしたらダッシュボード・モニターのボタンか、URL を開いて +1（Stream Deck の「Webサイト」などに登録すればゲーム中でも押せます）
  - `http://127.0.0.1:3939/api/wins/default/win` … +1 ／ `…/add?value=-1` … -1 ／ `…/undo` … 1つ戻す ／ `…/set?value=5` … 5 にする ／ `…/reset` … 0 にリセット（`default` の所を `all` にすると全部）
  - ギフトで増減: `wins.default.rules` に `{gifts: [Lion], add: -1, text: 妨害成功}`（個数分減る）や `{gifts: [Universe], reset: true}`（0 にリセット）。上から順に最初に合ったものを使います。0 より下（-1 WIN など）まで減り、マイナスの数は赤で出ます（0 で止めたいときは `negative: false`）
  - 演出の段階: 一度に減った数で 大妨害 → 超妨害 → 壊滅 と派手になります。境目は `lossPreset` で配信に合わせて選びます（`large` -10 / -100 / -1000、`medium` -3 / -10 / -30、`small` -1 / -3 / -5、`custom` は `bigLoss` / `hugeLoss` / `ruinLoss` で自分で決める）。-1 しか来ない配信でも、連続妨害（15 秒以内に続けて減る）×3 で大妨害、×5 で超妨害、×8 で壊滅まで上がります（`comboUp: false` で止める）。揺れ・ひび・ダメージの数字の大きさは `power`（0.3〜3 倍）で変えられます。全画面の演出は `/widgets/wins-fx.html` を配信画面いっぱいに重ねます
  - 連続妨害: 続いている間は板の右側が「連続妨害 ×5　-23 WIN」と、途切れるまでの残り時間のバーに変わります。途切れると「合計 -23　連続妨害 ×5 終了」のハンコ（×3 以上か合計が大妨害以上なら全画面でも）
  - マイナスの間: 深さ（境目は `lossPreset`）で板がだんだん不穏になります（数字のノイズ → 走査線と震え → 赤い熱と鼓動）。全画面演出は縁が赤く脈打ちます（`minusAmbient: false` で止める）
  - 増えたとき: 文字は「+10」などの数字かひと言だけで、段階が上がるほど光・色・音で押します。大（金の閃光と放射・紙吹雪）→ 超（白飛び・虹の放射・キュイン）→ 最大（暗転して無音 → 白い閃光 3 回 → 虹の嵐・花火・ファンファーレ）。境目は `gainPreset`（`large` +10 / +100 / +1000、`medium` +3 / +10 / +30、`small` +1 / +3 / +5、`custom`）。クリア（+1 ボタン）は少なくとも「大」で全画面にも「WIN!」（`clearFx: false` で止める）
  - お祝い: 目標まであと1つは「リーチ」（喜びではなく溜め。鼓動と点滅だけ）、目標達成はいちばん派手な「CLEAR」（暗転 → 閃光 → 虹と花火と紙吹雪の嵐）。全画面のお祝いは `celebrate: false` で止められます
  - リセットはダッシュボード・モニターの「リセット」ボタン（確認が出ます。間違えても「戻す」で元に戻せます）
  - 数は `data/wins.json` に残ります。AI からは `npm run tw -- win` / `wins add -1` / `wins undo` / `wins reset`、MCP の `wins` ツール
- **RUSH**: `rush.gifts` のギフト、`rush.enterCoins` 以上のギフト、ルーレットの `rush: true` の項目、ダッシュボード・モニターのボタンで突入。RUSH 中は `extendMinCoins` 以上のギフトで `extendSeconds` 秒ずつ延び、最長 `maxSeconds` 秒。状態はサーバーが持つので、OBS を読み込み直しても続きから出ます
- **同じウィジェットを複数**: `jars.elixir` のように名前を付けて作り、URL に `?id=elixir`

書ける項目の一覧は `npm run tw -- reference`（ダッシュボードのフォームにも説明が出ます）。

## Minecraft / SuperStream 連携

Minecraft サーバーの RCON にコマンドを送れます（`config.yaml` の `minecraft`）。
SuperStream（TikTok のギフトで Minecraft に演出を起こすプラグイン）の演出も、このツールから起こせます。

```yaml
minecraft:
  enabled: true
  host: 127.0.0.1
  port: 25575                 # server.properties の rcon.port
  password: "..."             # server.properties の rcon.password
  superstreamProfile: default_profile
  superstreamFile: ~/server/plugins/SuperStream/profiles/default_profile.yml   # 設定済みの演出を一覧するため（任意）
  rules:
    - events: [follow]
      superstreamAction: lightning            # SuperStream の演出を1つ（ss test action）
      commands: ["say {user} さん、フォローありがとう！"]
    - minCoins: 1000
      superstreamGift: 6001                   # プロフィールのギフト 6001 の演出（ss test profile）
roulettes:
  punishment:
    items:
      - {label: 隕石が降る, superstreamGift: 6001}   # 当たったら起こす（結果が画面に出たタイミング）
      - {label: ダイヤ, commands: ["give @a diamond 1"]}
```

- **ルールごと**: ギフト名・コイン数・フォロー/シェア/いいね・ユーザーを条件に、コマンドや SuperStream の演出を送ります
- **ルーレットの結果**: 当たりの項目の `commands` / `superstreamGift` / `superstreamAction` を、結果が画面に出たタイミングで送ります（ルーレットの抽選はサーバーで行うので、OBS とプレビューなど複数の画面でも結果はそろいます）
- **ギフトをそのまま渡す** (`forwardGifts: true`): 届いたギフトごとに `ss test profile <プロフィール> <ギフトID>` を送ります。SuperStream 側で `/ss profile start` していないとき用です（両方動かすと演出が二重になります）
- `{user}` などの視聴者由来の文字は、コマンドに入る前に記号を取り除きます
- 設定画面の「Minecraft 連携」タブで、接続の確認、コマンドの試し打ち、SuperStream のプロフィールの演出の試し打ち、送ったコマンドの記録を見られます

## AI から設定する

### MCP サーバー

Claude Code・Claude Desktop などに MCP サーバーとして登録すると、「Rose で回る罰ゲームルーレットを作って、激辛は赤にして」のように頼むだけで設定できます。

```bash
claude mcp add tiktok-widget -- node /path/to/tiktok-widget/mcp/server.js
```

Claude Desktop などは設定ファイルの `mcpServers` に追加します（ダッシュボードの「設定ファイルと AI」にコピー用の文があります）。

| ツール | できること |
| --- | --- |
| `get_config_reference` / `get_config` / `validate_config` | 書き方と今の設定を見る・検証する |
| `set_config` / `merge_config` / `delete_config` / `replace_config` | 設定を変える（コメントは残る。エラーなら保存しない） |
| `list_widget_urls` / `list_gifts` / `list_media` / `add_media_from_url` | URL・ギフト名・画像を調べる、画像を取り込む |
| `test_event` / `spin_roulette` / `get_status` | 動きを確かめる（サーバー起動中） |
| `list_superstream_actions` / `minecraft_command` | SuperStream の設定済みの演出を見る、Minecraft にコマンドを送る |
| `get_history` | 過去の配信の記録（「前回の配信を分析して」など） |

### CLI

シェルが使える AI や手作業では CLI でも同じことができます。

```bash
npm run tw -- get roulettes.punishment
npm run tw -- set roulettes.punishment.gifts "[Rose, GG]"
npm run tw -- set roulettes.punishment.items.2 "{label: 激辛, color: '#E5484D'}"
npm run tw -- merge roulettes.reward "{style: strip, duration: 8}"
npm run tw -- test gift Rose 3
npm run tw -- spin punishment
npm run tw -- urls
npm run tw -- superstream
npm run tw -- mc "ss status"
npm run tw -- history
```

## URL パラメータ

設定ファイルの値は URL でも上書きできます（例: `?duration=8`）。全ウィジェット共通:

- `id=名前` 使う設定（ルーレットは `ids=a,b`）
- `theme=light` 明るい面にする
- `accent=ff4f1f` 差し色（朱）を変える
- `scale=1.5` 全体を拡大する

## デザイン

テレビ中継のテロップ／スコアボードの文法で作っています。

- 面は不透明。どんな配信映像の上でも読めるように、ぼかしや発光で飾らない
- 色は 墨・白・朱・金 の4色だけ。朱は「今起きたこと」、金は「コイン」にだけ使う
- 書体は和文 Zen Kaku Gothic New、数字 Barlow Condensed。アイコンは Lucide
- 動きはワイプ（clip-path）と文字のせり上がり、数字は桁ごとに回る
- フォント・アイコン・物理エンジンは `node_modules` からローカル配信するので、OBS がオフラインでも崩れない

実配信ではギフトに TikTok の本物の画像を使います。デモのギフトは画像がないので、価格帯で色分けしたアイコンのトークンで表示します。

## 構成

```
config.yaml            設定（初回起動時に config.example.yaml から作られる。git には入れない）
media/                 ルーレットなどで使う画像（samples/ に見本）
server.js              Express + WebSocket（/ws でウィジェットにイベントと設定の変更を配信）
src/schema.js          設定の項目・初期値・説明（検証・フォーム・AI 向けの説明の元）
src/config.js          設定ファイルの検証・読み書き（コメントを残す）・監視
src/admin.js           MCP と CLI が共通で使う操作
src/roulette.js        ルーレットの抽選（サーバー側で決めて全画面に配る）
src/runtime.js         配信者1人分の仕組み（TikTok の接続・集計・ルーレット・RUSH・WIN数・記録・設定の API）
src/tenants.js         契約している配信者の一覧と鍵、豪華な演出のオン/オフ（期限つき・全員まとめて）
src/wins.js            WIN 数（ボタン・URL・ギフトのルールで増減し、data/wins.json に残す）
src/rush.js            RUSH（確変）モードの状態と時間（突入・延長・終了を全画面に配る）
src/minecraft.js       Minecraft 連携（ルール・ルーレットの結果 → RCON）
src/rcon.js            RCON クライアント
src/superstream.js     SuperStream のプロフィールを読む（演出の一覧）
src/history.js         配信ごとの記録（data/sessions/）
mcp/server.js          MCP サーバー
bin/tw.js              CLI
src/tiktok.js          tiktok-live-connector で LIVE に接続（切断時は自動で再接続）
src/normalize.js       生データをウィジェット用の形にそろえる（連打ギフトは確定時に1件）
src/hub.js             集計（いいね・視聴者・コイン・トップギフター）と配信
src/demo.js            デモ・テスト用のイベント
public/admin/          管理画面（配信者の追加・豪華な演出のオン/オフ）
public/dashboard/      設定画面（common.js / charts.js は3画面で共通）
public/monitor/        配信中モニター
public/history/        統計・履歴
public/widgets/        各ウィジェット（lib/ に共通処理・ルーレットの丸型と横型・入れ物の形）
test/                  node --test のテスト
```

```bash
npm test
```
