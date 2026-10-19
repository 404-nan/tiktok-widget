# src/templates/

配信テンプレートの設定データだけを置くフォルダです。読み込みと検証は [`../templates.js`](../templates.js) が担当します。

| ファイル | 何をするか |
| --- | --- |
| `bougai.json` | 妨害マイクラの使うものと初期設定を定義する |
| `bakkin.json` | 罰ゲーム雑談の使うものと初期設定を定義する |
| `endurance.json` | 耐久・目標配信の使うものと初期設定を定義する |

`src/runtime.js` のテンプレート API と、ダッシュボード・CLI・MCP から使われます。
