// Minecraft の RCON クライアント（外部ライブラリなし）。
// パケット: 長さ(int32 LE) / ID(int32) / 種類(int32: 3=ログイン, 2=コマンド) / 本文(ASCII/UTF-8) / 0x00 0x00

import net from 'node:net';

const LOGIN = 3;
const COMMAND = 2;

function encode(id, type, body) {
  const payload = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  return buf; // 末尾の 2 バイトは 0 のまま
}

export class Rcon {
  constructor({ host, port, password, timeout = 5000 }) {
    this.opts = { host, port, password, timeout };
    this.socket = null;
    this.ready = null;
    this.seq = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
  }

  get connected() {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  /** 接続してログインする（済んでいれば何もしない） */
  connect() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const { host, port, password, timeout } = this.opts;
      const socket = net.createConnection({ host, port });
      this.socket = socket;
      const fail = (err) => {
        this.close();
        reject(err);
      };
      socket.setTimeout(timeout, () => fail(new Error(`RCON ${host}:${port} が応答しません`)));
      socket.once('error', (err) => fail(new Error(`RCON ${host}:${port} に接続できません（${err.code ?? err.message}）`)));
      socket.on('data', (chunk) => this.#onData(chunk));
      socket.on('close', () => {
        for (const p of this.pending.values()) p.reject(new Error('RCON の接続が切れました'));
        this.pending.clear();
        this.ready = null;
        this.socket = null;
      });
      socket.once('connect', async () => {
        try {
          await this.#request(LOGIN, password);
          socket.setTimeout(0);
          resolve();
        } catch (err) {
          fail(err);
        }
      });
    });
    return this.ready;
  }

  /** コマンドを送り、サーバーの返事を返す */
  async send(command) {
    await this.connect();
    return this.#request(COMMAND, command);
  }

  /** 指定したワールドにいる最寄りのプレイヤーからゴールまでの距離を返す。 */
  async goalDistance({ world, x, y, z }) {
    const dimension = String(world ?? '').replace(/[^A-Za-z0-9_:.\/-]/g, '');
    if (!dimension) throw new Error('ゴールのワールドがありません');
    const response = await this.send(`execute if dimension ${dimension} run data get entity @p Pos`);
    const position = parsePosition(response);
    if (!position) throw new Error('Minecraft から位置を取得できません');
    const dx = position[0] - Number(x);
    const dy = position[1] - Number(y);
    const dz = position[2] - Number(z);
    return { distance: Math.sqrt(dx * dx + dy * dy + dz * dz), world: String(world), serverTime: Date.now() };
  }

  close() {
    this.socket?.destroy();
    this.socket = null;
    this.ready = null;
  }

  #request(type, body) {
    const id = this.seq++;
    if (this.seq > 0x7fffffff) this.seq = 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('RCON の返事がありません'));
      }, this.opts.timeout);
      this.pending.set(id, {
        type,
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.socket.write(encode(id, type, body));
    });
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readInt32LE(0);
      if (this.buffer.length < 4 + len) return;
      const id = this.buffer.readInt32LE(4);
      const body = this.buffer.toString('utf8', 12, 4 + len - 2);
      this.buffer = this.buffer.subarray(4 + len);
      if (id === -1) {
        // ログイン失敗は ID が -1 で返る
        const first = [...this.pending.values()].find((p) => p.type === LOGIN);
        first?.reject(new Error('RCON のパスワードが違います'));
        for (const [k, p] of this.pending) if (p === first) this.pending.delete(k);
        continue;
      }
      const p = this.pending.get(id);
      if (p) {
        this.pending.delete(id);
        p.resolve(body);
      }
    }
  }
}

function parsePosition(response) {
  const values = String(response ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return values.length >= 3 ? values.slice(-3) : null;
}
