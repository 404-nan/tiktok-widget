// レンタルサーバーのパネル（Pterodactyl）の API で Minecraft にコマンドを送る。
// ポートが1つしかなく RCON が外から届かないサーバー用。RCON クライアント（rcon.js）と同じ使い方にしている。
// パネルの API では返事（コマンドの結果の文字）は受け取れない。

export class Panel {
  /**
   * url: パネルの URL（https://p-host.example.com）
   * server: サーバーの ID（パネルの URL の /server/ の後ろ。例 081b07e3）
   * key: パネルの「API の認証情報」で作ったキー（ptlc_ で始まる）
   */
  constructor({ url, server, key, timeout = 8000 }) {
    this.base = `${String(url ?? '').replace(/\/+$/, '')}/api/client/servers/${encodeURIComponent(String(server ?? '').trim())}`;
    this.opts = { url, server, key, timeout };
  }

  get connected() {
    return true;
  }

  async #call(path, { method = 'GET', body, raw, text } = {}) {
    const { key, timeout } = this.opts;
    if (!this.opts.url || !this.opts.server || !key) throw new Error('パネルの URL・サーバーの ID・API キーを入れてください');
    let res;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${key}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : raw != null ? { 'content-type': 'text/plain' } : {}),
        },
        body: body ? JSON.stringify(body) : raw ?? undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      throw new Error(`パネルに接続できません（${err.name === 'TimeoutError' ? '応答がありません' : err.cause?.code ?? err.message}）`);
    }
    if (res.ok) return res.status === 204 ? null : text ? res.text() : res.json().catch(() => null);
    const data = await res.json().catch(() => ({}));
    const detail = data.errors?.[0]?.detail ?? '';
    if (res.status === 401 || res.status === 403) throw new Error('パネルの API キーが違うか、このサーバーを使う権限がありません');
    if (res.status === 404) throw new Error('パネルにそのサーバーがありません（サーバーの ID を確かめてください）');
    if (res.status === 429) throw new Error('パネルに送りすぎています（少し待ってください）');
    if (res.status === 502) throw new Error('Minecraft サーバーが止まっています（パネルで起動してください）');
    throw new Error(`パネルがエラーを返しました（HTTP ${res.status}${detail ? `: ${detail}` : ''}）`);
  }

  /** サーバーが動いているか確かめる */
  async connect() {
    const r = await this.#call('/resources');
    const state = r?.attributes?.current_state;
    if (state && state !== 'running') throw new Error(`Minecraft サーバーが動いていません（今: ${state}）`);
  }

  /** コマンドを送る（パネルの API は結果の文字を返さないので、空の文字を返す） */
  async send(command) {
    await this.#call('/command', { method: 'POST', body: { command } });
    return '';
  }

  /** 今の状態（running / offline / starting / stopping） */
  async state() {
    const r = await this.#call('/resources');
    return r?.attributes?.current_state ?? 'unknown';
  }

  /** 起動・停止・再起動（signal: start / stop / restart / kill） */
  power(signal) {
    return this.#call('/power', { method: 'POST', body: { signal } });
  }

  /** サーバーのファイルを読む・書く（例 /server.properties） */
  readFile(file) {
    return this.#call(`/files/contents?file=${encodeURIComponent(file)}`, { text: true });
  }

  writeFile(file, content) {
    return this.#call(`/files/write?file=${encodeURIComponent(file)}`, { method: 'POST', raw: content });
  }

  close() {}
}
