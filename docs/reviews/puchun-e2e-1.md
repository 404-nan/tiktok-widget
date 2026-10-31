# レビュー: puchun-e2e 

npm test: 806 pass / 0 fail / 2 skip（新テスト4件は実行され緑）。本番コードの変更はありません。
【直す】AC-2 の「10秒以内に画面に『テスト当たり』が見える」を確かめていません。`public/widgets/puchun/puchun.html:52` が再生前に `fx.warm()` を呼び、`public/widgets/puchun/fx.js:170` が全タイムラインの中間を描くため、`parts.js:716` の `fillText('テスト当たり')` は再生開始前の下ごしらえで走ります（実行ログでも `fxReady=false` の時点で記録されました）。テストは `test/acceptance/puchun-e2e.test.js:109` でその呼び出しを拾って合格するので、再生中に文字が一度も表示されなくても通ります。コミットされた `artifacts/shots/puchun-e2e.png` もリールの途中で「テスト当たり」が写っておらず、カードの「AC-2 の瞬間」の証拠になっていません。再生が文字の時刻（jackpot は 3.15 秒）に達した後の可視 canvas で確かめ、その瞬間を撮る必要があります。
【軽い】AC-4 の「何も出ない」は、画面がつながっていなくても通ります。`test/acceptance/puchun-e2e.test.js:71` の固定 1500ms 待ちの間に WebSocket が開かないと、`:128` のドーナツは届かず `added:0` で合格します。あとからバラを送って確かめても、その時点でつながったことしか分かりません。負荷が高いと起き得ます（このカード自身が以前それで止まっていました）。送信前に接続済みを待つべきです。
【軽い】AC-2 の URL が「ダッシュボードが出すのと同じ問い合わせ」になっていません。`test/acceptance/puchun-e2e.test.js:45` が `?id=rose` を足していますが、puchuns のダッシュボード URL は `/widgets/puchun/puchun.html`（`src/config.js:889`）で id を付けません。今の `puchun.html` は id を見ないので動きますが、テストは実際には配信者に出ない URL を開いています。
