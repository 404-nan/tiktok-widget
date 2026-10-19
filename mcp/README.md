# mcp/

AIがTikTok LIVEウィジェットを読み取り・設定・テストするためのMCP入口です。

| ファイル | 何をするか |
| --- | --- |
| `server.js` | stdio MCPを起動し、開発サーバー接続時は撮影道具を含むAI操作を登録する |

## つながり

- 使うもの: `../src/ai-mcp.js`、`../src/ai-screenshot.js`、`../src/admin.js`
- 使われるところ: Claude CodeなどのMCPクライアントから起動される
