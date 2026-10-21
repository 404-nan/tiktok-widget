// Minecraft のゴールまでの距離をサーバーで判定し、段階的な警報を配信する。
// 距離・再通知・ゴール到達をここで管理し、画面側で距離を推測させない。

const POLL_MS = 1000;
const RESPONSE_LIMIT_MS = 1500;
const REPEAT_LIMIT_MS = 30_000;
const REARM_DISTANCE = 5;
const SABOTAGE_WINDOW_MS = 15_000;
const GOAL_REACHED_DISTANCE = 1;

export function stageForDistance(distance) {
  if (distance <= 5) return 'final';
  if (distance <= 20) return 'warning';
  if (distance <= 50) return 'near';
  return 'safe';
}

const thresholdFor = (stage) => ({ near: 50, warning: 20, final: 5 }[stage] ?? Infinity);
const severity = (stage) => ({ safe: 0, near: 1, warning: 2, final: 3 }[stage] ?? 0);
const validGoal = (goal) => goal?.enabled !== false && goal?.world && [goal.x, goal.y, goal.z].every((v) => Number.isFinite(Number(v)));

export class GoalAlertEngine {
  constructor({ hub, queryDistance, onGoalReached = () => {}, onAlert = () => {}, now = Date.now }) {
    this.hub = hub;
    this.queryDistance = queryDistance;
    this.onGoalReached = onGoalReached;
    this.onAlert = onAlert;
    this.now = now;
    this.config = null;
    this.timer = null;
    this.pending = null;
    this.requestSeq = 0;
    this.lastSabotage = null;
    this.stage = 'safe';
    this.state = 'disabled';
    this.distance = null;
    this.serverTime = null;
    this.lastNotified = {};
    this.armed = { near: true, warning: true, final: true };
    this.goalHandled = false;
  }

  setConfig(config) {
    const nextConfig = config?.goalAlert ?? config ?? null;
    const sameGoal = validGoal(this.config) && validGoal(nextConfig)
      && ['world', 'x', 'y', 'z'].every((key) => String(this.config[key]) === String(nextConfig[key]));
    const alreadyHandled = sameGoal && this.goalHandled;
    this.stop();
    this.config = nextConfig;
    this.resetState();
    this.goalHandled = alreadyHandled;
    if (!validGoal(this.config)) {
      this.state = 'disabled';
      this.publishState();
      return this.snapshot();
    }
    this.state = 'measuring';
    this.publishState();
    this.start();
    return this.snapshot();
  }

  setGoalReachedHandler(handler) {
    this.onGoalReached = handler ?? (() => {});
  }

  start() {
    if (this.timer || !validGoal(this.config)) return;
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.timer.unref?.();
    this.poll();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.cancelPending();
  }

  cancelPending() {
    if (this.pending?.timer) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  resetState() {
    this.cancelPending();
    this.stage = 'safe';
    this.state = 'disabled';
    this.distance = null;
    this.serverTime = null;
    this.lastNotified = {};
    this.armed = { near: true, warning: true, final: true };
    this.goalHandled = false;
  }

  async poll() {
    if (!validGoal(this.config) || this.state === 'goal' || this.pending) return null;
    const startedAt = this.now();
    const requestId = ++this.requestSeq;
    let resolveTimeout;
    const timeout = new Promise((resolve) => { resolveTimeout = resolve; });
    const pending = { requestId, timer: setTimeout(() => resolveTimeout(null), RESPONSE_LIMIT_MS) };
    this.pending = pending;
    try {
      const result = await Promise.race([Promise.resolve().then(() => this.queryDistance(this.config)), timeout]);
      if (this.pending !== pending || result == null || this.now() - startedAt > RESPONSE_LIMIT_MS) return null;
      return this.acceptDistance(result);
    } catch (error) {
      if (this.pending === pending) {
        this.state = 'error';
        this.publishState({ error: error.message });
      }
      return null;
    } finally {
      clearTimeout(pending.timer);
      if (this.pending === pending) this.pending = null;
    }
  }

  acceptDistance(result) {
    const distance = Number(result?.distance);
    const world = String(result?.world ?? '');
    if (!Number.isFinite(distance) || distance < 0 || world !== String(this.config.world)) {
      this.state = 'error';
      this.publishState({ error: '距離またはワールドを確認できません' });
      return this.snapshot();
    }
    const previousStage = this.stage;
    const previousDistance = this.distance;
    this.distance = distance;
    this.serverTime = Number(result.serverTime) || this.now();
    // 座標から計算した距離は小数になるため、ゴール座標の1m以内を到達とする。
    if (distance <= GOAL_REACHED_DISTANCE) return this.handleGoal();
    this.state = 'measuring';
    const stage = stageForDistance(distance);
    this.rearmStages(distance);
    this.stage = stage;
    const movedCloser = previousDistance == null || distance < previousDistance;
    const enteredMoreSevereStage = severity(stage) > severity(previousStage);
    if (stage !== 'safe' && (enteredMoreSevereStage || movedCloser)) this.notifyIfNeeded(stage);
    this.publishState();
    return this.snapshot();
  }

  testDistance(result) {
    const distance = Number(result?.distance);
    const stage = Number.isFinite(distance) && distance >= 0 ? stageForDistance(distance) : 'safe';
    const message = stage === 'final' ? '最終防衛ライン' : stage === 'warning' ? `ゴールまで ${distance}m` : stage === 'near' ? `ゴールまで ${distance}m` : '';
    this.hub.broadcast({ type: 'goalAlert', visualOnly: true, stage, distance, message, serverTime: result?.serverTime ?? this.now() });
    return { visualOnly: true, stage, distance, message };
  }

  recordSabotage(event) {
    this.lastSabotage = { at: this.now(), user: String(event?.user?.name ?? '').replace(/[<>\r\n]/g, '').slice(0, 32) };
  }

  rearmStages(distance) {
    for (const stage of ['near', 'warning', 'final']) {
      if (distance >= thresholdFor(stage) + REARM_DISTANCE) this.armed[stage] = true;
    }
  }

  notifyIfNeeded(stage) {
    const now = this.now();
    const recent = now - (this.lastNotified[stage] ?? -Infinity) < REPEAT_LIMIT_MS;
    if (!this.armed[stage] || recent) return;
    this.lastNotified[stage] = now;
    this.armed[stage] = false;
    const message = stage === 'final' ? '最終防衛ライン' : `ゴールまで ${this.distance}m`;
    const event = { type: 'goalAlert', stage, distance: this.distance, serverTime: this.serverTime, message, durationMs: 3000 };
    this.onAlert(event);
    this.hub.broadcast(event);
  }

  handleGoal() {
    if (this.goalHandled) return this.snapshot();
    this.goalHandled = true;
    this.stop();
    this.state = 'goal';
    const defenseUser = this.lastSabotage && this.now() - this.lastSabotage.at <= SABOTAGE_WINDOW_MS ? this.lastSabotage.user : null;
    const event = { distance: 0, serverTime: this.serverTime, defenseUser: defenseUser || null };
    this.publishState(event);
    this.onGoalReached(event);
    return this.snapshot();
  }

  snapshot() {
    return {
      state: this.state,
      stage: this.stage,
      distance: this.distance,
      serverTime: this.serverTime,
      lastNotified: { ...this.lastNotified },
    };
  }

  publishState(extra = {}) {
    this.hub.broadcast({ type: 'goalAlertState', goalAlert: { ...this.snapshot(), ...extra } });
  }
}
