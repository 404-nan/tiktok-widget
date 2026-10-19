// 配信していなくてもウィジェットの見た目を確認できるよう、それらしいイベントを作る。

// 画像はないので、ウィジェット側でアイコン（lucide）と価格帯の色で描く
export const DEMO_GIFTS = [
  { id: '5655', name: 'Rose', diamonds: 1, icon: 'flower-2' },
  { id: '5269', name: 'TikTok', diamonds: 1, icon: 'music-2' },
  { id: '6064', name: 'GG', diamonds: 1, icon: 'gamepad-2' },
  { id: '6671', name: 'Love you', diamonds: 1, icon: 'heart' },
  { id: '5487', name: 'Finger Heart', diamonds: 5, icon: 'hand-heart' },
  { id: '5658', name: 'Perfume', diamonds: 20, icon: 'spray-can' },
  { id: '5879', name: 'Doughnut', diamonds: 30, icon: 'donut' },
  { id: '5660', name: 'Hand Hearts', diamonds: 100, icon: 'hand-heart' },
  { id: '6267', name: 'Corgi', diamonds: 299, icon: 'dog' },
  { id: '5761', name: 'Money Gun', diamonds: 500, icon: 'banknote' },
  { id: '6750', name: 'Galaxy', diamonds: 1000, icon: 'orbit' },
  { id: '6369', name: 'Lion', diamonds: 29999, icon: 'crown' },
];

const NAMES = ['さくら', 'たろう', 'みお', 'ゆうと', 'あかり', 'Ken', 'りん', 'そうた', 'ひな', 'Mika', 'はると', 'つむぎ'];
const COMMENTS = ['こんばんは！', 'かわいい', 'すごい！', 'ナイス〜', '初見です', 'おつかれさま', 'www', '8888'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export function demoUser(name = pick(NAMES)) {
  return { id: `demo_${name}`, name, avatar: null };
}

/** 種類を指定してテスト用イベントを1件作る（ダッシュボードのテストボタン用） */
export function makeEvent(kind, opts = {}) {
  const user = opts.user || opts.senderName ? demoUser(opts.user || opts.senderName) : demoUser();
  switch (kind) {
    case 'member':
      return { kind: 'member', user, testVisits: Math.max(1, Number(opts.visits) || 1) };
    case 'gift': {
      // 一覧にないギフト名でも、名前とコインを指定すればテストできる（ルーレットの条件の確認用）
      const custom = opts.giftName && { id: String(opts.giftId || ''), name: String(opts.giftName), diamonds: Math.max(1, Number(opts.diamonds) || 1), icon: 'gift' };
      const g =
        DEMO_GIFTS.find((x) => x.name.toLowerCase() === String(opts.giftName ?? '').toLowerCase() || x.id === opts.giftId) ??
        custom ??
        weightedGift();
      const count = Math.max(1, Number(opts.count) || (g.diamonds <= 5 ? randInt(1, 10) : 1));
      return {
        kind: 'gift',
        user,
        gift: { id: g.id, name: g.name, image: null, icon: g.icon, diamonds: g.diamonds, count },
        totalDiamonds: g.diamonds * count,
      };
    }
    case 'like': {
      const count = Math.max(1, Number(opts.count) || randInt(1, 15));
      return { kind: 'like', user, count, total: 0 };
    }
    case 'viewers':
      return { kind: 'viewers', viewers: Math.max(0, Number(opts.viewers) || randInt(20, 200)) };
    case 'follow':
      return { kind: 'follow', user };
    case 'share':
      return { kind: 'share', user };
    case 'chat':
      return { kind: 'chat', user, text: opts.text || pick(COMMENTS) };
    default:
      return null;
  }
}

// 安いギフトほど出やすくする
function weightedGift() {
  const weights = DEMO_GIFTS.map((g) => 1 / Math.sqrt(g.diamonds));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < DEMO_GIFTS.length; i++) {
    r -= weights[i];
    if (r <= 0) return DEMO_GIFTS[i];
  }
  return DEMO_GIFTS[0];
}

/** 一定間隔でランダムなイベントを流すデモ配信 */
export class DemoSource {
  constructor(hub) {
    this.hub = hub;
    this.timer = null;
    this.viewers = 80;
  }

  get running() {
    return this.timer !== null;
  }

  start() {
    if (this.timer) return;
    this.hub.publish({ ...makeEvent('viewers', { viewers: this.viewers }), test: true });
    this.timer = setInterval(() => this.#tick(), 700);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  #tick() {
    const r = Math.random();
    if (r < 0.45) this.hub.publish({ ...makeEvent('like'), test: true });
    else if (r < 0.62) this.hub.publish({ ...makeEvent('chat'), test: true });
    else if (r < 0.78) this.hub.publish({ ...makeEvent('gift'), test: true });
    else if (r < 0.86) this.hub.publish({ ...makeEvent('follow'), test: true });
    else if (r < 0.9) this.hub.publish({ ...makeEvent('share'), test: true });
    else {
      this.viewers = Math.max(5, this.viewers + randInt(-8, 10));
      this.hub.publish({ ...makeEvent('viewers', { viewers: this.viewers }), test: true });
    }
  }
}
