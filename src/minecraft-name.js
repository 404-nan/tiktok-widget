// Minecraft妨害に使う表示名を安全化し、名前入り妨害の状態とコマンドを管理する。
// 送信者IDは内部でだけ使い、Minecraftとウィジェットへは安全化済み表示名だけを渡す。

const DEFAULT_SHEEP_LIMIT = 30;
const DEFAULT_QUEUE_LIMIT = 30;
const DEFAULT_MEDIUM_SECONDS = 15;
const DEFAULT_LARGE_SECONDS = 60;
const ALLOWED_NAME = /[^\p{L}\p{N}\s_-]/gu;

export function sanitizeMinecraftName(value, max = 24) {
  const cleaned = String(value ?? '')
    .replace(ALLOWED_NAME, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(cleaned).slice(0, max).join('') || '視聴者';
}

function userKey(user) {
  return String(user?.id ?? user?.uniqueId ?? user?.name ?? 'unknown');
}

function eventKey(event) {
  return String(event?.id ?? `${userKey(event?.user)}:${event?.ts ?? ''}:${event?.size ?? ''}`);
}

function commandText(value) {
  return JSON.stringify(String(value));
}

function commandTag(eventId) {
  return `tw_named_${String(eventId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40)}`;
}

function displayName(event) {
  return sanitizeMinecraftName(event?.displayName ?? event?.user?.name);
}

export function namedSabotageCommands(item, size = 'medium') {
  const name = item.displayName || sanitizeMinecraftName(item.user?.name);
  const tag = commandTag(item.eventId);
  const title = commandText(`${name}の妨害`);
  const commands = [`title @a title ${title}`];
  if (size === 'large') {
    commands.push(`bossbar add ${tag} ${commandText(`${name}の妨害`)}`);
    commands.push(`bossbar set ${tag} players @a`);
    commands.push(`bossbar set ${tag} max 60`);
    commands.push(`bossbar set ${tag} value 60`);
    for (let i = 0; i < Math.min(10, item.sheepCount ?? 10); i++) {
      commands.push(`summon sheep ~${i - 5} ~ ~${i % 2 ? 2 : -2} {CustomName:${commandText(name)},Tags:["${tag}"]}`);
    }
    commands.push(`schedule function tw:named_sabotage_expire_${tag} 60s`);
  } else {
    commands.push(`bossbar add ${tag} ${commandText(`${name}の暗闇 残り15秒`)}`);
    commands.push(`bossbar set ${tag} players @a`);
    commands.push(`bossbar set ${tag} max 15`);
    commands.push(`bossbar set ${tag} value 15`);
  }
  return commands;
}

export function namedSabotageCleanupCommands(item) {
  const tag = commandTag(item.eventId);
  return [`bossbar remove ${tag}`, `kill @e[type=sheep,tag=${tag}]`];
}

export class NamedSabotageEngine {
  constructor({ hub, now = () => Date.now(), sheepLimit = DEFAULT_SHEEP_LIMIT, queueLimit = DEFAULT_QUEUE_LIMIT } = {}) {
    this.hub = hub;
    this.now = now;
    this.sheepLimit = sheepLimit;
    this.queueLimit = queueLimit;
    this.config = { enabled: false, mediumSeconds: DEFAULT_MEDIUM_SECONDS, largeSeconds: DEFAULT_LARGE_SECONDS };
    this.active = [];
    this.expired = [];
    this.eventIds = new Set();
  }

  setConfig(config = {}) {
    this.config = { ...this.config, ...config };
    if (Number.isFinite(Number(config.sheepLimit))) this.sheepLimit = Math.max(0, Number(config.sheepLimit));
    if (Number.isFinite(Number(config.queueLimit))) this.queueLimit = Math.max(0, Number(config.queueLimit));
  }

  markSent(eventId) { return this.#mark(eventId, 'sent'); }
  markActive(eventId) { return this.#mark(eventId, 'active'); }

  trigger(event = {}) {
    if (!this.config.enabled || this.eventIds.has(eventKey(event))) return null;
    const size = event.size === 'large' ? 'large' : 'medium';
    const currentSheep = this.active.reduce((sum, item) => sum + (item.state !== 'expired' ? item.sheepCount : 0), 0);
    const sheepCount = size === 'large' ? Math.min(10, Math.max(0, this.sheepLimit - currentSheep)) : 0;
    if (this.active.length >= this.queueLimit || (size === 'large' && sheepCount < 1)) return null;
    const item = {
      eventId: eventKey(event),
      userKey: userKey(event.user),
      user: { id: event.user?.id ?? null },
      displayName: displayName(event),
      size,
      sheepCount,
      state: 'queued',
      queuedAt: this.now(),
      expiresAt: this.now() + (Number(this.config[`${size}Seconds`]) || (size === 'large' ? 60 : 15)) * 1000,
      commands: namedSabotageCommands({ ...event, eventId: eventKey(event), displayName: displayName(event), sheepCount }, size),
    };
    this.eventIds.add(item.eventId);
    this.active.push(item);
    this.broadcast();
    return { ...item, user: { ...item.user } };
  }

  testEvent(event = {}) {
    const item = { ...event, eventId: eventKey(event), displayName: displayName(event), size: event.size === 'large' ? 'large' : 'medium', sheepCount: 0 };
    this.hub?.broadcast({ type: 'named-sabotage', event: { ...item, visualOnly: true }, test: true });
    return { visualOnly: true, displayName: item.displayName };
  }

  expire(eventId) {
    const item = this.active.find((entry) => entry.eventId === eventId);
    if (!item) return false;
    item.state = 'expired';
    item.expiredAt = this.now();
    this.active = this.active.filter((entry) => entry.eventId !== eventId);
    this.expired.push({ ...item });
    this.broadcast();
    return true;
  }

  #mark(eventId, state) {
    const item = this.active.find((entry) => entry.eventId === eventId);
    if (!item) return false;
    item.state = state;
    this.broadcast();
    return true;
  }

  snapshot() {
    const publicItem = (item) => ({
      eventId: item.eventId,
      displayName: item.displayName,
      size: item.size,
      sheepCount: item.sheepCount,
      state: item.state,
      queuedAt: item.queuedAt,
      expiresAt: item.expiresAt,
      expiredAt: item.expiredAt ?? null,
    });
    return { active: this.active.map(publicItem), expired: this.expired.map(publicItem) };
  }

  broadcast() { this.hub?.broadcast({ type: 'named-sabotage', namedSabotage: this.snapshot() }); }
}
