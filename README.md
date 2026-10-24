# ライコネ

最終更新: 2026-10-21

TikTok LIVE 配信用のオーバーレイ集です。OBS / TikTok LIVE Studio の「ブラウザ」ソースに URL を入れるだけで使えます。

## 機能の状態

| 機能 | 何ができるか | 状態 | コードの場所 |
| --- | --- | --- | --- |
| 製品名 | 配信者向けの画面と説明を「ライコネ」にそろえる | できた | `public/dashboard/`、`public/help/`、`public/admin/` |
| 配信テンプレート | 妨害マイクラ・罰ゲーム雑談・耐久・目標配信を選び、差分を確認して設定を入れ、元に戻せる | できた | `src/templates/`、`src/templates.js`、`public/dashboard/templates.js` |
| 配信画面の遊び方選択 | 配信画面の見本で、耐久・目標配信などの使うものを選び、配置を保存する | できた | `public/dashboard/stage.js`、`src/runtime.js` |
| AI にたのむ | 設定変更の案を見てから反映し、元に戻す | できた | `src/ai.js`、`public/dashboard/ai.js` |
| ギフト・コメント・視聴者数の受信と WebSocket 配信 | TikTok LIVE のイベントを受けて画面へ配る | できた | - |
| オーバーレイ、ダッシュボード、モニター、統計、管理画面 | 配信・設定・履歴を管理する。統計に OBS ウィジェット利用時間を表示する | できた | `src/history.js`、`public/history/` |
| 演出の効果ログと配信後レポート | ギフトとサーバー側演出を匿名で記録し、前後のコインを比較する | できた | `src/effect-log.js`、`public/history/` |
| デモ・開発用テスト送信（本番の数を汚さない） | 開発時の確認に使う | できた | - |
| `/healthz`（稼働確認と配信中人数） | 稼働状態を確認する | できた | - |
| Euler Stream の利用数記録 | 日別・配信者別・種類別に数え、`tw euler-usage` で確認する | できた | `src/euler-usage.js` |
| Cloudflare 経由の hosted 運用 | - | 作りかけ（運用環境の確認が必要） | - |
| 演出の効果ログと配信後レポート | - | まだ（カードのみ） | - |
| 外部イベント受け口 `ingest` | TikFinity・Streamer.bot などから、配信者ごとの鍵付きHTTP受け口でギフト・いいね・フォロー・コメント・シェアを受け、既存の正規化と配信へ流す | できた | - |
| 受け口の状態表示・外部ツール案内 | ダッシュボードで TikTok / 外部ツールの状態、最後に届いた時刻、受信数を確認し、鍵と貼り付け用 URL を作る。使い方画面に TikFinity の例と Streamer.bot の準備中案内を表示 | できた | - |
| Minecraft ゴール接近警報 | - | できた（50m・20m・5mの段階警報、1m以内の到達判定、ボスバー作成、WIN連携、開発用確認） | `src/mc-goal-alert.js`、`src/minecraft.js`、`public/widgets/goal-alert.html` |
| 名前入りMinecraft妨害 | - | できた（安全なコマンド生成、状態保存、再起動時の片付け、カットイン配線） | `src/minecraft-name.js`、`src/minecraft.js` |
| ウィジェット表示 | TikTok LIVE のギフト・コメント・集計を画面に出す | できた | `public/widgets/` |
| 開発用ウィジェット撮影 | テナントの一覧から選んだウィジェットへテスト送信し、待って画像を返す | できた（既存のPuppeteer環境が必要） | `src/ai-screenshot.js`, `src/ai-mcp.js` |
| 配信者自身のAI接続 | 自分のテナント限定のトークンを10件まで発行し、読み取り・設定提案・開発テスト送信を行う。期限状態を表示し、値は発行直後だけ表示 | できた | `src/ai-tokens.js`, `src/ai-api.js`, `public/dashboard/ai-streamer.js` |
| 本番撮影 | 本番配信中の画面を撮影する | まだ（安全のため作らない） | - |
| ウィジェットとサーバーの性能計測 | - | できた | `scripts/perf/` |
| 性能の上限判定とJSON出力 | - | できた | `scripts/perf/lib/` |
| 性能改善（perf-fix） | compact の明示接続・履歴保存・復元テストはできた。画面性能とサーバー p95/RSS は未達。`src/hub.js`、`public/widgets/lib/overlay.js`、`test/acceptance/` | 作りかけ | - |
| カットインのプレミア柄・昇格・RUSH格上げ・段階写真 | - | できた | `src/cutin-draw.js`、`public/widgets/lib/cutin-premium.js` |
| カットインの画面撮影と本番反映 | - | 作りかけ（オーナー確認前） | `docs/cards/cutin-premium.md` |
| ガチャの視聴者ごとの回数 | 視聴者ごとに無料回を配り、ギフトのコインで有料回をためて、コメントで回す。景品は演出だけで換金しない | できた | `src/gacha-viewers.js`、`public/dashboard/gacha-viewers-form.js` |
| ダッシュボードの明るさ | 設定画面でライトとダークを切り替える | できた | `public/dashboard/common.js`、`public/dashboard/style.css` |
| 配信の準備と自動接続 | 出すもの・配信ソフト・ためす・配信で使った、の印を保存し、配信画面が開いているときに自動接続する | できた（開発確認まで） | `src/preparation.js`、`public/dashboard/editor.js` |

## ウィジェット

