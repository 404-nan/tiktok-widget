// WebSocket の接続 URL から、差分形式を明示した接続かを判定する。
export function compactRequested(url) {
  return new URL(url, 'http://localhost').searchParams.get('compact') === '1';
}
