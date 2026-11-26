# 開発環境

## 1コマンド

- `npm run setup`: npm 依存と pre-commit hook を用意し、Node v25.4.0 を確認する
- `npm run dev`: 開発用の起動または安全な開発メニュー
- `npm test`: このリポジトリの既定テスト
- `npm run lint`: JavaScript / TypeScript / Python / shell / JSON の文法、秘密らしい文字列、機密ファイル名を検査
- `npm run format`: EditorConfig の LF・末尾空白・最終改行を直す
- `npm run format:check`: 直さずに確認だけする

## pre-commit

`npm run setup` が `.git/hooks/pre-commit` を作る。コミット前に、ステージしたファイルだけ文法・空白・秘密混入を確かめる。hook は共有 worktree でも効くが、`scripts/dev/toolkit.mjs` が無いブランチでは何もしない。

## 依存を増やさない方針

整形と lint は Node.js 標準だけで動く。EditorConfig と `.prettierrc.json` はエディタ用の共通設定で、実行には Prettier を要求しない。本格的な Prettier / ESLint を足すときは、リポジトリの既存ルールとオーナーの承認に従う。