| ウィジェット | 内容 | 推奨サイズ |
| --- | --- | --- |
| OBS連携 `obs-bridge` | できた（偽OBS v5形の受け入れテスト済み・実機確認待ち）。虹・大当たり・RUSH・ボス討伐などでOBSのカメラを揺らす・拡大する。パスワードはURLの#以降だけで扱う | 透明ブラウザソース / 320 × 120 |
| ギフト通知 `gift-alert` | ギフト・フォロー・シェアを中継テロップのように表示。高額ギフトは金色。順番待ちは30件まで（超えると古いものから飛ばす） | 760 × 200 |
| コメント欄 `chat` | 配信のコメントを下から積み上げて表示（テロップ風か吹き出し風）。この配信でギフトを送った人のコメントは金の帯・縁と送ったコインの合計で目立たせ、多く送った人ほど目立つ（3段階）。NG ワード・隠すユーザー・「!」のコマンドは出さない。読み上げもできる | 460 × 640 |
| カットイン `cutin` | パチンコのカットイン。筆でかすれた帯が入り、「激アツ」の文字が叩きつけられ、ガガガと揺れて抜ける。コインで 青→緑→赤（激アツ）→金→虹（確定・フリーズつき）。ルーレットで「当たり」の項目が出ると、ルーレットの形に合わせた当たりの演出が入る（丸型・横は虹の「大当たり」、カジノは金の「ジャックポット」と金貨の雨と電球、スロット台は 7・7・7 が叩きつけられてから「ビッグボーナス」、柔道は太鼓と「一本」に紅い判）。スロットの大当たり・ジャックポットでも出る。順番待ちは20件まで（超えると古いものから飛ばす） | 配信画面と同じ大きさ（例 1080 × 1920） |
| 画像付きカットイン `image-cutin` | 写真を使うカットイン。帯の中いっぱいに写真が入り縁が木炭のかすれ線になる形（inside）か、帯の横に写真が大きく乗る形（side） | 配信画面と同じ大きさ |
| RUSH `rush` | 確変モード。突入すると「RUSH突入」が叩きつけられ、左右の帯に「RUSH中」が縦に流れ、その内側に虹色の筆のかすれ線と光のシャワー。RUSH 中のギフトで時間が延び、合計コインが数え上がり、最後に結果を出す | 配信画面と同じ大きさ |
| ギフト瓶 `gift-jar` | 届いたギフトが入れ物に落ちてたまる（物理演算）。形は保存瓶・ハート・エリクサーのフラスコ。フラスコはたまるほど液体が増える | 瓶 500 × 700 / ハート 600 × 600 / フラスコ 520 × 700 |
| ルーレット `roulette` | ギフトごとに別のルーレットを回せる。形は5つ: 丸型・横スライド・カジノ（金の縁に電球が回り、盤は赤と黒、当たりは緑）・スロット台（赤い筐体のリールが縦に回り、レバーを引く。リール1本か、3本が左から止まってそろう 777 型。3本は当たりの隣でリーチになり、最後の1本がギリギリで外れる）・柔道（畳と畳縁、当たりは紅、中心は黒帯）。項目ごとの色と画像。当たりの項目・ギリギリ演出・確定演出。OBS に入れる URL は1本 | 丸・カジノ・スロット台・柔道は 丸 600 × 680 / 横 820 × 330 / 両方 820 × 680 |
| スロット `slot` | ギフトで回る3リールのスロット。結果はサーバーで先に決まり、リーチ・ニアミス・復活の演出で見せる。見た目は和パチスロ（赤と金の平らな色）かカジノ（黒い筐体に金の縁、電球が流れる、クロームのリール） | 1080 × 600 |
| いいね・視聴者数 `counter` | いいね・視聴者・フォロー・コインなどのスコアボード | 560 × 220 |
| 目標バー `goal` | フォロー数などの目標までの進み具合。達成後に目標を自動で上げられる | 640 × 180 |
| コメント投票 `votes` | コメントの「1」「2」などを1人1票で集計し、締め切り・結果発表まで表示する（状態: できた） | 720 × 360 |
| いいね応援 `cheer` | いいねをみんなでため、満タンで次の周と設定した動作を始める（状態: できた） | 560 × 160 |
| 押しボタン `push-button` | 「押」コメントといいね連打を時間内に集計し、青→緑→赤→金の段階を表示する（状態: できた） | 640 × 360 |
| WIN数 `wins` | 妨害マイクラなどのゲームクリア回数。クリアしたらボタンや Stream Deck で +1、「このギフトで WIN -1」「このギフトで 0 に戻す」のようにギフトで増減（マイナスまで行く）。減ると板にひびが走り、ダメージの数字が飛んで、送った人のアイコン付きのハンコ。15 秒以内に続くと「連続妨害 ×N」でだんだん派手に、0 を割ると「マイナス突入」のサイレンと危険の縞、最低記録を更新すると「最低記録更新」、0 に戻ると「マイナス脱出!」。一度に大きく減ると 大妨害（-10〜）→ 超妨害（-100〜）→ 壊滅（-1000〜）と段階が上がり、数字がドゥルルルと減っていく。5 WIN ごとと目標達成は金で祝う。数は配信をまたいで残る | 横長 600 × 200 / 大きい数字 380 × 400 |
| WIN数の全画面演出 `wins-fx` | WIN数で大きく減ったとき・連続妨害が途切れたとき・目標達成やマイナス脱出のときに、配信画面いっぱいに出す演出。大妨害は画面にガラスのひび、超妨害は全面のひび・サイレン・赤い警報、壊滅は暗転して止まってからガラスが割れて破片が落ちる。0 を割ると上下に「マイナス突入」の危険の帯。送った人の名前も大きく出す | 配信画面と同じ大きさ |
| 延長タイマー `timer` | 配信の残り時間（サブアソン）。ギフト（1コイン○秒・指定のギフトで○分）・フォロー・いいねで時間が延び、「+30秒」が延ばした人のアイコンと一緒に飛んで時計が金に光る。残り10分で朱、1分で板が赤く脈打ち、残り10秒はカウントの音と点滅、0 で「終了」を叩きつける。一時停止・再開・足し引き・リセットはボタンや Stream Deck から。状態はサーバーに残り、再起動しても続きから | 720 × 280 |
| ボス討伐 `boss` | ギフトのコイン（といいね）がダメージになり、視聴者みんなでボスの HP を削る。HP バーが削れて白い残像がゆっくり追いかけ（格闘ゲームの体力ゲージ）、ダメージの数字が飛び、ボスが揺れる。大ダメージは板ごと揺れて斬撃。残りが少ないと HP が赤く点滅。HP 0 で一瞬暗転してから「討伐!」と金の光、とどめを刺した人のアイコン。少し待つと HP を増やした次のボスが出てくる（白鬼 → 赤鬼 → 黒鬼）。討伐でルーレットや Minecraft のコマンドも。HP は配信をまたいで残る | 720 × 260 |
| おみくじ `omikuji` | ギフトで引くおみくじ。大吉〜凶が出やすさ（重み）つきで出て、大吉は金、凶は暗い色。ガチャと同じ仕組み（`src/gacha.js`）で、設定・画面は別 | 360 × 420 |
| ランキング `ranking` | この配信のトップギフター・いいねランキング。順位が入れ替わるとなめらかに動く | 420 × 416（5人） |
| 遅れて光る告知ランプ `peka` | ギフトの直後ではなく、サーバーが決めた時刻に隅のランプを一度だけ光らせ、送った人を表示 | できた（開発確認まで）・360 × 180 |
| リレー停止 `relay-stop` | 抽選結果をサーバーで固定し、ギフトを送った3人がスロットを1本ずつ止める。10秒で自動停止、再接続にも対応 | できた（開発確認まで）・slot.html |
| 動く王座 `throne` | 直近10分のギフト合計で王を決め、接近時だけVSを出し、王冠を移動する。配信終了時に「名君」「最後の王」を確定 | できた（開発確認まで）・900 × 500 |
| 最後の一投とエンドロール `ootori` | ラスト10分の最後の有効なギフトを大トリにし、参加者を重複なく最大20組ずつ表示する。開始・終了・テスト送信・再接続の状態はサーバーで管理 | できた（開発確認まで）・900 × 600 |
| ダレ場の小さな事件 `dareba` | ギフトの勢いが落ちたときだけ、野良ボス・宝箱・号外の事件を1つ起こす。判定と進行はサーバーで管理し、テスト送信は本番集計に入れない | できた（開発確認まで）・640 × 240 |
| Minecraft ゴール接近警報 `goal-alert` | ゴールまでの距離をサーバーで測り、50m・20m・5mでゲーム内のボスバーと画面へ警報を出す。ゴール到達は既存のWIN処理へ一度だけ渡す | できた（開発確認まで）・640 × 180 |
| ステップアップ `stepup` | ギフトの合計で STEP 1〜5 の段を積み、設定した文字・左右・音量を使った段階演出と STEP 5 の虹確定を出す | できた・1080 × 1920 |
| 群予告 `swarm` | ギフトの大群が画面を横切り、設定した文字・音量で揺れながら送った人を表示する | できた・1080 × 1920 |
| ニュースティッカー `ticker`（できた） | お知らせ・目標・最近のギフトを画面下の帯に流す | 1080 × 72 |
| 最近のサポーター `supporters`（できた） | 最近フォロー・ギフト・シェアした人を上から表示する | 420 × 72 + 60 × 件数 |
| 初見さん・常連さん `visitors`（作りかけ・本番前の見た目確認待ち） | 配信ごとの匿名記録で初見・おかえり・常連を迎える。名前とユーザー ID は保存しない | 760 × 160 |
| コンボ `combo` | 同じ人が一定時間内に続けてギフトを送ると ×2、×3…と数え、送信者・回数・段階・合計を受信順に表示する。背景は透明、終了カード・リセット・開発用テスト表示・WebAudio に対応（状態: できた） | 1080 × 1920（`public/widgets/combo.html`） |

