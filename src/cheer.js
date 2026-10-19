// いいねの数を配信中だけメモリにため、応援ゲージの状態を配る。
// いいねした人の情報や満タン回数は保存しない。

const TALLY_DELAY = 250;
const MAX_GOAL = 1000000;

const copy = (value) => structuredClone(value);

function number(value, fallback) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

export class CheerEngine {
  constructor(hub, { onFull = null } = {}) {
    this.hub = hub;
    this.onFull = onFull;
    this.config = {};
    this.states = new Map();
    this.enabled = true;
    hub.on('event', (event) => this.#onEvent(event));
    hub.on('reset', () => this.reset());
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled) this.reset();
  }

  setConfig(config) {
    const next = config && typeof config === 'object' ? config : {};
    for (const id of this.states.keys()) if (!next[id]) this.states.delete(id);
    this.config = next;
    for (const [id, entry] of Object.entries(next)) {
      const state = this.#state(id, entry);
      const oldGoal = state.goal;
      state.title = String(entry.title ?? state.title);
      state.baseGoal = number(entry.goal, state.baseGoal);
      state.growth = number(entry.growth, state.growth);
      state.loop = entry.loop !== false;
      state.actions = Array.isArray(entry.fullActions) ? entry.fullActions : [];
      state.goal = this.#goal(state);
      if (oldGoal !== state.goal && state.full && state.loop) state.full = false;
    }
  }

  ids() { return Object.keys(this.config); }

  add(id, amount) {
    this.#assertEnabled();
    const state = this.#requireState(id);
    if (state.full && !state.loop) return this.#publicState(state);
    const count = Math.max(0, number(amount, 0));
    return this.#add(id, state, count);
  }

  fill(id) {
    this.#assertEnabled();
    const state = this.#requireState(id);
    if (state.full && !state.loop) return this.#publicState(state);
    state.value = state.goal;
    return this.#complete(id, state);
  }

  reset(id) {
    if (id == null) {
      for (const key of this.states.keys()) this.#resetOne(key, true);
      return this.snapshot();
    }
    const state = this.#requireState(id);
    this.#resetOne(id, true);
    return this.#publicState(state);
  }

  snapshot() {
    if (!this.enabled) return {};
    const out = {};
    for (const [id, state] of this.states) out[id] = this.#publicState(state);
    return out;
  }

  #state(id, entry) {
    let state = this.states.get(id);
    if (!state) {
      state = { id, title: String(entry.title ?? 'みんなで応援'), baseGoal: number(entry.goal, 500), growth: number(entry.growth, 1.5), loop: entry.loop !== false, value: 0, goal: 0, round: 0, full: false, actions: [], tallyTimer: null };
      state.goal = this.#goal(state);
      this.states.set(id, state);
    }
    return state;
  }

  #goal(state) { return Math.min(MAX_GOAL, Math.round(state.baseGoal * (state.growth ** state.round))); }

  #requireState(id) {
    if (!this.config[id]) throw new Error(`応援ゲージ「${id}」がありません`);
    return this.#state(id, this.config[id]);
  }

  #assertEnabled() { if (!this.enabled) throw new Error('応援ゲージは利用できません'); }

  #onEvent(event) {
    if (!this.enabled || event?.kind !== 'like') return;
    const count = number(event.count, 0);
    for (const [id, state] of this.states) {
      if (count > 0 && !(state.full && !state.loop)) this.#add(id, state, count);
    }
  }

  #add(id, state, count) {
    state.value += count;
    if (state.value >= state.goal) return this.#complete(id, state);
    this.#scheduleTally(id, state);
    return this.#publicState(state);
  }

  #complete(id, state) {
    const completedRound = state.round;
    const overflow = Math.max(0, state.value - state.goal);
    state.round += 1;
    state.goal = this.#goal(state);
    state.full = true;
    state.value = state.loop ? overflow : state.goal;
    if (state.loop) state.full = false;
    this.#broadcast(id, 'full', { round: completedRound });
    try { this.onFull?.({ id, actions: copy(state.actions), round: completedRound, cheer: this.#publicState(state) }); } catch { /* 動作の失敗でゲージを壊さない */ }
    return this.#publicState(state);
  }

  #scheduleTally(id, state) {
    if (state.tallyTimer) return;
    state.tallyTimer = setTimeout(() => { state.tallyTimer = null; this.#broadcast(id, 'tally'); }, TALLY_DELAY);
    state.tallyTimer.unref?.();
  }

  #publicState(state) { return { value: state.value, goal: state.goal, round: state.round, full: state.full, now: Date.now() }; }

  #broadcast(id, event, extra = {}) {
    const state = this.states.get(id);
    if (state) this.hub.broadcast({ type: 'cheer', id, cheer: this.#publicState(state), event, ...extra });
  }

  #resetOne(id, notify) {
    const state = this.states.get(id);
    if (!state) return;
    clearTimeout(state.tallyTimer);
    state.tallyTimer = null; state.value = 0; state.round = 0; state.goal = this.#goal(state); state.full = false;
    if (notify) this.#broadcast(id, 'reset');
  }
}
