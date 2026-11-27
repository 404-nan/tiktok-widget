# test/

Node.js の組み込みテストランナーで、サーバーの機能、公開画面の配線、受け入れ条件を確かめるフォルダです。

| ファイル | 役目 |
| --- | --- |
| `acceptance/guard.test.js` / `guard-round2.test.js` / `guard-round3.test.js` | ガード機能の受け入れテスト |
| `acceptance/ledger-admin.test.js` | 集金台帳の認証、同期 retry、集金の二重送信防止、訂正・取り消しを実サーバーで確認する |
| `acceptance/ingest.test.js` / `ingest-round2.test.js` / `ingest-round3.test.js` | ingest AC-1〜24の受け入れテスト |
| `acceptance/ingest-review.test.js` / `ingest-review.test.js` | ingestレビューのHTTP境界・単体テスト |
| `acceptance/ingest-status.test.js` | ingest-statusの画面・説明の受け入れテスト |
| `acceptance/dareba.test.js` / `dareba-wiring.test.js` | ダレ場の判定、状態、停止、配線を確認する |
| `acceptance/peka.test.js` / `peka-wiring.test.js` | ペカの完成条件と配線を確認する |
| `acceptance/throne.test.js` / `throne-wiring.test.js` | 王座の完成条件と配線を確認する |
| `acceptance/ootori.test.js` / `ootori-wiring.test.js` | 大トリの完成条件と配線を確認する |
| `acceptance/relay-stop.test.js` / `relay-stop-wiring.test.js` | リレー停止の完成条件と配線を確認する |
| `acceptance/mc-named-sabotage.test.js` | 名前入りMinecraft妨害の安全化、状態、上限、テスト隔離を確認する |
| `acceptance/mc-goal-alert.test.js` / `mc-goal-alert-wiring.test.js` | ゴール距離、段階警報、RCON、公開画面を確認する |
| `acceptance/obs.test.js` | 偽obs-websocketを使ったOBS連携の受け入れテスト |
| `acceptance/templates.test.js` / `pre-ship-review-templates.test.js` | 配信テンプレートの完成条件と画面のつなぎ目を確認する |
| `acceptance/push-button.test.js` | 押しボタンの設定・集計・操作入口・公開コードを確認する |
| `acceptance/participation-vote-review.test.js` | コメント投票のレビュー条件を確認する |
| `acceptance/cheer.test.js` / `cheer-public.test.js` | いいね応援の設定・集計・操作入口・公開コードを確認する |
| `acceptance/combo.test.js` / `combo-wiring.test.js` / `combo-pre-ship.test.js` | コンボの回数・段階・終了・配線・公開スクリプトを確認する |
| `acceptance/cutin-premium.test.js` | カットインのプレミア演出カードを確認する |
| `acceptance/cutin-voice.test.js` | カットインの段階ごとの声を実ブラウザで確認する |
| `acceptance/info-feed.test.js` | ニュースティッカーと最近のサポーターを確認する |
| `acceptance/visitors.test.js` | 初見・常連の匿名記録と来場テロップを確認する |
| `acceptance/perf-hub.test.js` / `perf-history.test.js` / `perf-cleanup.test.js` | WebSocket差分、履歴保存、後片付けを確認する |
| `acceptance/pre-ship-regressions.test.js` / `pre-ship-review.test.js` | 本番前レビューの回帰条件を確認する |
| `acceptance/ai-screenshot.test.js` / `ai-streamer-entry.test.js` / `pre-ship-review-ai.test.js` | 開発用撮影と配信者専用AI入口の安全境界を確認する |
| `helpers/guard-harness.js` | 一時サーバーを起動するテストヘルパー |
| `actions.test.js` | アクションのテスト |
| `admin-features.test.js` | 管理画面機能のテスト |
| `acceptance/admin-money.test.js` | 管理 API の紹介・入金・報酬と、同名の配信者を区別する入金先の選択欄を確認する |
| `agents-docs.test.js` | 作業規則とドキュメントのテスト |
| `ai.test.js` / `ai-control.test.js` | AI設定と操作制御のテスト。使ったトークンの記録も確かめる |
| `billing.test.js` / `rental.test.js` | 利用制限、利用期間、課金と支払い設定を保存できない場合のテスト |
| `ledger.test.js` / `ledger-sources.test.js` | 集金台帳の残高・FIFO・取り消し・壊れたJSONL、貸出同期、月額入金の再登録順と紹介報酬・残高保護のテスト |
| `boss.test.js` / `boss-rank.test.js` | ボス機能（手動開始・ミッションを含む）と順位のテスト |
| `chat.test.js` | コメント処理のテスト |
| `comment-slide.test.js` | コメントスライド(きっかけの含む判定・上から最初の1つだけ・待ち行列の上限3と捨てる・カタログへの登録)のテスト |
| `coins-nan.test.js` | コイン値の異常系テスト |
| `config.test.js` / `keep-settings.test.js` | 設定読み書きと保持のテスト |
| `bundle.test.js` | リンクまとめの設定の検証と、一覧への URL 追加のテスト |
| `cutin-style.test.js` | カットイン設定のテスト |
| `dev-trigger.test.js` | 開発用トリガーのテスト |
| `env.test.js` | 環境判定のテスト |
| `public-js.test.js` | 公開ウィジェットとダッシュボードの JavaScript が Chromium 103 で動く書き方か(ES2022 まで、新しすぎる関数と外部 CDN なし) |
| `quiz.test.js` | クイズの出題・正解判定（番号・全角半角）・制限時間・問題集の順番と、HTTP 経由の出題とポイントの支払い（テスト送信では払わない） |
| `widget-tenant-paths.test.js` | overlay.js を使わない公開ウィジェットが、配信者ごとの URL の下の API と WebSocket を使うか |
| `gacha-viewers.test.js` | ガチャの視聴者ごとの無料回・有料回、リセット、コメントで回す |
| `test-send-line.test.js` | テスト送信の線引き（本番で所有者だけ・配信画面用の鍵は不可）と、テストが本番の記録・数を変えないこと |
| `gacha-room.test.js` | 無料回は配信の roomId が変わったときだけ戻る |
| `events.test.js` | イベントバスのテスト |
| `door.test.js` | 扉の確率ゲームの進行（段階が進む／外れたら終わる／確率0・100／最後だけ外れる形／テスト送信で動かない／保存）のテスト |
| `gacha.test.js` | ガチャのテスト |
| `stage-queue.test.js` | 舞台の順番待ちの持ち主の管理（取る・返す・待つ・取り消し・配信者ごとの分離） |
| `omikuji-stage-queue.test.js` | おみくじの舞台の順番待ち（大きな演出の間は待つ・順番どおりに引く・上限を超えたら引かずに知らせる・無効設定ではすぐ引く・テストは待たない・配信終了で空になる・カードめくりの開示との連携） |
| `omikuji-daikichi-fx.test.js` | おみくじの大吉の Three.js 演出の時刻表(溜めの加速・強まり・最後の3割の震え、解放の頂点が1回だけで 0.5秒後に山がないこと、輪と粉が解放の瞬間に出ること、余韻が頂点の6割以下、回る角度が途切れない、輪が画面の端まで広がる、収束の小さな灯)、粒の数が千個未満、three を大吉の結果が出たときだけ読むこと(ほかの運勢・動きを減らす設定・読めなかった後は読まない)、後片付け、three の版と置き場所、画面へのつなぎ |
| `omikuji-pick.test.js` | おみくじの番号の選び方(本人のコメントだけ・時間切れ・配信者が選ぶ・配信者も押さない・待ち列・残りはミリ秒で渡す) |
| `omikuji-personal-pity.test.js` | おみくじの個人の天井（人ごとの数え・全体との相互作用・保存と配信終了での戻し・テスト送信で進まない） |
| `card-pity.test.js` | カードめくりの天井（全体・個人。確率方式と枚数方式の両方で確定すること、枚数方式で当たりが選んだ位置へ寄り総数が変わらないこと、確率0でも当たりの顔で出ること、当たりで数えが戻ること、テスト送信で進まないこと、配信終了での戻し、保存と読み直し） |
| `omikuji-pity.test.js` | おみくじの天井(大吉が出ない回数が設定に届いたら確定。配信ごとに0へ戻る)と、残り回数(pityLeft。天井の対象の重みが全部0のときは null) |
| `omikuji-pity-badge.test.js` | おみくじの天井バッジ(pityLeft が数値のときだけ「あと◯回」を出し、null や未定義では出さない) |
| `omikuji-ten-flip.test.js` | おみくじ10連の札が裏から表へ返る表示（表の組み立てと時間差、終わると印が消える、大吉の札だけ長く見せる舞台側の決まり） |
| `omikuji-tencount.test.js` | おみくじのまとめ引きの回数を設定 tenCount で変えられる(専用ギフトの件数・連打と待ちのまとめの境目が追随する・既定は10・札の「〜さんの◯連」・説明文に回数の固定数字が無い・最大30件でも札が舞台に収まる・結果の字の大きさが1段の高さ以下で中身も収まる) |
| `omikuji-eleven.test.js` | elevenGifts の指定ギフトだけ11連にする設定、tenGifts との優先順、天井(全体・個人)の数え、前面の件数表示を確認する |
| `omikuji-luck.test.js` | おみくじの luckBoost（無効時の互換・段数と上限・大吉の重み0・視聴者別・配信終了リセット・天井非干渉・滞在の区切りでの段と合算の上限） |
| `omikuji-like-share.test.js` | おみくじのいいね・シェア引き（初期値は全部無効・端数と倍数・1回で複数回・テスト送信で不動・人が分からないいいねは総数だけ・天井も同じく進む・総いいね数の倍率と luck との掛け合わせ・重み0・保存の読み戻しと版2・版3互換・権利の保持と消化と上限の記録・再起動でも権利が消えず古い順に消化され二重に渡らない・まとめ引きに混ざらない・配信終了で戻る） |
| `base-font.test.js` | 全ウィジェット共通の基本フォント（テーマと個別の書体の既定・知らない書体は既定へ・プリセットと custom の積み重ね・外部読み込みなし・applyFont・overlay.js の共通の入り口とギフト通知・おみくじ画面の配線） |
| `gift-display.test.js` / `gift-names.test.js` / `obs-gift-names.test.js` | ギフト表示名と対応表のテスト |
| `gifts.test.js` / `gift-sounds.test.js` | ギフト処理と音のテスト |
| `history.test.js` / `history-test-send.test.js` | 履歴保存とテスト送信のテスト |
| `effect-log.test.js` | 効果ログの匿名化と配信後レポートのテスト |
| `session-details.test.js` | 配信ごとの1件ごとの記録(ギフト・フォロー・シェア・ルーレットの全件保存と読み出し)のテスト |
| `widget-usage.test.js` | OBS ウィジェット利用時間の合計・判定・表示のテスト |
| `hub.test.js` | イベント集計と配信のテスト（プレビューへ本番の演出を流さない確認を含む） |
| `alert-style.test.js` | 通知の型（style）の後方互換・保持・定義データの検証 |
| `alert-step3.test.js` | 通知の人の軸の材料（hub の刻み・テスト発火でも状態を変えない）と条件キーの保持、順番待ちの優先（従来互換・並び替え・上限で捨てる対象） |
| `alert-style-step2.test.js` | 通知の型の保存の往復と、テンプレート適用差分への乗り |
| `ingest-keys.test.js` | ingest鍵の保存・作り直し・削除の単体テスト |
| `media-alerts.test.js` | メディア通知のテスト |
| `minecraft.test.js` | Minecraft連携のテスト |
| `monitor-status.test.js` | モニター状態のテスト |
| `normalize.test.js` | 入力正規化のテスト |
| `pinlogin.test.js` | PINログインのテスト |
| `reconnect.test.js` | 再接続のテスト |
| `hub-clients.test.js` | ハブが、つながっている画面の役目(obs)を答え、つながったことを知らせるか |
| `preparation.test.js` | 配信準備の印を重複なく保存し、再起動後に読み戻せるか |
| `roulette-actions.test.js` / `roulette-trigger.test.js` | ルーレット操作と起動のテスト |
| `hidden-limits.test.js` | 待ちを捨てるコードが README の「上限と飛ばすルール」に全部書いてあるか |
| `gift-streaks.test.js` | 連打ギフトが途中で切れても数え落とさない・二重に数えないか |
| `rush.test.js` / `rush-odds.test.js` | RUSHと抽選率のテスト |
| `signkey.test.js` | 署名鍵のテスト |
| `slot.test.js` / `timer.test.js` / `timer-length.test.js` | スロットとタイマーのテスト |
| `tenants.test.js` | 配信者管理のテスト |
| `tiktok.test.js` | TikTok接続のテスト |
| `vault.test.js` | データ退避のテスト |
| `weight.test.js` | 重み付き抽選のテスト |
| `widget-background.test.js` | 背景の項目が全ウィジェットに行き渡っていることと、値の検証、前面の適用の形 |
| `release-gates.test.js` | 出す前の関門：設定の届き方（object 型の節を setupWidget で読まない）・お知らせの形（種別必須）・外部読み込みの許可リスト |
| `api-inventory.test.js` | 口の地図（docs/API-INVENTORY.md）に、登録された経路と AI の道具が全部載っていること |
| `wins.test.js` | WIN数のテスト |

## つながり

テストは `npm test` で実行します。受け入れテストは一時ディレクトリと一時ポートを使い、本番の `config.yaml` や `data/` は使いません。OBS連携だけは `node --test test/acceptance/obs.test.js` でも実行できます。

最後に直した日: 2026-11-22

`roulette-art.test.js` はカジノ・柔道の画像と、3本スロットの筐体画像・設定を確かめます。
