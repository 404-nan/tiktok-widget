# ingest: 外部ツール(TikFinity・Streamer.bot など)からイベントを受ける口

仕事の種類: 作り込み(サーバー側の新しい仕組み。小さな配線を共有ファイルに足す)
見た目が変わるか: いいえ(画面は次のカード `ingest-status.md` で作る)。このカードは API・保存・テストだけ

目的: 今は `src/tiktok.js`(tiktok-live-connector + 署名サービス)だけが入口で、止まると全部止まる。配信者がすでに使っている道具から、ギフト・いいね・フォロー・コメント・シェアを HTTP で受ける口をテナントごとに作り、今と同じ正規化を通して hub へ流す。

作るもの(新しいファイル): `src/ingest.js`(受け口の本体)、`src/ingest-keys.js`(鍵の保存)
足すもの(共有ファイル。足すだけ・最小限): `src/runtime.js`(Ingest を作って hub につなぎ、`/api/ingest` を router に足す。OBS_ALLOWED には足さない)、`server.js`(`/in/:key` を `/t/:key` より前に足す)、`src/tenants.js`(鍵で配信者を探す `byIngestKey` を足す)
触らない: `src/normalize.js` の既存の関数、`src/tiktok.js`、`src/hub.js` の既存の動き(AC-12 の確認だけ)、`src/schema.js`、`public/` 全部(画面と使い方は `ingest-status.md`)
作らないもの: 外部ツールからの設定変更・操作、TikTok への送信(コメント投稿など)、新しい npm パッケージ、課金の仕組み

## 受け口の形
- URL: `POST /in/<鍵>`(JSON か `application/x-www-form-urlencoded`)。ヘッダーを付けにくい道具のため、`GET /in/<鍵>?kind=...&...`(クエリ)も受ける。鍵は `Authorization: Bearer <鍵>` でも渡せる(その場合の URL は `/in`)
- 鍵の形: `twin_` + 乱数(hex 48 文字)。ダッシュボード用・OBS 用の鍵(`/t/<鍵>`)とは別。受け口の鍵ではダッシュボードも OBS も開けない

## 完成の条件
- AC-1 鍵の作成: 配信者の runtime に `ingest.create()` を持たせる。戻り値の `value`(鍵の全文)は作ったその1回だけ。保存するのは sha256 の要約と作った時刻と末尾4文字の目印だけ。ファイルは `<dataDir>/ingest.json`、権限 0600、一時ファイル→rename で書く(`src/ai-tokens.js` と同じ流儀)
- AC-2 作り直し(`create()` をもう一度)で前の鍵は即座に使えなくなる。削除(`remove()`)でも使えなくなる。鍵は配信者あたり1本
- AC-3 管理用 API(runtime の router、ダッシュボードの鍵だけ。OBS 用の鍵は既存の 403 のまま): `GET /api/ingest`(状態。鍵の全文は返さない)、`POST /api/ingest/key`(作成・作り直し。ここだけ全文を返す)、`DELETE /api/ingest/key`
- AC-4 照合: `/in/<鍵>` は要約を `timingSafeEqual` で全配信者と比べる(`ai-tokens.js` の `authenticate` と同じ方法)。違う鍵は 404 で本文は日本語1行(配信者の存在を漏らさない)。止められた配信者(`enabled: false`)は 403。ログに鍵の値を出さない
- AC-5 種類: `kind` は `gift` `like` `follow` `comment`(= chat) `share` のどれか。`chat` も `comment` の別名として受ける。`event`・`type` という名前でも受ける。それ以外は 400(日本語)
- AC-6 欄の名前(下を全部受ける。大文字小文字は区別しない)。ユーザー: `userId` `username`(@ハンドル)`nickname` `avatar`/`avatarUrl`/`avatar_url`/`profilePictureUrl`。ギフト: `giftId` `giftName` `coins`(1個のコイン)`repeatCount`(個数)。いいね: `likeCount` `totalLikeCount`。コメント: `comment`/`content`/`text`/`commandParams`(この順で最初に空でないもの)。数は文字でも数でもよい
- AC-7 正規化: 受けた値を `normalize.js` が読む生データの形(`{ user: { uniqueId, nickname, profilePicture… }, giftId, repeatCount, repeatEnd: true, gift: { name, diamondCount }, count, totalLikeCount, content }`)に直して、既存の `normalizeGift` `normalizeLike` `normalizeChat` `normalizeFollow` `normalizeShare` に渡す。出てきたイベントに `source: 'ingest'` を付けて `hub.publish` する。連打の途中経過は来ない前提(`repeatEnd: true` を付ける)。`coins` が無いギフトは今までどおり gift-coins.json で補う(`normalizeGift` に任せる)
- AC-8 二重に数えない: `Ingest` は hub の `event` を見て、`source` が `ingest` でないイベント(= 直接の TikTok 接続)の「最後に届いた時刻」を持つ。(a) 直接の接続が20秒以内に何か届けているあいだは、受け口から来た `like` は捨てる(累計が混ざるため)。(b) ほかの種類は、直近15秒に同じ内容(種類・ユーザーの id か名前・ギフトの id と個数・コメントの文)が別の経路から来ていたら捨てる。捨てた数は状態に数える。(c) 道具が `eventId`(文字)を付けて同じものを再送したときは、10分のあいだ2回目以降を捨てる(最大1000件覚える)。捨てても応答は 200 で `{ ok: true, duplicate: true }`
- AC-9 送りすぎを抑える: 鍵ごとに1秒20回まで(瞬間 40 回まで)。超えたら 429 と `Retry-After` と日本語の理由。本文は 16KB まで(超えたら 413)。1回の `repeatCount` は 9999 まで、コメントは 150 文字まで、名前は 40 文字までに切る。時計はテストで差し替えられるようにする
- AC-10 テスト送信は本番の数を汚さない: `test=true`(または `?test=1`)を付けたら、`hub.publish` に `test: true` を付けて流す(配信中は画面に出すだけ、という今の動きに任せる)
- AC-11 課金: 課金で接続が止められている配信者(`connectionAllowed()` が false)は 403 で受けない(日本語)。判定が落ちたときは通す(`runtime.js` の `mayConnect` と同じ)
- AC-12 `hub.publish` が `source` を落とさないことをテストで確かめる(今の実装は `...event` を展開するのでそのまま残る。コードの変更が要るときは最小限)
- AC-13 状態: `ingest.state()` は `{ enabled, keyHint, keyCreatedAt, lastEventAt, accepted, duplicates, limited, rejected, byKind, direct: { lastEventAt } }` を返す(鍵の全文・要約は入れない)。数は再起動で消えてよい。`ingest.json` に残すのは鍵の情報だけ