配信テンプレートは、ダッシュボードの「かんたん」→「配信テンプレート」から使います。CLI は `npm run tw -- templates`、MCP は `list_templates` / `preview_template` / `apply_template` です。

配信者向けの使い方は [docs/guide/](docs/guide/README.md)、更新のお知らせは [docs/news/](docs/news/2026-10-v1.md) にあります(2026-10-21 に追加)。

これからの演出・ウィジェットの案は [docs/IDEAS.md](docs/IDEAS.md) にまとめています。

機能の状態: 既存のウィジェットは表のとおりです。告知ランプ、リレー停止、動く王座、大トリ、ゴール接近警報、名前入りMinecraft妨害は実装済みです。公開前の見た目確認が残っています。

管理用の画面は3つです。ダッシュボードはスマホの「メニュー」から配信の準備と設定を行い、細かい接続設定は「くわしい人向け」にまとめています。画面の言葉は [docs/words.md](docs/words.md) にそろえています。


| 画面 | URL | 内容 |
| --- | --- | --- |
| モニター | `/monitor/` | 配信中に手元（別画面・スマホ）で見る。コイン・視聴者などの数字、ライブのコメントとギフト、WIN 数のボタン（クリア +1 / -1 / 戻す / リセット）、延長タイマーの残り時間とボタン（スタート・一時停止・再開 / +1分 / -1分）、RUSH の残り時間と突入・終了のボタン、ルーレットの待ちと結果、目標、トップギフター、Minecraft に送ったコマンド |
| 統計 | `/history/` | 配信ごとの記録。1分ごとのコイン・視聴者・いいねのグラフ、前回との比較、トップギフター、ギフトの内訳、ルーレットの結果 |
| 設定 | `/dashboard/` | 配信の準備、出すものの選択、テスト送信、各ウィジェットとマイクラ連携の設定 |

## 上限と飛ばすルール（全部ここに書く）

配信者にも視聴者にも説明していないルールは作らない。数に上限をつけたり、待ちを捨てたりするときは、ダッシュボードの説明とこの表に必ず書く（`test/hidden-limits.test.js` が、表にないファイルの「待ちを捨てる」コードを見つけると落ちる）。

ギフトで回る・光る演出（ルーレット、スロット、リレー、ペカ、ガチャ、マイクラのコマンド）には上限をつけない。投げた分は全部回す。

配信前のTikTok確認は、OBS / TikTok LIVE Studio のウィジェットが開いている間だけ行う。最初の30分は1分ごと、その後は5分ごと。まず署名なしの公開プロフィールHTML/APIだけで配信中かを確認し、配信中と判定できたときだけEuler Streamで署名して接続する。公開窓口が読めない・ブロックされたときは、その probe を止めて従来のEuler接続へ戻す。配信前の失敗は1分、30分を過ぎると5分に延ばし、配信中に切れたときの再接続間隔は変えない。Eulerの実呼び出し数は `data/euler-usage.json` に残す。根拠は `research-notes.md` に記録する。

連打ギフトは、終わりの合図が来たときに個数ぶんまとめて数える。合図が来ないまま接続が切れたり15秒何も来なかったりしたときも、最後に見えた個数で数え、あとから続きが来たら増えた分だけ足す（`src/gift-streaks.js`）。

| 何が | 上限 | 超えたら | ファイル |
| --- | --- | --- | --- |
| ギフト通知の順番待ち | 30件 | 古いものから出さずに飛ばす | `public/widgets/gift-alert.html` |
| カットインの順番待ち | 20件 | 古いものから出さずに飛ばす | `public/widgets/lib/cutin.js` |
| メディア通知の順番待ち | 30件 | 古いものから再生せずに飛ばす | `src/media-alerts.js` |
| ギフト別サウンドの待ち | 10件 | 古いものから鳴らさずに飛ばす | `src/gift-sounds.js`、`public/widgets/sounds.js` |
| コンボ画面の順番待ち | 20件 | 古いものから出さずに飛ばす | `public/widgets/combo.html` |
| 初見さん・常連さんの待ち | 設定の `maxQueue`（既定5人） | 古い人から出さずに飛ばす | `public/widgets/visitors.js` |
| WIN数の「1つ戻す」 | 50回まで | それより前には戻せない | `src/wins.js` |
| 順番待ちの仕組み `createQueue` | 既定は上限なし。`max` を渡した画面だけ上の表の数 | 古いものから飛ばす | `public/widgets/lib/overlay.js` |
| ボス討伐から次のボスまでのダメージ | - | 数字だけ出し、次のボスには持ち越さない | `src/boss.js` |
| ステップアップ・群の待ち時間（`cooldownSeconds`） | 設定の秒数 | その間のギフトは数えない | `src/stepup.js`、`src/swarm.js` |
| マイクラにつながらない間のコマンド | - | 送らずに捨て、記録に残す | `src/minecraft.js` |

