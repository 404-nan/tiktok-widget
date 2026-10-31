# レビュー: tts-safe-words 2巡目

【直す】`artifacts/shots/puchun-e2e.png` が今回の変更と無関係に黒一色へ置き換わっています。画面を変えないカードにない変更です。
【軽い】`test/acceptance/tts-safe-words.test.js` は `speechText()` とHTML文字列を直接確認するだけで、実ブラウザの `speak()` 経路や音声呼び出しは確認していません。入口が壊れてもテストが通ります。
【軽い】`docs/reviews/tts-safe-words-1.md` は「フォールバック設定がない」と書いていますが、現在の `chat.html` には `ttsSkipBadWords: true` があります。レビュー記録が実装と食い違っています。
`npm test`: 816通過、0失敗、2スキップ。
