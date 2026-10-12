# 配信のひな形（presets）

配信ごとの設定をまとめたものです。「今日はエンドラ討伐」「今日はアスレ」のように、配信の前に切り替えて使います。

| ひな形 | 内容 | クリア（+1 WIN） | 目標の初めの値 |
| --- | --- | --- | --- |
| `bougai-endra` 妨害マイクラ（サバイバル・エンドラ討伐） | サバイバルを1から。分析スプシの傾向で作った | エンダードラゴンを倒す（死なずに倒したら「ノーデス」でさらに +1） | 3 |
| `bougai-diamond` 妨害マイクラ（サバイバル・ダイヤ集め） | エンドラと同じ割り当てで、少しだけダイヤ集め向き | ダイヤを 10 個持つ（15 分以内なら「早クリア」でさらに +1） | 5 |
| `bougai-parkour` 妨害マイクラ（アスレ） | 公開マップ「Parkour Paradise 3」（Hielke 作・100 ステージ） | 5 ステージ進む（落ちずに進めたら「ノーミス」でさらに +1） | 10 |

## 使い方

1. `npm start` で起動して、**配信の準備**（`http://127.0.0.1:3939/stream/`）を開く
2. 「配信の種類」で使うひな形の「この配信にする」を押す
3. 「配信の前に」の **「Minecraft をこのゲームにする」** を押す
   - パネル（`minecraft.via: panel`）なら、サーバーを止める → そのゲームの世界と設定にする → 起動し直す → ゲームの設定のコマンド、まで自動でやります（入っている人は一度抜けます）
   - エンドラ・ダイヤは毎回 **新しい世界**（`bougai-endra-20261012-2105` のような名前）、アスレはマップの世界 `parkour`
   - 浮く・吹き飛ぶ妨害で追い出されないよう、どれも `allow-flight=true` にします
   - RCON のときは世界は変えられないので、コマンドだけ送ります
   - CLI では `npm run tw -- preset server bougai-endra`
4. 「目標の WIN 数」をその日の目標にする（− / ＋ か、数を打つ。すぐ保存されます）
5. 「配信画面に出す」の URL を OBS / TikTok LIVE Studio のブラウザソースに入れる（幅 1080 × 高さ 1920）
   - これ1つで WIN 数・WIN数の全画面演出・カットイン・RUSH・妨害ルーレットがまとめて出ます。ルーレットは回っている間だけ出ます
   - ひな形を切り替えると、OBS に入れたまとめ表示も自動で切り替わります
   - 1つずつ入れたいときは「1つずつ入れるとき」を開く
6. 「配信の前に」のチェックを上から済ませる
7. 配信中は、同じページ（スマホでも開けます）の「クリア +1」「ボーナス」「戻す」を押す

CLI や AI からも同じことができます。

```bash
npm run tw -- preset                         # 一覧（● が今使っているもの）
npm run tw -- preset apply bougai-endra 3    # エンドラ討伐にして、目標を 3 WIN に
npm run tw -- preset check                   # ひな形に間違いがないか調べる
```

MCP では `presets` ツール（`action: list / apply / check`）です。

### 切り替えると何が変わるか

- `wins`・`roulettes` は丸ごと入れ替わります（前のルーレットは消えます）
- `rush`・`minecraft` は、ひな形に書いた項目だけ入れ替わります。**RCON の接続設定（host・port・password・enabled）はそのまま**です
- ほかの設定（ギフト通知・カットインの色など）は変わりません
- WIN の数そのものは変わりません（0 からはじめるなら「リセット」）
- 切り替える前の `config.yaml` は `data/backups/` に残ります（新しいものから 30 個）。元に戻すときは、そのファイルを `config.yaml` にコピーします

## サバイバル（エンドラ・ダイヤ）の設定の考え方

分析スプシ（`reference-gifts_3.xlsx`）の、Minecraft で妨害配信をしている 6 人・約 200 マスの傾向に合わせています。

