// 開発用ウィジェットの一覧選択、テスト送信、待機、撮影を順番に行う。
// 撮影ライブラリは本体の依存にせず、既存の開発用ブラウザ環境から任意に読み込む。
import path from 'node:path';
import { createRequire } from 'node:module';

export const MAX_SCREENSHOT_WAIT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;

function fail(message, stage = '確認') {
  const error = new Error(message);
  error.stage = stage;
  return error;
}

function widgetKey(widget) {
  const id = widget.id == null ? 'default' : String(widget.id);
  return `${widget.section}:${id}`;
}

function selectWidget(widgets, requested) {
  const name = String(requested ?? '').trim();
  const found = (widgets ?? []).find((widget) => (
    widgetKey(widget) === name || widget.title === name || widget.section === name
  ));
  if (!found || typeof found.url !== 'string' || !/^https?:\/\//i.test(found.url)) {
    throw fail('一覧にあるウィジェットを指定してください', '対象確認');
  }
  return found;
}

function validateWait(waitMs) {
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > MAX_SCREENSHOT_WAIT_MS) {
    throw fail('待ち時間は0以上の整数で、30秒以内にしてください', '入力確認');
  }
}

function eventArgs(args) {
  const { tenant, widget, waitMs, width, height, ...event } = args;
  return { tenant, ...event };
}

function assertSuccessful(result, stage) {
  if (!result || result.ok === false || result.error) {
    throw fail(result?.error || `${stage}に失敗しました`, stage);
  }
}

function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.TW_PUPPETEER_PATH,
    'puppeteer',
    path.join(process.cwd(), 'node_modules', 'puppeteer'),
    '/tmp/pptr103/node_modules/puppeteer',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* 次の既存環境を試す */ }
  }
  throw fail('撮影機能が使えません。既存の開発用Puppeteer環境を準備してください', '撮影');
}

/** 既存のPuppeteer環境で、指定済みの開発ウィジェットをPNGとして撮影する。 */
export async function captureWidget(url, { width, height } = {}) {
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width, height },
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    // テスト結果を受け取れる状態になってから撮る。接続できなければ成功画像を返さない。
    await page.evaluateOnNewDocument(() => {
      const NativeWebSocket = window.WebSocket;
      window.__twWebSocketOpened = false;
      window.WebSocket = function WidgetWebSocket(...args) {
        const socket = new NativeWebSocket(...args);
        socket.addEventListener('open', () => { window.__twWebSocketOpened = true; });
        return socket;
      };
      window.WebSocket.prototype = NativeWebSocket.prototype;
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
    await page.waitForFunction(() => window.__twWebSocketOpened === true, { timeout: DEFAULT_TIMEOUT_MS });
    const data = await page.screenshot({ type: 'png' });
    return { data: Buffer.from(data), mimeType: 'image/png' };
  } catch (error) {
    throw fail(`撮影に失敗しました: ${error.message}`, '撮影');
  } finally {
    await browser.close().catch(() => {});
  }
}

/** テナントの一覧から1枚だけ撮影し、MCPが返せる画像と安全な要約を作る。 */
export async function takeWidgetScreenshot({ call, capture = captureWidget, isDevelopment, now = () => new Date().toISOString(), args = {} }) {
  if (!isDevelopment) throw fail('この道具は開発環境でだけ使えます', '環境確認');
  const tenant = String(args.tenant ?? '').trim();
  if (!tenant) throw fail('配信者を指定してください', '対象確認');
  const waitMs = args.waitMs ?? 0;
  validateWait(waitMs);

  const listed = await call('list_widget_urls', { tenant });
  assertSuccessful(listed, 'ウィジェット一覧の取得');
  const widget = selectWidget(listed.widgets, args.widget);

  const sent = await call('test_event', eventArgs({ ...args, tenant }));
  assertSuccessful(sent, 'テスト送信');
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

  let image;
  try {
    image = await capture(widget.url, {
      width: Number.isInteger(args.width) && args.width > 0 ? args.width : widget.size?.[0],
      height: Number.isInteger(args.height) && args.height > 0 ? args.height : widget.size?.[1],
    });
  } catch (error) {
    if (error.stage === '撮影') throw error;
    throw fail(`撮影に失敗しました: ${error.message}`, '撮影');
  }
  if (!image?.data || !image?.mimeType) throw fail('撮影に失敗しました: 画像がありません', '撮影');
  return {
    metadata: { widget: widgetKey(widget), kind: args.kind, waitMs, capturedAt: now() },
    image: { type: 'image', data: Buffer.from(image.data).toString('base64'), mimeType: image.mimeType },
  };
}

/** TW_SERVERが開発用のローカル接続先かを、安全側に判定する。 */
export function isDevelopmentServer(server) {
  if (process.env.TW_ENV !== 'dev') return false;
  try {
    const url = new URL(server);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) && url.port !== '' && url.port !== '3939';
  } catch {
    return false;
  }
}
