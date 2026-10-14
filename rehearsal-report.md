# リハーサル

release は 127.0.0.1:3941、旧版 d03dd38 は 127.0.0.1:3942。TW_HOSTED=1、TikTok へは接続していない。

## 設定画面と all.html

| テナント | 見ているもの | release (3941) | 旧版 (3942) |
| --- | --- | --- | --- |
| 朝霧モカ | 設定画面 | HTTP 200 サイドバーあり | HTTP 200 サイドバーあり |
| 朝霧モカ | 設定の項目 | テーマ(theme)、ギフト通知(alerts)、コメント欄(chats)、ギフト瓶(jars)、目標バー(goals)、WIN数(wins)、延長タイマー(timers)、ボス討伐(bosses)、いいね・視聴者数(counters)、ルーレット(roulettes)、カットイン(cutins)、画像付きカットイン(imageCutins)、RUSH(rush)、メディア通知(mediaAlerts)、ガチャ(gacha)、ランキング(rankings)、マイクラ連携(minecraft) | テーマ(theme)、ギフト通知(alerts)、コメント欄(chats)、ギフト瓶(jars)、目標バー(goals)、WIN数(wins)、延長タイマー(timers)、ボス討伐(bosses)、いいね・視聴者数(counters)、ルーレット(roulettes)、カットイン(cutins)、画像付きカットイン(imageCutins)、RUSH(rush)、ランキング(rankings)、マイクラ連携(minecraft) |
| 朝霧モカ | release だけにある項目 | mediaAlerts、gacha | — |
| 朝霧モカ | 増えたフィールド | bosses: mode,rankSource,rivalCoins | — |
| 朝霧モカ | 保存設定のキー | active、alerts、bosses、chats、counters、cutins、gacha、goals、imageCutins、jars、mediaAlerts、minecraft、rankings、roulettes、rush、theme、timers、wins | active、alerts、bosses、chats、counters、cutins、goals、imageCutins、jars、minecraft、rankings、roulettes、rush、theme、timers、wins |
| 朝霧モカ | 保存設定の差 | gacha.doneMs、gacha.enabled、gacha.gifts、gacha.minCoins、gacha.pity、gacha.revealMs、gacha.rollMs、gacha.tiers、mediaAlerts.enabled、mediaAlerts.rules | 同じパスで値が違うもの |
| 朝霧モカ | all.html | HTTP 200 alerts、bosses、cutins、goals、roulettes | HTTP 200 alerts、bosses、cutins、goals、roulettes |
| 港のラムネ | 設定画面 | HTTP 200 サイドバーあり | HTTP 200 サイドバーあり |
| 港のラムネ | 設定の項目 | テーマ(theme)、ギフト通知(alerts)、コメント欄(chats)、ギフト瓶(jars)、目標バー(goals)、WIN数(wins)、延長タイマー(timers)、ボス討伐(bosses)、いいね・視聴者数(counters)、ルーレット(roulettes)、カットイン(cutins)、画像付きカットイン(imageCutins)、RUSH(rush)、メディア通知(mediaAlerts)、ガチャ(gacha)、ランキング(rankings)、マイクラ連携(minecraft) | テーマ(theme)、ギフト通知(alerts)、コメント欄(chats)、ギフト瓶(jars)、目標バー(goals)、WIN数(wins)、延長タイマー(timers)、ボス討伐(bosses)、いいね・視聴者数(counters)、ルーレット(roulettes)、カットイン(cutins)、画像付きカットイン(imageCutins)、RUSH(rush)、ランキング(rankings)、マイクラ連携(minecraft) |
| 港のラムネ | release だけにある項目 | mediaAlerts、gacha | — |
| 港のラムネ | 増えたフィールド | bosses: mode,rankSource,rivalCoins | — |
| 港のラムネ | 保存設定のキー | active、alerts、bosses、chats、counters、cutins、gacha、goals、imageCutins、jars、mediaAlerts、minecraft、rankings、roulettes、rush、theme、timers、wins | active、alerts、bosses、chats、counters、cutins、goals、imageCutins、jars、minecraft、rankings、roulettes、rush、theme、timers、wins |
| 港のラムネ | 保存設定の差 | gacha.doneMs、gacha.enabled、gacha.gifts、gacha.minCoins、gacha.pity、gacha.revealMs、gacha.rollMs、gacha.tiers、mediaAlerts.enabled、mediaAlerts.rules | 同じパスで値が違うもの |
| 港のラムネ | all.html | HTTP 200 alerts、bosses、cutins、goals、roulettes | HTTP 200 alerts、bosses、cutins、goals、roulettes |
| 紙飛行機のユキ | 設定画面 | HTTP 200 サイドバーあり | HTTP 200 サイドバーあり |
| 紙飛行機のユキ | 設定の項目 | テーマ(theme)、ギフト通知(alerts)、コメント欄(chats)、ギフト瓶(jars)、目標バー(goals)、WIN数(wins)、延長タイマー(timers)、ボス討伐(bosses)、いいね・視聴者数(counters)、ルーレット(roulettes)、カットイン(cutins)、画像付きカットイン(imageCutins)、RUSH(rush)、メディア通知(mediaAlerts)、ガチャ(gacha)、ランキング(rankings)、マイクラ連携(minecraft) | テーマ(theme)、ギフト通知(alerts)、コメント欄(chats)、ギフト瓶(jars)、目標バー(goals)、WIN数(wins)、延長タイマー(timers)、ボス討伐(bosses)、いいね・視聴者数(counters)、ルーレット(roulettes)、カットイン(cutins)、画像付きカットイン(imageCutins)、RUSH(rush)、ランキング(rankings)、マイクラ連携(minecraft) |
| 紙飛行機のユキ | release だけにある項目 | mediaAlerts、gacha | — |
| 紙飛行機のユキ | 増えたフィールド | bosses: mode,rankSource,rivalCoins | — |
| 紙飛行機のユキ | 保存設定のキー | active、alerts、bosses、chats、counters、cutins、gacha、goals、imageCutins、jars、mediaAlerts、minecraft、rankings、roulettes、rush、theme、timers、wins | active、alerts、bosses、chats、counters、cutins、goals、imageCutins、jars、minecraft、rankings、roulettes、rush、theme、timers、wins |
| 紙飛行機のユキ | 保存設定の差 | gacha.doneMs、gacha.enabled、gacha.gifts、gacha.minCoins、gacha.pity、gacha.revealMs、gacha.rollMs、gacha.tiers、mediaAlerts.enabled、mediaAlerts.rules | 同じパスで値が違うもの |
| 紙飛行機のユキ | all.html | HTTP 200 alerts、bosses、cutins、goals、roulettes | HTTP 200 alerts、bosses、cutins、goals、roulettes |

