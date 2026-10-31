# レビュー: tts-safe-words 

【直す】`chat.html` のフォールバック設定に `ttsSkipBadWords` がない（`public/widgets/chat.html:140-145`）。`/api/config` が失敗すると既定値が `undefined` になり、悪口を読み上げる。
【軽い】新テストは `speechText()` の直接呼び出しだけで、実際の `chat.html` の読み上げ経路を確かめていない。本番入口で設定が渡ることを確認できない。
【直す】カードと無関係な画面画像 `artifacts/shots/puchun-e2e.png` まで変更されている。見た目を変えないカードの追加変更になっている。
`npm test`: 815通過、2スキップ、0失敗。