## 使い方

```bash
npm install
npm start          # http://127.0.0.1:3939/dashboard/ を開く
npm run demo       # 配信していなくても、デモのイベントを流しながら起動
```

1. ダッシュボードで TikTok のユーザー名を入れて「接続」（配信中である必要があります）
2. 「ウィジェット」で使うものを選び、設定を変えて URL を「コピー」（設定は `config.yaml` に保存されます）
3. OBS / TikTok LIVE Studio に「ブラウザ」ソースを追加し、URL と推奨サイズを入れる

外部ツールから受けるときは、ダッシュボードの「接続の状態」で受け口の鍵を作り、表示された URL を TikFinity などの送信先に貼ります。詳しい項目名と例は `/help/#ingest` にあります。鍵の全文は作成時だけ表示されます。鍵を URL に入れるため、Cloudflare やプロキシのアクセスログに残ることがあります。漏れたら鍵を作り直してください。有効な鍵でも、止められた配信者への送信は 403 になります。外部ツールだけで配信していて TikTok に直接つないでいないときは、テスト送信も集計に入ります。

「デモを流す」や「テスト送信」で、配信前に見た目を確認できます。

テスト送信は本番の数を汚しません。**配信中（TikTok につないでいる間）のテストは画面に出るだけ**で、フォローやコインの数・ランキング・WIN数・タイマー・ボス・Minecraft・記録は変わりません。つなぐ前のテストやデモで増えた数と前の配信の数は、新しい配信につながったときに 0 に戻ります。同じ配信につなぎ直したときは続きから数えます（WIN数・タイマー・ボスは配信をまたいで残るものなので、そのままです）。

### かんたん / くわしく

ダッシュボードは、初めは「かんたん」で開きます（選んだほうをブラウザが覚えます）。

- **かんたん** … 左のサイドバーで選ぶと、右が切り替わります（スマホでは、上に並ぶボタンで選びます）
  - 「配信画面に出すもの」に並ぶウィジェットを押すと、プレビュー・「ためす」・まとまりごとの設定（いつ出す / 見た目 / …）。よく使う項目と「型」（押すとまとめて決まる組み合わせ）だけが出ます。ギフトごとのルール（「Lion で WIN -1」など）は行を足して作れ、YAML は出てきません
  - 「出すものを足す」: まだ使っていないものを目的ごとに選べます
  - 「OBS に入れる URL」: 使っているものの URL と大きさを、まとめてコピーできます
  - スマホではプレビューが上に貼り付き、変えた結果を見ながら決められます
- **くわしく** … 全部の項目・ルールの YAML・設定ファイル全体・テスト送信・最近のイベント・Stream Deck 用の URL（サイドバーの「くわしく設定する」から。戻るときは右上の「かんたんにもどる」）

どちらで変えても同じ設定ファイルに保存されます。「かんたん」の中身（説明・まとまり・呼び名・型）は `public/dashboard/simple.js` に書きます。ルーレットを複数作っても、OBS に入れる URL は `/widgets/roulette.html` の1本です。個別の `?ids=名前` は、必要なときだけ詳細設定の折りたたみから使えます。

### 配信者自身のAI接続