## data コピーで増えた・変わったファイル

起動前（鍵ファイルを消したあと）と停止後の差。

### release 用コピー

- 新規:
  - `admin-token.txt`
  - `backups/2026-10-14T13-24-32-168Z/tenants.json`
  - `backups/2026-10-14T13-24-32-168Z/tenants/rh-asagiri/config.yaml`
  - `backups/2026-10-14T13-24-32-168Z/tenants/rh-ramune/config.yaml`
  - `backups/2026-10-14T13-24-32-168Z/tenants/rh-yuki/config.yaml`
  - `pin-cookie-secret.txt`
  - `tenants/rh-asagiri/boss.json`
  - `tenants/rh-ramune/boss.json`
  - `tenants/rh-yuki/boss.json`
- 変更: なし
- 削除: なし

### 旧版用コピー

- 新規:
  - `admin-token.txt`
  - `backups/2026-10-14T13-24-32-166Z/tenants.json`
  - `backups/2026-10-14T13-24-32-166Z/tenants/rh-asagiri/config.yaml`
  - `backups/2026-10-14T13-24-32-166Z/tenants/rh-ramune/config.yaml`
  - `backups/2026-10-14T13-24-32-166Z/tenants/rh-yuki/config.yaml`
  - `pin-cookie-secret.txt`
  - `tenants/rh-asagiri/boss.json`
  - `tenants/rh-ramune/boss.json`
  - `tenants/rh-yuki/boss.json`
- 変更: なし
- 削除: なし

## Chromium 103

puppeteer 14.4.1（Chromium 103）。対象は release の最初のテナント。

| 画面 | HTTP | コンソールエラー | スクショ |
| --- | --- | --- | --- |
| all | 200 | 0件  | shots/rehearsal/all.png |
| roulette | 200 | 0件  | shots/rehearsal/roulette.png |
| cutin | 200 | 0件  | shots/rehearsal/cutin.png |
| dashboard | 200 | 0件  | shots/rehearsal/dashboard.png |