## 証拠
- `test/acceptance/ingest.test.js`(受け入れテスト。実装と別の担当が先に書く): 一時ディレクトリで runtime か `Ingest` 単体を作り、AC-1〜AC-13 を確かめる。HTTP の部分は `test/helpers/guard-harness.js` の流儀(ポートを衝突させない)に合わせる。本物のデータ・本番には触らない
- `test/ingest-keys.test.js`(鍵の保存: 要約だけが保存される、0600(Windows 以外)、作り直しで前の鍵が死ぬ)
- `npm test` 緑(Windows の元からの6件を除く)

## 守ること
AGENTS.md と SESSION-GUIDE.md の決まり。日本語、秘密を出さない(鍵の全文は作成の応答だけ。ログ・コミットには出さない)、既存のテストを書き換えて緑にしない、使わないものを残さない。

## 2巡目(レビューで見つかったもの)
- AC-14 直接の TikTok 接続で届いたコメントと同じ内容を受け口へ `kind: 'comment'` で送ると、15秒以内なら捨てられて `duplicates` が1増える(`chat` で送ったときと同じ結果になる)
- AC-15 `userId` と `username` が両方来たときは `username`(先頭の `@` を取ったもの)が `uniqueId` になる。`userId` だけのとき、`username` だけのときも空にならない
- AC-16 連続で25回送って(残り15回分)から2秒以上止めると、次に続けて40回送っても429にならない(残りは時間に応じて補充され、上限40で止まる)
- AC-17 `content-length` の無い送信(chunked)でも本文が16KBを超えたら413を返す。鍵が違う送信は本文を解析せず404を返し、壊れたJSONは日本語1行の400を返す
- AC-18 `/in` 以外の既存のルートにフォーム形式(`application/x-www-form-urlencoded`)で送っても、`req.body` は今までどおり解析されない
- AC-19 違う鍵で `/in/<鍵>` を何回送っても、まだ runtime を作っていない配信者の runtime は作られない(鍵の照合は `ingest.json` だけを読む)
- AC-20 止められた配信者(`enabled: false`)は、ダッシュボードの鍵で `/api/ingest` と `/api/ingest/key` を叩いても今までどおり403になる
- AC-21 直接の接続から届くイベントの重複判定の記録は15秒より古いものが消える。直接の接続から1万件流しても、記録の件数は直近15秒の分を超えない