配信者用ダッシュボードの「AIとの接続」から、対象テナントを1つに固定したトークンを発行できます。外部AIには読み取り・`suggest` の dry-run 提案・開発環境の `test_event` だけを許可し、トークンの値は発行直後に一度だけ表示します。手順は [ヘルプ](public/help/index.html#ai) にあります。保存・操作・課金申請・接続や再起動はできず、本番反映は既存の所有者画面と承認の流れで行います。

### AI にたのむ

サイドバーの「AI にたのむ」で「Lion が来たら WIN を 5 減らして」のように文章でたのむと、AI が設定の変更案を作ります。案を見て「この内容で変える」を押すと反映され、「元に戻す」で1つ前に戻せます。たのんだだけでは何も変わりません。

- 使う AI は管理画面の「全員まとめて」で選びます: **Claude（Anthropic）** / **Space Bunny** / そのほか（OpenAI と同じ形の API。場所とモデルを入れる）。キーは AI ごとに分けて残します
- 同じところで、配信者1人が1日にたのめる回数（初めは 20 回）と、「AI への追加の指示」（全員のたのみに付く。事務所の決まりなど）を決められます
- 配信者ごとに使える / 使えないを決められます（管理画面の「AI にたのむ」のスイッチ。初めは使えません）
- AI への指示（システムプロンプト）は `src/ai-prompt.js` にあります。AI の案は、設定に当てて確かめてから見せます（問題があれば AI に1回だけ直させます）
- AI に送るのは、設定に書ける項目の一覧・今の設定（パスワードは抜く）・知っているギフトの名前・たのみの文だけです。Minecraft のアドレスやパスワードは AI では変えられません
- 1人で使うときは、環境変数 `TW_AI_PROVIDER` / `TW_AI_KEY` / `TW_AI_MODEL` / `TW_AI_BASE_URL` でも指定できます

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
| `TW_AI_PROVIDER` | 「AI にたのむ」で使う AI（claude / spacebunny / openai。既定 claude） |
| `TW_AI_KEY` | その AI の API キー（管理画面で入れたキーのほうが先） |
| `TW_AI_MODEL` | モデル（Claude の既定は claude-opus-5-5） |
| `TW_AI_BASE_URL` | TW_AI_PROVIDER が openai のときの API の場所（https://…/v1） |

## 配信者ごとのダッシュボード（契約している配信者に渡す）

1つのサーバーで、契約している配信者それぞれに専用のダッシュボードを渡せます。配信者ごとに設定・配信の記録・WIN数・TikTok の接続が分かれます。

1. サーバーを起動すると、管理画面の場所と合言葉のファイルが表示されます（`data/admin-token.txt`。環境変数 `TW_ADMIN_TOKEN` でも決められます）
2. 管理画面 `/admin/` を開いて合言葉を入れ、「配信者を追加」で名前を入れると、その配信者の URL ができます（URL は開いているドメインで出ます。いまの公開先なら `https://widget.lul.works/...`）
   - **短い URL と 4桁の数字** `/d/<短いID>` … **配信者にはふつうこれを渡します。** 配信者は数字を入れるとダッシュボードが開きます。一度入れた端末は 180 日間数字なし。5回間違えると15分止まる（同じ場所から・全体での入れすぎも止める）。数字は管理画面でいつでも見られ、作り直せます
   - **ダッシュボード** `/t/<鍵>/dashboard/` … 数字なしでそのまま開ける URL（今までどおり使えます）。モニター・統計もこの下
   - **OBS 用** `/t/<OBS 用の鍵>/widgets/...` … 配信者のダッシュボードに出る URL を OBS に入れる。こちらでは設定は変えられず、パスワードも見えません
3. 配信者は、ダッシュボードの「使うウィジェット」で、使うものを自分で選べます

**使えるウィジェットはすべて、管理画面で ON / OFF できます。** 1行ごとに「スイッチ（ON / OFF）」「長さのプルダウン（ずっと・1時間・3時間・6時間・12時間・24時間・3日・7日）」「↺（決めたのを消す）」があります。
- 長さを選んでからスイッチを押すと、その時間だけ ON / OFF になり、過ぎたら**初めの状態**に戻ります。決めたあとに長さだけ変えると、その長さで付け直します
- 初めの状態: **豪華な演出**（カットイン・画像付きカットイン・RUSH・WIN数の全画面演出）は使えない、ほかのウィジェットは使える
- どれを見るか: 配信者ごとに決めた設定 → 全員まとめての設定 → 初めの状態 の順。各行の下に「使える・この人だけ」「使えない・あと3時間で戻る」「使える・全員の設定」「使える・初め」のように出ます
- OFF にしたウィジェットは、OBS には何も表示されません（ダッシュボードのプレビューには理由が出ます）。配信者のダッシュボードでも選べなくなります。切り替えたり期限が切れたりすると、配信中でも自動で切り替わります

管理画面は、配信者が増えても伸びないように、左に1人1行の一覧（名前で探す・「配信中 / 豪華オン / 止めている」で絞り込む・豪華な演出の状態は4つの点）、右にその設定を出します。
- 配信者を選ぶと、右にその人の URL と、全ウィジェットの ON / OFF が開く（配信者が自分で選んでいるものには「選んでいる」と出る）
- 一覧でチェックを付けた人が2人以上なら、右は「選んだ人にまとめて」（ウィジェットごとの ON / OFF・豪華な演出をまとめて・利用の停止）
- 何も選んでいないときは、右は「全員まとめて」。「配信者ごとの設定を全部消す」で、全員を全員まとめての設定にそろえられます

TikTok につなぐための API キー（署名サーバー Euler Stream）は、管理画面の「全員まとめて」のいちばん上で入れられます。全員の接続で共通に使い、次に接続するときから効きます（`data/sign-api-key.txt` に残ります。環境変数 `TIKTOK_SIGN_API_KEY` より先に使います）。

数字が漏れたときは、管理画面の「4桁の数字」の「作り直す」で新しい数字にできます（前の数字で開いていた端末は入れ直し）。鍵の URL が漏れたときは、「URL を作り直す」で古い URL を使えなくできます（短い URL と数字はそのまま、OBS の URL は貼り直し）。「使える」のチェックを外すと、その配信者の利用を止められます。

- 1人で使うときは今までどおり `/dashboard/`（`config.yaml` と `data/`）。配信者ごとのデータは `data/tenants/<id>/`、配信者の一覧は `data/tenants.json`
- サーバーとして公開するときは `TW_HOSTED=1`（1人用の `/dashboard/` を出さず、管理画面と配信者ごとの URL だけにする）と `HOST=0.0.0.0`。HTTPS で公開してください
- AI からの設定（MCP / CLI）は、1人用の `config.yaml` と、配信者自身のテナント限定入口を対象にします。配信者用入口は読み取り・提案・開発テストだけです

## 自分の PC で動かして公開する（無料・いちばん手軽）

自分の PC でサーバーを動かし、Cloudflare Tunnel（無料）で https の URL を付けます。アカウントもカードも要りません。**PC をつけて、このウィンドウを開いている間だけ**配信者が使えます。

**Windows**
1. 初めの1回だけ、PowerShell で `winget install OpenJS.NodeJS.LTS` と `winget install Cloudflare.cloudflared`
2. このフォルダの `deploy\pc\start.bat` をダブルクリック
3. 黒い画面に出る `https://〇〇.trycloudflare.com` が公開 URL。管理画面は後ろに `/admin/`、合言葉は `data\admin-token.txt`

**Mac**: `brew install node cloudflared` のあと `bash deploy/pc/start.sh`

- 注意: この方法の URL は、**起動するたびに変わります**。また `trycloudflare.com` の URL は、Chrome などで「危険なサイト」の警告が出ることがあります（だれでも使える一時的な URL なので、悪用されやすいため）。変わると、配信者に渡した URL や OBS の URL も変わるので、そのたびに渡し直しです。
- 毎回同じ URL にするには、自分のドメイン（Cloudflare に登録したもの。年1,000円ほど）で Tunnel を作り、トークンを `TUNNEL_TOKEN` に入れて起動します（Cloudflare の「Zero Trust → Networks → Tunnels」で作成、公開先は `http://localhost:3939`）。自分のドメインにすると、上の警告も出なくなります。

### いまの公開先（widget.lul.works）

いまは LuLServer で動かし、`https://widget.lul.works` で公開しています。
- サーバー: `~/.config/systemd/user/tiktok-widget.service`（`TW_HOSTED=1 HOST=127.0.0.1 PORT=3939`）。更新は自動です。このフォルダに新しいコミットが入ると、誰も配信していないときに `npm test` を通してから再起動します（`deploy/server/`）。TikTok との接続が切れて `connecting` / `error` になっても、最後に `live` だった時刻から15分未満は配信中として扱い、再起動を待ちます
- トンネル: `~/.config/systemd/user/tiktok-widget-tunnel.service`（設定は `~/.cloudflared/tiktok-widget.yml`、`widget.lul.works` → `http://127.0.0.1:3939`）
- 管理画面は `https://widget.lul.works/admin/`、配信者には `https://widget.lul.works/d/<短いID>` と 4桁の数字を渡します
- 本番で配信者に渡す段階になったら、下の Oracle の無料サーバーに移すと、PC を消していても動きます。

## 無料で公開する（配信者に URL を渡すとき）

サーバーは配信中ずっと TikTok とつながり続けるので、いつも動いているサーバーが要ります。
**Oracle Cloud の「ずっと無料（Always Free）」のサーバー**に置くのがおすすめです（月 0 円）。

### 手順

1. [Oracle Cloud](https://www.oracle.com/jp/cloud/free/) に登録する
   - ホームリージョンは「Japan East (Tokyo)」か「Japan Central (Osaka)」
   - 本人確認でカードを入れますが、無料の範囲なら請求されません
2. 「コンピュート → インスタンス → インスタンスの作成」
   - イメージ: **Ubuntu 24.04**
   - シェイプ: **VM.Standard.A1.Flex**（1 OCPU・6GB）。選べないときは **VM.Standard.E2.1.Micro**
   - 「SSH キー」は「キーを生成して保存」を選び、秘密鍵をダウンロードしておく
3. インスタンスの画面の「サブネット → セキュリティ・リスト → イングレス・ルールの追加」で、
   ソース `0.0.0.0/0`・TCP・宛先ポート `80` と `443` を開ける
4. Oracle の画面右上の「Cloud Shell」（または自分の PC）からサーバーに入り、次の1行を実行する
   ```bash
   curl -fsSL https://raw.githubusercontent.com/404-nan/tiktok-widget/claude/tiktok-widgets-2qpqbk/deploy/oracle/setup.sh | sudo bash
   ```
5. 最後に出る **管理画面の URL**（`https://<IP>.sslip.io/admin/`）と**合言葉**を控える

- Node.js・サーバー（`tiktok-widget`）・https（Caddy。証明書は自動）を入れて、再起動しても自動で動くようにします。データはサーバーの `/var/lib/tiktok-widget/`、合言葉などは `/etc/tiktok-widget.env`
- 新しくするとき: `sudo bash /opt/tiktok-widget/deploy/oracle/setup.sh`（データと合言葉はそのまま）
- 自分のドメインを使うなら、Cloudflare Tunnel のトークンを付けて `TUNNEL_TOKEN=... ` を先頭に足して実行
- 注意: 無料のアカウントのままだと、ほとんど使っていないサーバーは Oracle に止められることがあります。気になるときは「従量課金（Pay As You Go）」にしておくと止められません（無料の範囲なら 0 円のまま）

お金をかけてよいなら、Cloudflare Containers にも置けます（`cloudflare/`・`Dockerfile`。Workers の有料プランとコンテナ代で月 10〜12 ドルほど。`cd cloudflare && npx wrangler deploy`）。
このときは data/ を Cloudflare の中の置き場に送り、起動時に戻します（`src/vault.js`）。

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

- **ギフト名**: 設定のギフト条件は、TikTok の英語名・日本語名・ID のどれでも書けます。画面には TikTok から取得した日本語名を出し、取れないときは今までの名前を出します。自分で訳した名前は使いません
- **ギフトごとのルーレット**: `roulettes` を複数作っても、OBS に入れるのは `/widgets/roulette.html` の1本です。届いたギフトに合うルーレットへ切り替わって回ります。ギフト名の指定はコイン数の条件より優先されます。個別に出したいときだけ詳細設定にある `?ids=punishment` を使えます
- **ギフトごとのルーレット**: `roulettes` を複数作ると、`/widgets/roulette.html` 1つで、届いたギフトに合うルーレットに切り替わって回ります。ギフト名の指定はコイン数の条件より優先されます。`?ids=punishment` で1つだけにもできます。連打（×5 など）は個数分まわり（上限なし）、`perCount: false` で1回だけ。`sameSize: true` で丸型の扇を全部同じ大きさにできます（当たりやすさは `weight` のまま。例: 当たり1つ + `ハズレ*2.111` を9つで、見た目は10個に1個・実際は約20回に1回）。項目に `win: true`（ダッシュボードでは「当たり」）を付けると、出たときにカットインで「大当たり」が入ります（`cutins` の `rouletteWin` / `rouletteWinText`）。当たりの両隣が出たとき（と、当たりのときの半分）は**ギリギリ演出**: 止まりかけてから境目へゆっくりにじり寄り、その前にカットインの「チャンス」（青・緑・赤・金。当たりほど赤・金が出やすい）と針のまわりの大写しが入ります（ルーレットの `chance: false` で止める。大写しは丸型だけ）。当たりのときは35%で**確定演出**（暗転・虹の「確定」・針が虹色のどれか）。両隣の `weight` を少し上げると、ギリギリが増えます
- **色**: 項目ごとに `color` と `textColor`。`#RRGGBB` か、テーマの色の名前（`accent` 朱 / `gold` 金 / `ink` 墨 / `ink-2` / `paper` 白）
- **文字の向き**（丸型）: `labelDirection: radial`（中心から外へ。いつもの形）か `around`（円周にそって横向き。針の位置で正立し、長い文字は小さくして収める）。画像のある項目はいつも横向き
- **画像**: 項目の `image` に画像の URL か `media/` フォルダのファイル名。画像がなければ今までどおり文字だけを中央に出します
- **条件ごとの通知**: `alerts.<名前>.rules` で、ギフト名・ユーザー・コイン数ごとに色・金色の演出・秒数・文を変えられます
- **コメント欄**: `chats.<名前>` で形（`style: telop` テロップ風 / `bubble` 吹き出し風）、最大件数 `maxItems`、消すまでの秒数 `lifetime`（0 で消さない）、アイコン `avatars`、文字の大きさ `fontSize` を選べます
  - ギフトを送った人: この配信で送ったコインの合計が `gifterCoins` 以上で金の帯 → `bigGifterCoins` 以上で太い金の縁 → `topGifterCoins` 以上で金の面（出たときに一度だけ光が走る）。名前の横に「1,200 コイン」のように合計が出ます（`showCoins: false` で隠す）。合計はサーバーが持っているので、OBS を読み込み直しても変わらず、最近のコメントも続きから出ます。集計をリセットすると合計も 0 に戻ります
  - 隠す: `hideWords`（NG ワード。大文字小文字・全角半角は区別しない）、`hideUsers`（ユーザー ID か名前）、`hideCommands`（「!」「！」で始まるコメント。初期値はオン）
  - 読み上げ: `tts: true` で、パソコンに入っている日本語の声で読みます（速さ `ttsRate`、音量 `ttsVolume`、名前も読む `ttsName`、ギフトを送った人だけ `ttsGiftersOnly`）。「www」は「わら」、「8888」は「ぱちぱち」と読み、絵文字と URL は読みません。コメントが速すぎるときは読み飛ばします。OBS のブラウザソースで声が出ないときは、同じ URL を Chrome などで開いておくと読み上げられます（ダッシュボードのプレビューでは読みません）
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
- **延長タイマー（サブアソン）**: `timers.<名前>` で何個でも作れます（URL は `/widgets/timer.html?id=名前`）
  - 初めの時間 `startMinutes`（分）、上限 `maxHours`（初めの時間 + 延びた時間がこれを超えない。0 で上限なし。ボタンでの足し引きは数えない）
  - 延び方: `coinSeconds`（1 コインで○秒。`minCoins` 未満のギフトは延びない）、`followSeconds`（フォロー1人で○秒）、`shareSeconds`、`likeEvery` / `likeSeconds`（いいね○回ごとに○秒）
  - 指定のギフト: `rules` に `{gifts: [Galaxy], minutes: 10}` や `{gifts: [Rose], seconds: 30}`。上から順に最初に合ったものを使い、合ったときは `coinSeconds` の計算はしません。連打の個数分かかり（`perCount: false` で1回だけ）、マイナスにすると減ります
  - 延びるのは動いている間と一時停止中（`pausedExtend: false` なら動いている間だけ）。スタート前と終わった後は延びません
  - 見た目: 残り `warnMinutes` 分（10）で時計が朱、`dangerMinutes` 分（1）で見出しが危険の縞になり板が赤く脈打つ、残り 10 秒はカウントの音と点滅、0 で `endText`（終了）。時計の下には延ばし方の案内（`hint`。空なら自動）と延びた合計
  - 操作はダッシュボード・モニターのボタンか URL（Stream Deck の「Webサイト」など）: `http://127.0.0.1:3939/api/timer/default/start` … スタート（止まっていれば再開）／ `…/pause` … 一時停止 ／ `…/toggle` … 止める・動かすを1つのボタンで ／ `…/add?seconds=60` … +1分（`-60` で引く。`?minutes=5` でも可）／ `…/set?seconds=3600` … 残りを1時間に ／ `…/reset` … 初めの時間に戻してスタート前に（`default` の所を `all` にすると全部）
  - 状態（終わる時刻・一時停止・延びた合計）は `data/timers.json` に残るので、OBS やサーバーを再起動しても続きから。時計は実際の時刻で進みます（サーバーが止まっていた間も、動いているタイマーは減ります）
  - AI からは `npm run tw -- timer` / `timer start` / `timer pause` / `timer add 60` / `timer reset`、MCP の `timer` ツール
- **ボス討伐**: `bosses.<名前>` にボスの名前（`name`）と1体目の HP（`hp`）。1 コイン = 1 ダメージ（`coinDamage` で倍率）。いいねでも削るなら `damageFrom: [coins, likes]`（`likeDamage`）、特定のギフトだけにするなら `gifts`
  - 倒すと `nextDelay` 秒（初期 6 秒）後に、HP を `hpScale` 倍（初期 1.5 倍）にした次のボスが出ます。2体目からの名前は `nextNames`。倒れたままにしたいときは `autoNext: false`
  - 画像は `image` に `media/` のファイルか URL（空なら図形の鬼。何体目かで 白鬼 → 赤鬼 → 黒鬼 と変わる）
  - 演出: `bigHit`（初期 1000）以上のダメージは「大ダメージ」で板ごと揺れ、その 10 倍で「特大」。残り HP が `lowHp`%（初期 20%）以下で HP が赤く点滅
  - 討伐で回すルーレットは `roulette: reward` のように roulettes の名前。Minecraft に送るコマンドは `commands: ["say {user} が {boss} を討伐！"]`（`{user}` とどめを刺した人、`{boss}` ボスの名前、`{round}` 何体目）、マイクラの演出は `superstreamGift` / `superstreamAction`（`minecraft.enabled: true` が必要）
  - ボタン・URL: ダッシュボードの「ダメージ 100 を与える」「討伐する」「HP を戻す」「次のボス」「1体目からやり直す」。Stream Deck などからは `http://127.0.0.1:3939/api/boss/default/heal`（HP を戻す）／ `…/damage?value=100` ／ `…/defeat` ／ `…/next` ／ `…/set?value=500` ／ `…/reset`（`default` を `all` にすると全部）
  - HP は `data/boss.json` に残ります。AI からは `npm run tw -- boss` / `boss damage 100` / `boss heal`、MCP の `boss` ツール
- **RUSH**: `rush.gifts` のギフト、`rush.enterCoins` 以上のギフト、ルーレットの `rush: true` の項目、ダッシュボード・モニターのボタンで突入。RUSH 中は `extendMinCoins` 以上のギフトで `extendSeconds` 秒ずつ延び、最長 `maxSeconds` 秒。状態はサーバーが持つので、OBS を読み込み直しても続きから出ます
- **同じウィジェットを複数**: `jars.elixir` のように名前を付けて作り、URL に `?id=elixir`

書ける項目の一覧は `npm run tw -- reference`（ダッシュボードのフォームにも説明が出ます）。

## マイクラ連携

Minecraft サーバーの RCON にコマンドを送れます（`config.yaml` の `minecraft`）。
マイクラ側の演出プラグイン（TikTok のギフトで Minecraft に演出を起こすもの）の演出も、このツールから起こせます。

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
      superstreamAction: lightning            # マイクラの演出を1つ（ss test action）
      commands: ["say {user} さん、フォローありがとう！"]
    - minCoins: 1000
      superstreamGift: 6001                   # プロフィールのギフト 6001 の演出（ss test profile）
roulettes:
  punishment:
    items:
      - {label: 隕石が降る, superstreamGift: 6001}   # 当たったら起こす（結果が画面に出たタイミング）
      - {label: ダイヤ, commands: ["give @a diamond 1"]}
```

- **ルールごと**: ギフト名・コイン数・フォロー/シェア/いいね・ユーザーを条件に、コマンドやマイクラの演出を送ります
- **ルーレットの結果**: 当たりの項目の `commands` / `superstreamGift` / `superstreamAction` を、結果が画面に出たタイミングで送ります（ルーレットの抽選はサーバーで行うので、OBS とプレビューなど複数の画面でも結果はそろいます）
- **ギフトをそのまま渡す** (`forwardGifts: true`): 届いたギフトごとに `ss test profile <プロフィール> <ギフトID>` を送ります。マイクラ側で `/ss profile start` していないとき用です（両方動かすと演出が二重になります）
- `{user}` などの視聴者由来の文字は、コマンドに入る前に記号を取り除きます
- 設定画面の「マイクラ連携」タブで、接続の確認、コマンドの試し打ち、マイクラ側の演出プロフィールの試し打ち、送ったコマンドの記録を見られます

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
| `list_superstream_actions` / `minecraft_command` | マイクラの設定済みの演出を見る、Minecraft にコマンドを送る |
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
src/push-button.js     コメントといいねを押し数へ集計するサーバー側エンジン
src/config.js          設定ファイルの検証・読み書き（コメントを残す）・監視
src/admin.js           MCP と CLI が共通で使う操作
src/roulette.js        ルーレットの抽選（サーバー側で決めて全画面に配る）
src/vote.js            コメントの番号投票を1人1票で集計し、結果を配る
src/cheer.js           いいね応援ゲージをメモリで集計し、満タンと状態を配る
src/runtime.js         配信者1人分の仕組み（TikTok の接続・集計・ルーレット・RUSH・WIN数・ボス討伐・記録・設定の API）
src/ootori.js          ラスト10分の席、大トリ、参加者、エンドロールをサーバーで管理
src/templates.js       配信テンプレートの読み込み・検証・差分計算
src/templates/         妨害マイクラ・罰ゲーム雑談・耐久・目標配信のテンプレートデータ
src/visitors.js        来場回数を HMAC で匿名化して保存し、初見・常連の通知を配る
src/info-feed.js       フォロー・ギフト・シェアの最近の一覧をメモリで持つ
src/README.md           サーバー側コードの役目とつながり
src/vault.js           Cloudflare で動かすとき、data/ を置き場に送る・起動時に戻す
src/tenants.js         契約している配信者の一覧と鍵、ウィジェットごとの ON / OFF（期限つき・全員まとめて）。受け口の鍵はキャッシュして照合する
src/ingest.js          外部ツールからのイベントを受け、重複・直接接続との競合を整理して hub へ流す
src/ingest-keys.js     外部イベント受け口の鍵を要約で保存・照合する
src/wins.js            WIN 数（ボタン・URL・ギフトのルールで増減し、data/wins.json に残す）
src/timer.js           延長タイマー（残り時間・延長・一時停止をサーバーで持ち、data/timers.json に残す）
src/boss.js            ボス討伐（ギフトのダメージで HP を削り、討伐・次のボスを配る。data/boss.json に残す）
src/rush.js            RUSH（確変）モードの状態と時間（突入・延長・終了を全画面に配る）
src/stepup.js          ステップアップ予告の合計・段階・冷却と配信イベント
src/swarm.js           群予告の個数・種類・冷却と配信イベント
src/combo.js           コンボ（擬似連）の数え上げ・段階・テスト用状態を配る
src/minecraft.js       マイクラ連携（ルール・ルーレットの結果 → RCON）
src/minecraft-name.js  名前入り妨害の安全化・状態保存・再起動時の片付け
src/mc-goal-alert.js   ゴール距離の段階警報と到達判定
src/rcon.js            RCON クライアント
src/superstream.js     マイクラ側の演出プロフィールを読む（演出の一覧）
src/history.js         配信ごとの記録（data/sessions/）
src/healthz.js         稼働確認と、配信中またはつなぎ直し中の人数を返す
mcp/server.js          MCP サーバー
src/ai-screenshot.js   開発用ウィジェットのテスト送信後撮影
bin/tw.js              CLI
src/tiktok.js          tiktok-live-connector で LIVE に接続（切断時は自動で再接続）
src/normalize.js       生データをウィジェット用の形にそろえる（連打ギフトは確定時に1件）
src/hub.js             集計（いいね・視聴者・コイン・トップギフター）と配信
src/ws-mode.js         WebSocket の compact 指定を判定
src/demo.js            デモ・テスト用のイベント
scripts/               ギフト表・リハーサル・性能計測の補助スクリプト
scripts/perf/           一時サーバーとChrome headlessで性能を測る道具
test/                   node --test のテスト（性能・互換性・各機能）
docs/knowledge/         エージェント向けの構成・運用・性能の知識
public/admin/          管理画面（配信者の追加・ウィジェットごとの ON / OFF）
public/dashboard/      設定画面（common.js / charts.js は3画面で共通）
public/dashboard/ingest.js  外部ツールの受け口の状態表示と鍵の作成 UI
public/dashboard/      設定画面（テンプレートの失敗表示と配信画面の配置を含む）
public/dashboard/stage.js 配信画面の見本、遊び方選択、配置保存
public/dashboard/templates.js テンプレートの一覧・差分・適用・元戻しと失敗表示
public/monitor/        配信中モニター
public/history/        統計・履歴
public/widgets/        各ウィジェット（`ootori.html` など。lib/ に共通処理・ルーレットの丸型と横型・入れ物の形）
public/widgets/        各ウィジェット（`vote.html` / `vote.js` はコメント投票、`cheer.html` / `cheer.js` はいいね応援、`push-button.html` / `push-button.js` は押しボタン、`all.html` は複数表示、lib/ に共通処理）
public/widgets/        各ウィジェット（lib/ に共通処理。中身は public/widgets/lib/README.md）
test/                  node --test のテスト
public/help/           配信者向けの使い方（OBS連携の接続手順を含む）
public/monitor/        配信中モニター
public/history/        統計・履歴
public/widgets/        各ウィジェット（lib/ に共通処理・ルーレットの丸型と横型・入れ物の形）
test/                  node --test のテスト（acceptance/obs.test.js は偽OBS v5形の受け入れテスト）
public/widgets/        各ウィジェット（lib/ に共通処理・ルーレットの丸型と横型・入れ物の形）
public/widgets/visitors.html / visitors.js  初見・常連の来場テロップ
test/                  node --test のテスト（acceptance/visitors.test.js は来場テロップの完成条件）
public/dashboard/      設定画面（[README](public/dashboard/README.md)、common.js / charts.js は3画面で共通）
public/monitor/        配信中モニター
public/history/        統計・履歴
public/widgets/        各ウィジェット（[README](public/widgets/README.md)、lib/ に共通処理・ルーレットの丸型と横型・入れ物の形）
test/                  node --test のテスト（[README](test/README.md)）
cloudflare/            Cloudflare（有料）に置くための入り口（worker.js）と設定（wrangler.jsonc）
Dockerfile             コンテナのイメージ
deploy/pc/start.*       自分の PC で動かして Cloudflare Tunnel で公開する
deploy/oracle/setup.sh Oracle の無料サーバーに入れるスクリプト
deploy/server/          lulserver の本番を、配信していないときに自動で新しくする（1分ごと）
```

`src/` の各ファイルの役目とつながりは [src/README.md](src/README.md) にまとめています。
## 機能の状態と本番前レビュー

- 配信・集計・設定・各ウィジェット: できた
- カットインの段階表示、プレミア柄、昇格、RUSH抽選: できた。公開側はES5・CDNなし
- 本番前レビューの回帰確認: できた（`test/acceptance/pre-ship-review.test.js`）
- 作りかけ・未実装: なし（現在の実装範囲）

コードを変えたときは、対応するフォルダのREADMEとこの機能一覧・地図を同じ変更で更新する。

```bash
npm test
```

## ギフトの日本語名の対応表

画面に出すギフト名は `src/gift-names-ja.json`（GiftID → [英語名, 日本語名]）から日本語名を引き、表に無いギフトは TikTok から来た名前のまま出します。表を作り直すときは `node scripts/giftlist.js`（部屋のギフトも足すなら `node scripts/giftlist.js <roomId>`）を実行します。TikTok の公開 gift/list API を英語（`webcast_language=en`）と日本語（`webcast_language=ja-JP`。`ja` だけだと英語で返る）で署名なしに呼び、GiftID で対にして上書きします（前に取れた分は残ります。ログイン・API キー・有料プランは不要）。終わったら `npm test` で確かめてコミットしてください。AI 向けの決まりは `AGENTS.md` にあります。

