# healthz-live: 公開するのは配信中の人数だけ

`GET /healthz` は Cloudflare の稼働確認から認証なしで呼ぶ公開口です。名前や配信者 ID は返さず、`live` に現在配信中またはつなぎ直し中の人数だけを返します。

## 判断

配信中の人数は公開してよい運用情報とします。`docs/knowledge/environments.md` にも同じ前提を記録し、今後これを変えるときは認証・Cloudflare の確認方法と一緒に見直します。

## 確認

- `src/healthz.js` が人数だけを JSON で返す
- `server.js` の実際の `/healthz` ルートが `healthz({ local, tenants })` を使う
- `test/healthz-live.test.js` が live・connecting・ended を確認する
- `test/healthz-server.test.js` が実際のサーバー接続と非開示項目を確認する
