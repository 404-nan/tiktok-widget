// イベントの集約と配信。集計値（いいね・視聴者・フォローなど）を持ち、
// 接続中のウィジェット全員に WebSocket で流す。

const TOP_GIFTERS = 5;

export function emptyState() {
  return {
    likes: 0,
    viewers: 0,
    follows: 0,
    shares: 0,
    diamonds: 0,
    gifts: 0,
    comments: 0,
    topGifters: [],
  };
}

export class Hub {
  constructor() {
    this.clients = new Set();
    this.state = emptyState();
    this.status = { mode: 'idle', username: null, message: '' };
    this.recent = [];
    this.seq = 0;
    this.config = null;
    this.seenGifts = new Map(); // 配信中に届いたギフト（名前 → { id, name, diamonds, image }）
  }

  addClient(ws) {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    this.#send(ws, { type: 'hello', status: this.status, state: this.state, config: this.config });
  }

  /** 設定が変わったらウィジェットに知らせる */
  setConfig(config) {
    this.config = config;
    this.broadcast({ type: 'config', config });
  }

  /** 正規化済みイベントを集計に反映して配信する */
  publish(event) {
    if (!event) return;
    const e = { id: ++this.seq, ts: Date.now(), ...event };
    this.#apply(e);
    this.recent.unshift(e);
    this.recent.length = Math.min(this.recent.length, 50);
    this.broadcast({ type: 'event', event: e, state: this.state });
  }

  control(target, action, data = {}) {
    this.broadcast({ type: 'control', target, action, data });
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.broadcast({ type: 'status', status: this.status });
  }

  reset() {
    this.state = emptyState();
    this.recent = [];
    this.broadcast({ type: 'state', state: this.state });
    this.control('all', 'reset');
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === 1) ws.send(text);
  }

  #send(ws, msg) {
    ws.send(JSON.stringify(msg));
  }

  #apply(e) {
    const s = this.state;
    switch (e.kind) {
      case 'gift': {
        if (e.gift.name && !String(e.user.id).startsWith('demo_')) {
          const { id, name, diamonds, image } = e.gift;
          this.seenGifts.set(name, { id, name, diamonds, image });
        }
        s.gifts += e.gift.count;
        s.diamonds += e.totalDiamonds;
        const key = e.user.id || e.user.name;
        const row = s.topGifters.find((r) => r.key === key);
        if (row) {
          row.diamonds += e.totalDiamonds;
          row.user = e.user;
        } else {
          s.topGifters.push({ key, user: e.user, diamonds: e.totalDiamonds });
        }
        s.topGifters.sort((a, b) => b.diamonds - a.diamonds);
        // 上位だけ表示するが、順位入れ替わりのために少し多めに持っておく
        s.topGifters.length = Math.min(s.topGifters.length, TOP_GIFTERS * 4);
        break;
      }
      case 'like':
        // TikTok からは配信全体の累計が届く。届かないとき（デモなど）は足し上げる。
        s.likes = e.total > 0 ? Math.max(s.likes, e.total) : s.likes + e.count;
        e.total = s.likes;
        break;
      case 'viewers':
        s.viewers = e.viewers;
        break;
      case 'follow':
        s.follows += 1;
        break;
      case 'share':
        s.shares += 1;
        break;
      case 'chat':
        s.comments += 1;
        break;
    }
  }
}
