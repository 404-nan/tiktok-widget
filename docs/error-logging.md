# 構造化エラーログ

エラーは「原因・場所・文脈」が分かる1行JSONで残す。値に鍵らしい文字列を入れない。

## 形

```json
{"time":"2026-11-27T00:00:00.000Z","level":"error","service":"tiktok-widget","message":"起動できません","error":{"name":"Error","message":"起動できません"},"location":{"file":"/path/file.js","line":12,"column":3,"function":"start"},"cause":{"name":"Error","message":"設定ファイルが読めません"},"context":{"operation":"startServer","component":"server"}
```

## JS / TS から使う

```js
import { createErrorLogger } from './src/error-logger.js'; // server.js から見た例

const log = createErrorLogger({ service: 'tiktok-widget' });
try {
  // 処理
} catch (error) {
  log.error(error, { operation: 'startServer', component: 'server' });
  throw error;
}
```

記録には `time / level / service / message / error / location / cause / context` が入る。`token`・`secret`・`password`・`authorization`・`apiKey` などの名前の値と、鍵らしい文字列は `[redacted]` に伏せる。

## 採用の決まり

- 新しいサービス境界（HTTP API・Discord 受け口・定期処理・外部コマンド）では、例外を飲まずにこの形で残す
- 直したエラーには、同じ変更で再発防止テストを足す
- エラーの文脈には配信者の個人情報・鍵を入れない。必要なら tenant id などの識別子だけにする
- 管理画面での一覧は、この1行JSONを JSONL ファイルまたは systemd journal から読む形にする（別タスク）
