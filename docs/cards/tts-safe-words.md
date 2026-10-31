# tts-safe-words: 読み上げで、よくある悪口を最初から読まない

for: 北極星
仕事の種類: 作る(小さく)
見た目が変わるか: 変わらない(設定の項目が1つ増えるだけ)

目的: TikTok の決まり(2026-09-24〜)で、配信で読み上げた有害なコメントは配信者の責任になる。今の読み上げは NG ワード(`hideWords`)が空のまま始まるので、初めての配信者は悪口をそのまま声に出してしまう(思いつき箱 2026-10-31、マリー調べ rotation-2026-10-31-1)。

前提(今のコード):
- コメントの設定は `src/schema.js` の 90行あたり(`hideWords`・`tts`・`ttsRate`…)。出す・読むの判断は `public/widgets/lib/chat.js`
- テストは `test/chat.test.js`(`npm test`)

## 作るもの
- `src/schema.js` に `ttsSkipBadWords: bool(true, 'よくある悪口や「死ね」などは読み上げない')` を `tts` の下に足す
- `public/widgets/lib/chat.js` に、よくある日本語の悪口・脅しの短い表(20語くらい。「死ね」「殺す」「消えろ」「きもい」「うざい」など。大文字小文字・ひらがな/カタカナの違いは見ない)を1つ置く。`ttsSkipBadWords` が true のとき、その言葉を含むコメントは読み上げない(画面に出すかどうかは今までどおり `hideWords` だけで決める)
- `public/dashboard/editor.js` の項目名に `ttsSkipBadWords: '悪口は読み上げない'` を足す

## 触ってよいファイル
`src/schema.js`、`public/widgets/lib/chat.js`、`public/dashboard/editor.js`、`test/chat.test.js`、README(機能の一覧と `public/widgets/lib/README.md`)

完成の条件:
- AC-1 `ttsSkipBadWords` が既定 true で、「死ね」を含むコメントは読み上げの対象にならない(画面には出る)
- AC-2 ひらがな・カタカナ違い(「しね」「シネ」)も読まない
- AC-3 `ttsSkipBadWords` を false にすると今までどおり読む
- AC-4 悪口を含まないコメントの読み上げは今までと変わらない
- AC-5 `hideWords` の働きは変わらない(今のテストが全部通る)
- AC-6 `npm test` が全部通る。README を直す

作らないもの: 外の言葉の一覧やサービスを使うこと、画面に出すコメントの絞り込みの変更、AI での判定、新しい画面
証拠: AC-1〜4 の新しいテストが直す前に落ち、直した後に通る出力

## 2巡目(レビューで見つかったもの)
- AC-7 `/api/config` の読み込みが失敗して `public/widgets/chat.html` のフォールバック設定で動くときも、`ttsSkipBadWords` は true になり、「死ね」を含むコメントは読み上げられない

## 完成条件を見直す
- 続いた指摘: 【直す】カードと関係ない画面画像 `artifacts/shots/puchun-e2e.png` が変わっている(1巡目・2巡目とも。2巡目は黒一色に置き換わり)
- あいまいな所: 「触ってよいファイル」に一覧はあるが、「それ以外のファイルは変えない」とは書いておらず、確かめる AC も無い
- あいまいな所: 「見た目が変わるか: 変わらない」が説明だけで、`artifacts/shots/` などの画面画像を変えないことを確かめる AC になっていない
- あいまいな所: 証拠の「直す前に落ち、直した後に通る出力」を作るときに、テストやスクリーンショットの実行で出たファイルを差分に入れてよいかが書かれていない

## 止まった原因と直し(ルー君 2026-10-31)
- 続いた指摘の元: `test/acceptance/puchun-e2e.test.js` が毎回 `artifacts/shots/puchun-e2e.png` を上書きしていた(headless の WebGL で黒一色になる)。写真を一時置き場に書くように直し、画像は元に戻した。ほかのカードも同じ理由で止まっていた
- 1巡目の指摘「シネマ」「ばかり」も読まなくなる: 悪口を中に含むふつうの言葉を先に消してから探すように直し、AC-4 のテストに足した
