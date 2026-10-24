# src/

サーバー側の中心のフォルダ。配信のイベントを受けて状態を持ち、設定・API・ウィジェットへ渡す。入口は `runtime.js`(配信者1人分)で、`hub.js` がイベントを各機能へ配る。`server.js` が起動時に読み込み、`public/` の画面と WebSocket・HTTP API でつながる。

## ファイル

| ファイル | 役目 |
| --- | --- |
| `actions.js` | 演出結果に応じたタイマー・WIN・Minecraft などの動作を実行する |
| `admin-auth.js` | 管理 API の合言葉を確認する |
| `admin.js` | CLI と MCP からダレ場の状態・開始・停止を呼ぶ |
| `ai-api.js` | AI用HTTP APIの認証、テナント範囲、読み取り・提案・設定・テスト操作と撮影先の安全確認を制御する |
| `ai-mcp.js` | AI向けMCPの道具を登録し、開発用撮影の画像を返す |
| `ai-prompt.js` | AI に送る指示と安全上の説明を作る |
| `ai-screenshot.js` | 開発用テナントのウィジェットを一覧から選び、テスト送信後に撮影する |
| `ai-tokens.js` | 管理者用トークンと、テナント固定で10件までの配信者用トークンを発行・照合・失効する |
| `ai.js` | AI の案を検証し、設定変更の形にする。使ったトークンは `data/ai-usage.jsonl` に残す(中身は書かない) |
| `api-keys.js` | 管理画面の API キーを保存・伏せ字表示する |
| `billing.js` | 利用期限・プラン・課金状態を判定する |
| `boss.js` | ボスの HP、ダメージ、討伐を管理する |
| `cheer.js` | いいねをため、満タンと次の目標を WebSocket で配る（記録しない） |
| `combo.js` | コンボの回数・段階・終了イベント・テスト用状態を管理し、Hubへ配る |
| `config.js` | schema に沿って設定を検証し、初期値を補う |
| `cutin-draw.js` | カットインの抽選値を作り、柄・昇格・RUSH格上げの結果を決める |
| `cutin-style.js` | 画像付きカットインの切り抜き設定 |
| `dareba.js` | ギフトの勢いが落ちたときの事件を判定し、種類・送信者・進行状態を配信する |
| `demo.js` | `member` を含むテスト用イベントを作る |
| `env.js` | 開発環境と本番環境を判定する |
| `events.js` | イベント名と配信時刻を整える |
| `gacha-viewers.js` | ガチャの視聴者ごとの無料回・有料回を数えて保存し、コメントで回す |
| `gacha.js` | ガチャの抽選と状態を管理する |
| `gift-coins.json` | ギフトの控えのコイン数を持つ |
| `gift-display.js` | ギフトの表示名を日本語にする |
| `gift-names-ja.json` | GiftID ごとの日本語ギフト名を持つ |
| `gift-sounds.js` | ギフトに対応する音の待ち列を管理する |
| `gift-streaks.js` | 連打ギフトの終わりの合図が来ないまま切れても、投げた分を数え落とさない（`tiktok.js` から使う） |
| `gifts.js` | ギフト一覧を読み込み、条件検索する |
| `healthz.js` | 稼働確認と、配信中または15分未満の再接続中の人数だけの応答を作る |
| `effect-log.js` | ギフトとサーバー側演出を匿名でまとめて記録し、配信後レポートを作る |
| `euler-usage.js` | Euler Stream の呼び出しを配信者・種類・日ごとに数える |
| `history.js` | 配信履歴を一定間隔または終了時に JSON 保存し、OBS ウィジェットの利用時間も記録する |
| `hub.js` | イベントを集計し、通常形式または明示された compact 差分形式で WebSocket 配信する。OBS 接続の増減も知らせる |
| `info-feed.js` | フォロー・ギフト・シェアの最近の一覧をメモリに持ち、ウィジェットへ渡す |
| `ingest-keys.js` | 外部イベント受け口の鍵を保存・照合する |
| `ingest.js` | 外部ツールからイベントを受け、重複・直接接続との競合を整理してhubへ流す |
| `mc-goal-alert.js` | Minecraftのゴール距離、警報段階、再通知、ゴール到達をサーバーで管理する |
| `media-alerts.js` | 画像・動画・音声の通知を管理する |
| `minecraft-name.js` | Minecraftの名前入り妨害を安全化し、状態保存・再起動時の片付け・コマンドを管理する |
| `minecraft.js` | ギフトや演出を Minecraft の RCON へつなぐ |
| `normalize.js` | TikTok のイベントをアプリ内の形にそろえる |
| `notes.js` | 管理画面のお知らせを保存する |
| `ootori.js` | ラスト10分の席、大トリ、参加者一覧、終了演出の時間をサーバーで管理する |
| `peka.js` | 遅れて光る告知ランプの抽選、予定時刻、点灯、待ち行列をサーバーで管理する |
| `pinlogin.js` | 短い URL と数字のログインを扱う |
| `preparation.js` | 配信の準備4段階と、自動接続の設定を名前なしで保存する |
| `push-button.js` | コメントといいねを押し数へ集計し、結果を WebSocket で配る |
| `rcon.js` | MinecraftのRCONへ接続し、通常コマンドとゴール距離問い合わせを送る |
| `relay-stop.js` | 既存スロットの固定結果、3本の停止順、送信者、10秒の自動停止、待機列をサーバーで管理する |
| `rental.js` | 貸し出し枠と自動接続の条件を判定する |
| `roulette.js` | ルーレットを抽選し、結果を配る |
| `runtime.js` | 大トリ・ダレ場などを配信イベント、API、WebSocket、設定へつなぐ。切断後15分未満の再接続を配信中として判定する |
| `rush.js` | RUSH の突入、延長、終了を管理する |
| `schema.js` | `pushButtons` を含む設定項目・初期値・日本語説明を定義する |
| `signkey.js` | TikTok 署名 API キーを安全に保存する |
| `slot.js` | スロットの抽選と状態を管理する |
| `stepup.js` | ステップアップ予告の合計・段階・冷却を管理する |
| `superstream.js` | Minecraft 側の演出プロフィールを読む |
| `swarm.js` | 群予告の個数・種類・冷却を管理する |
| `templates` | フォルダ。中身はそのフォルダの README |
| `templates.js` | 配信テンプレートを読み込み、検証し、プレビューを作る |
| `tenants.js` | 配信者一覧と配信者ごとの runtime を管理する |
| `throne.js` | 直近10分のギフト合計、王座の在位、接近VS、王冠移動、終了称号をサーバーで管理する |
| `tiktok.js` | TikTok LIVE の配信前判定、接続と再接続を行う。配信前は非Euler判定を優先し、最初の30分は1分ごと、その後は5分ごとに試す |
| `timer.js` | 延長タイマーの状態を管理する |
| `vault.js` | Cloudflare 上で data/ を退避・復元する |
| `visitors.js` | 配信者ごとの秘密鍵で来場者 ID を HMAC 化し、複数設定の最短保存期間・常連回数で通知と匿名記録を管理する |
| `vote.js` | コメントの番号投票を1人1票で集計し、結果を WebSocket で配る |
| `wins.js` | WIN 数と全画面演出の段階を管理する |
| `ws-mode.js` | WebSocket URL の compact 指定を判定する |