| 分析でわかったこと | このひな形では |
| --- | --- |
| 1〜30 コインは「ゲームの中で起きること」がほとんど（妨害が多め・救済も混ぜる） | 1〜30 コインは WIN を動かさず、ゾンビ・ぶっ飛び・TNT・回復などにした |
| Rose は TNT かゾンビ、Doughnut は TNT（大）、Perfume は救済、Corgi はガチャ、が多い | 同じ使い方にした（見ている人が「いつもの」と分かる） |
| WIN を動かすのは高いギフト。1 位の配信者は + と - を同じ値段で対にしている | 99 コインから WIN が動く。+ と - を対にした（下の表） |
| 299〜999 コインはガチャ（妨害ガチャ・救済ガチャ・WIN ガチャ）が多い | Corgi 妨害ガチャ・Puppy Kisses 救済ガチャ・Travel with You WIN ガチャ |
| いちばん高いギフトが高いほど順位が高い（相関 0.95） | TikTok Universe（44,999）まで用意した |
| フォローといいねも使う（10 人中 9 人） | フォローで TNT、いいね 200 回ごとに TNT |
| 1 日 1 回の運試し（Heart Me）| Heart Me で運試しガチャ |

### WIN が動くギフト

| - | コイン | WIN | + | コイン | WIN |
| --- | --- | --- | --- | --- | --- |
| Singing Mushroom | 99 | -1 | Hand Heart | 100 | +1 |
| Money Gun | 500 | -5 | DJ Glasses | 500 | +5 |
| Galaxy | 1,000 | -10 | Fireworks | 1,088 | +10 |
| Flying Jets | 5,000 | -30 | Unicorn Fantasy | 5,000 | +30 |
| Pegasus・TikTok Universe | 42,999・44,999 | -100（1 回だけ） | | | |

ガチャ（ルーレット。当たった数だけ WIN が動く）:

| ギフト | コイン | 中身 |
| --- | --- | --- |
| Travel with You | 999 | WIN ガチャ ±3（よく出る）・±5・±10（まれ） |
| Interstellar | 10,000 | 大 WIN ガチャ -50 / -30 / +30 / +50 |
| Lion | 29,999 | 運命 ±100 のどちらか ＋ RUSH 突入 |

- 1 回で動くのは最大 ±100（ガチャも同じ）
- 演出の段階: -5 で大妨害、-30 で超妨害、-100 で壊滅（+ も同じ境目で 大・超・最大）
- アスレ（`bougai-parkour`）は前の形のまま（Doughnut -1・Galaxy -10・Lion と TikTok Universe -100・Hand Heart +1・Money Gun +5）

### 前の版からの変更

- **ギフト名の間違いを直しました**: 「Hand Hearts」→ **Hand Heart**、「Universe」→ **TikTok Universe**（日本のギフト一覧にない名前だったので、前の版ではこの 2 つに反応していませんでした）
- ひな形のギフト名は、日本で送れるギフトの一覧（`src/data/gifts-jp.json`、651 件）と照らし合わせて、ない名前があると `preset check` で注意が出ます
- Doughnut は WIN -1 から「TNT ×3」に、Galaxy は -10 のまま、WIN -1 は Singing Mushroom（99）に変えました

## SuperStream について

調べたこと（販売ページと、実際のサーバーに入っている 5.0.4 のプロフィールを見て）:

- SuperStream は有料のプラグインで、くわしい説明（wiki）は買った人だけが見られます。公開されているのは、販売ページと更新の記録くらいでした
- プロフィール（5.0.4 では `plugins/SuperStream/<名前>.yml`。`config.yml` と同じフォルダ）に「ギフト ID → 演出」（`GiftListener`）と、フォロー・いいね・コメントなどの演出が書いてあります
- 組み込みの演出は lightning・meteorite・earthquake・explode・blockrain・cage・trap・freeze・launch・teleport など（一覧は `src/superstream.js`）
- プロフィールのギフトは TikTok のギフト ID で書きます（Rose 5655・TikTok 5269・Finger Heart 5487・Perfume 5658・Doughnut 5879・Corgi 6267 など）
- SuperStream に入っている見本のプロフィール（`default_profile.yml`）の 6000〜8018 は演出の見本用の番号で、本物のギフトの ID ではありません。そのまま `/ss profile start` しても、ほとんどのギフトでは何も起きません
- SuperStream の `execute` の中で、このひな形と同じ普通のコマンドも書けます
- SuperStream 5.0.7 は **Paper 26.2 以上**が必要です（プラグインの `api-version: 26.2`）。アスレのマップも 26.2 用なので、Paper 26.2 にそろえるのがおすすめです

