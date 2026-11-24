# public/widgets/omikuji/three/

おみくじの大吉の確定演出（`../daikichi-fx.js`）だけが使う Three.js です。ほかのウィジェットや共通スクリプトからは読みません。大吉の結果（reveal）が始まったときに初めて読み込まれます。

- 版: **three 0.183.0**（固定。npm 公式の `three@0.183.0` の `build/` から取り出したもの。sha512 は npm の登録どおり）
- 0.183.0 を選んだわけ: 最小化した `three.module.min.js` / `three.core.min.js` を公式に同梱している一番新しい版（0.186〜0.187 の npm 版には `.min.js` が無い）

| ファイル | 役目 |
| --- | --- |
| `three.module.min.js` | Three.js 本体（モジュール版・最小化）。中で `./three.core.min.js` を読む |
| `three.core.min.js` | 本体が読む中身（r171 から本体と分かれた） |
| `LICENSE` | Three.js の使用許諾（MIT） |

## 入れ替えるとき

```sh
cd "$(mktemp -d)" && npm pack three@<版> && tar xzf three-*.tgz
cp package/build/three.module.min.js package/build/three.core.min.js package/LICENSE <この作業ツリー>/public/widgets/omikuji/three/
```

入れ替えたら、この README の版と `test/omikuji-daikichi-fx.test.js` の版の確かめを直し、`npm test` と実ブラウザ（Chromium 103 相当）で大吉を出して確かめる。

最後に直した日: 2026-11-15
