# ガチャの結果に回した人の名前を出す

目的: 視聴者ガチャで「誰が回したか」が画面で分かるようにする(主役は当てた人)。

完成の条件:
- AC-1 視聴者ガチャ(テスト送信 target: gacha-viewer、name: テスト視聴者)を回すと、ガチャのウィジェット(/widgets/gacha.html)に「テスト視聴者」が表示される(回転中・結果・終了のあいだ)
- AC-2 名前の無いきっかけ(テスト送信 target: gacha)のときは、名前の欄に何も出さない(「undefined」「null」などの文字も出さない)
- AC-3 待機に戻ったら名前は消える
- AC-4 名前は文字として出す(HTML として解釈しない。`<b>x</b>` という名前はそのままの文字で出る)
- AC-5 public/widgets/gacha.js は ES5 のまま(test/es5-public.test.js が緑)

作らないもの: アイコン画像、名前の色や大きさの設定項目、ほかのウィジェットの変更、サーバー側の変更(trigger.user はすでに送られている)

決まっていないこと: 名前を出す位置と大きさ(仮: 結果の上に小さめに出す。見た目はめにくんが画像で確認)

証拠: test/acceptance/ の受け入れテスト、npm run check、npm run check:ui の候補画像(gacha)、npm run shot -- gacha
