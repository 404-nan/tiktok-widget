# 配信のひな形（presets）

配信ごとの設定をまとめたものです。「今日はエンドラ討伐」「今日はアスレ」のように、配信の前に切り替えて使います。

| ひな形 | 内容 | クリア（+1 WIN） | 目標の初めの値 |
| --- | --- | --- | --- |
| `bougai-endra` 妨害マイクラ（エンドラ討伐） | サバイバルを1から | エンダードラゴンを倒す（死なずに倒したら「ノーデス」でさらに +1） | 3 |
| `bougai-diamond` 妨害マイクラ（ダイヤ集め） | サバイバルを1から。妨害はダイヤ集めのじゃまに寄せている | ダイヤを 10 個持つ（15 分以内なら「早クリア」でさらに +1） | 5 |
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

## WIN の増え方と減り方（3つとも同じ）

| ギフト | コイン | WIN | 演出の段階 |
| --- | --- | --- | --- |
| Doughnut | 30 | -1（個数分） | ふつう。15 秒以内に続くと「連続妨害」で段階が上がる |
| Galaxy | 1,000 | -10（個数分） | 大妨害（×5 で超妨害） |
| Lion・Universe | 29,999・34,999 | -100（何個送っても1回だけ） | 壊滅 |
| Hand Hearts | 100 | +1 救済（個数分） | |
| Money Gun | 500 | +5 救済（1回だけ） | 大 |

- -100 より大きくは減りません（`perCount: false`）
- 演出の境目は `lossPreset: custom` で -10 / -50 / -100、`gainPreset: custom` で +5 / +10 / +30 にしています
- Corgi（299 コイン）で妨害ルーレットが回ります。項目に「RUSH」があり、当たると RUSH 突入
- Lion か、20,000 コイン以上のギフト（Universe も）で RUSH 突入

Minecraft で起きることは、ひな形ごとに違います（配信の準備の「ギフトで起きること」に一覧が出ます）。

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
- Lion と Universe は `/kill` でチェックポイントに戻します。マップのチェックポイントがどこに戻すかを、配信の前に1回試してください

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
  wins: {default: {...}}
```

- Minecraft のコマンドの対象は `@a`（サーバーにいる全員）です。配信者のほかに人がいるときは、配信者の名前に置き換えてください
- `setup` の文に「: 」（コロンと空白）が入るときは `"..."` で囲みます（囲まないと YAML の「項目: 値」として読まれます）
- 直したら `npm run tw -- preset check` で確かめます（`npm test` でも全部のひな形を調べます）