そこで、このひな形は **SuperStream がなくても動く、Minecraft の普通のコマンド**（summon・effect・give・clear・title など）だけで組んでいます。
コマンドは Paper 1.21.11 のサーバーで1つずつ試して、書き方の間違いがないことを確かめています。

自分のプロフィールに何が入っているかを調べるには:

1. `config.yaml` の `minecraft.superstreamFile` に、プロフィールのファイルの場所を書く
   （例 `~/server/plugins/SuperStream/default_profile.yml`）
2. `npm run tw -- superstream` か、設定画面の「Minecraft 連携」を見る（ギフト ID ごとの演出が一覧で出ます）

実際のサーバー（Paper 26.2・SuperStream 5.0.7）で確かめたこと:

- `ss test action <プロフィール> <演出>`（例 `ss test action default_profile lightning`）は動く。このツールの `superstreamAction` はこの形で送ります
- `ss test profile <プロフィール> <ギフト ID>` は、プロフィールを動かしていないとエラーになる（`superstreamGift` はそのままでは使えません）
- 入れた直後のプロフィールは自分では動き出さない（auto-start がオフ）ので、このツールの演出と二重になりません

SuperStream の演出も使いたいときは:

- まず試し打ちする: `npm run tw -- mc "ss test action default_profile meteorite"`
- 動いたら、ひな形の `minecraft.rules` のルールに `superstreamAction: meteorite` を足す（コマンドと一緒に動きます）
- **SuperStream 側で `/ss profile start` しない**でください。SuperStream が自分でギフトを受けて演出するので、このひな形の演出と二重になります

## アスレのマップ

- 配布ページ: https://www.minecraftmaps.com/parkour-maps/parkour-paradise-3
  （Hielke 作・100 ステージ・約 35 万ダウンロード・2026 年 7 月に更新。マップはこのリポジトリには入れていません）
- マップの対応バージョンに合わせたサーバーを使います
- 配信者はアドベンチャーモードにすると、ブロックを壊せません。ひな形の妨害もマップを壊さないもの（浮く・回れ右・ジャンプが狂う・目つぶしなど）だけです
- **壊してもいい配信にする**なら、`bougai-parkour.yaml` のいちばん下の「破壊あり」のルールの `#` を外します。そのときは配信の前に世界のフォルダを丸ごとコピーしておいてください
- Lion と TikTok Universe は `/kill` でチェックポイントに戻します。マップのチェックポイントがどこに戻すかを、配信の前に1回試してください

## ひな形を作る・直す

`presets/` に `.yaml` を置くと一覧に出ます。いちばん簡単なのは、近いものをコピーして直すことです。

```yaml
name: 表示名
summary: ひとこと説明
game: 遊ぶゲーム
clear: クリアの条件
goal: 3                        # 目標の WIN 数の初めの値
buttons:                       # 配信の準備に出す WIN のボタン（戻す・リセットはいつも出る）
  - {label: クリア, action: win}
  - {label: ボーナス, value: 1}
setup: [配信の前にやること, ...]
layout:                        # まとめ表示に並べるウィジェット（1080 × 1920 の中の位置。下に書いたものほど上に重なる）
  - {widget: wins, x: 240, y: 60, w: 600, h: 200}
  - {widget: roulette, query: ids=bougai, show: spin, hold: 3, x: 240, y: 1180, w: 600, h: 680}
server:                        # 「Minecraft をこのゲームにする」でサーバーをどうするか
  world: new                   # new 毎回新しい世界 / フォルダの名前（例 parkour）
  properties: {gamemode: survival, difficulty: normal, allow-flight: true}   # server.properties（パネルのときだけ。接続・パスワードの項目は書けない）
  commands: ["gamemode survival @a"]   # 起動したあとに送る
config:                        # config.yaml と同じ書き方（wins・roulettes・rush・minecraft など）
  # ルーレットの項目に wins: -5 で「当たったら WIN -5」（WIN ガチャ）
  # minecraft.rules に events: [like] と everyLikes: 200 で「いいね 200 回ごと」
  wins: {default: {...}}
```

- Minecraft のコマンドの対象は `@a`（サーバーにいる全員）です。配信者のほかに人がいるときは、配信者の名前に置き換えてください
- `setup` の文に「: 」（コロンと空白）が入るときは `"..."` で囲みます（囲まないと YAML の「項目: 値」として読まれます）
- 直したら `npm run tw -- preset check` で確かめます（`npm test` でも全部のひな形を調べます）
