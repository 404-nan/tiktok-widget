# mcp/

AIがTikTok LIVEウィジェットを読み取り・設定・テストするためのMCPサーバーです。

| ファイル | 役目 |
| --- | --- |
| `server.js` | OBSを含む管理ツール、設定・配信テンプレート操作、開発用撮影をMCPとして公開し、サーバー API に渡す |

## つながり

- 使うもの: `../src/ai-mcp.js`、`../src/ai-screenshot.js`、`../src/admin.js`
- 使われるところ: Claude CodeなどのMCPクライアントから起動される
操作の実体は `src/admin.js` にあり、CLI と同じ開発サーバーのテンプレート API を使います。

最後に直した日: 2026-10-21