## つながり

- イベントの流れ: `server.js` → `tenants.js`(配信者ごと) → `runtime.js` → `hub.js` → 各機能。外部ツールの受け口は `ingest.js` → `normalize.js` → `hub.js`
- 設定の形は `schema.js`、検証は `config.js`。記録は各機能のストアが `config.yaml` / `data/` に書く
- 公開画面へ渡す形は、各エンジンの `snapshot()` と、`hub.js` の配信
- CLI は `bin/tw.js`、MCP は `mcp/server.js`、外部 AI は `ai-api.js` / `ai-mcp.js` から、`admin.js` などを通して呼ぶ
- テストは `test/`(フォルダの README に一覧)

### 機能ごとのつながり

- 演出のエンジン(ペカ、動く王座、リレー停止、大トリ、ダレ場、ゴール接近警報、投票、応援、押しボタン、コンボ、ステップアップなど)は `runtime.js` が作り、`hub.js` のイベントを購読して、状態を API と WebSocket で公開ウィジェットへ渡す。`testEvent` は本番の集計に入れない
- カットイン: `runtime.js` が配信の直前に `cutin-draw.js` で抽選し、公開側の `public/widgets/lib/cutin.js` が `cutinDraw` を受けて表示する
- 開発用撮影: `ai-mcp.js` → `ai-screenshot.js` → `list_widget_urls` / `test_event`

最後に直した日: 2026-10-24
