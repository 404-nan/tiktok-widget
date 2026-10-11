# TikTok LIVE ウィジェット

TikTok LIVE 配信用のオーバーレイ集です。OBS / TikTok LIVE Studio の「ブラウザ」ソースに URL を入れるだけで使えます。

| ウィジェット | 内容 | 推奨サイズ |
| --- | --- | --- |
| ギフト通知 `gift-alert` | ギフト・フォロー・シェアを中継テロップのように表示。高額ギフトは金色 | 760 × 200 |
| ギフト瓶 `gift-jar` | 届いたギフトが入れ物に落ちてたまる（物理演算）。形は保存瓶・ハート・エリクサーのフラスコ。フラスコはたまるほど液体が増える | 瓶 500 × 700 / ハート 600 × 600 / フラスコ 520 × 700 |
| ルーレット `roulette` | ギフトごとに別のルーレットを回せる。丸型と横スライド型、項目ごとの色と画像 | 丸 600 × 680 / 横 820 × 330 |
| いいね・視聴者数 `counter` | いいね・視聴者・フォロー・コインなどのスコアボード | 560 × 220 |
| 目標バー `goal` | フォロー数などの目標までの進み具合。達成後に目標を自動で上げられる | 640 × 180 |

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
- **同じウィジェットを複数**: `jars.elixir` のように名前を付けて作り、URL に `?id=elixir`

書ける項目の一覧は `npm run tw -- reference`（ダッシュボードのフォームにも説明が出ます）。

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
mcp/server.js          MCP サーバー
bin/tw.js              CLI
src/tiktok.js          tiktok-live-connector で LIVE に接続（切断時は自動で再接続）
src/normalize.js       生データをウィジェット用の形にそろえる（連打ギフトは確定時に1件）
src/hub.js             集計（いいね・視聴者・コイン・トップギフター）と配信
src/demo.js            デモ・テスト用のイベント
public/dashboard/      管理画面
public/widgets/        各ウィジェット（lib/ に共通処理・ルーレットの丸型と横型・入れ物の形）
test/                  node --test のテスト
```

```bash
npm test
```
