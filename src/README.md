# src/

サーバー側のイベント処理、設定、配信状態を持つ場所です。カットインの抽選はここで一度だけ行います。

| ファイル | 何をするか |
| --- | --- |
| `cutin-draw.js` | カットインの抽選値を作り、柄・昇格・RUSH格上げの結果を決める |
| `hub.js` | イベントを集め、配る前の準備印を付けて全接続へ配る |
| `runtime.js` | RUSH状態を見てカットイン抽選値をイベントへ付ける |
| `schema.js` | カットインと段階写真の設定項目・初期値・説明を定義する |
| `config.js` | schema に沿って設定を検証し、初期値を補う |
| `rush.js` | RUSHの状態をサーバーで持つ |

## つながり

- `runtime.js` が `hub.js`、`rush.js`、`cutin-draw.js` をつなぐ。
- `server.js` が runtime を起動し、設定は `schema.js` と `config.js` を通る。
- 公開側の `public/widgets/lib/cutin.js` が `cutinDraw` を受けて表示する。
