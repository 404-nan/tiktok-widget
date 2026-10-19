// コメントといいねをサーバー側で「押し」に集計する参加型ボタン。
// 押した人の ID は重複判定だけに使い、公開状態やファイルには出さない。

const MAX_SECONDS = 60;
const TALLY_DELAY = 250;
const RECENT_NAMES = 3;
const clone = (value) => structuredClone(value);

export class PushButtonEngine {
  constructor(hub, { onResult = null } = {}) {
    this.hub = hub;
    this.onResult = onResult;
    this.config = {};
    this.states = new Map();
    this.enabled = true;
    hub.on('event', (event) => this.#onEvent(event));
    hub.on('reset', () => this.reset());
  }

  setEnabled(enabled) { this.enabled = enabled !== false; if (!this.enabled) this.reset(); }
  setConfig(config) { this.config = config && typeof config === 'object' ? config : {}; }
  ids() { return Object.keys(this.config); }

  start(id, overrides = {}) {
    this.#assertEnabled();
    const entry = this.config[id];
    if (!entry) throw new Error(`押しボタン「${id}」がありません`);
    const state = this.#state(id, entry);
    if (state.phase === 'open') throw new Error('押しボタンはもう始まっています');
    const seconds = overrides.seconds == null ? Number(entry.seconds) || 5 : Number(overrides.seconds);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_SECONDS) throw new Error('受付時間は 1 秒以上 60 秒以下にしてください');
    this.#clear(state);
    state.phase = 'open'; state.label = String(entry.label ?? '押せ!'); state.seconds = seconds;
    state.endsAt = Date.now() + seconds * 1000; state.pushes = 0; state.byComments = 0; state.byLikes = 0; state.likes = 0;
    state.recent = []; state.commenters = new Set(); state.result = null; state.config = { ...entry, seconds };
    state.timer = setTimeout(() => this.finish(id), seconds * 1000); state.timer.unref?.();
    this.#broadcast(id, 'start'); return this.#public(state);
  }

  finish(id) {
    this.#assertEnabled();
    const state = this.#require(id);
    if (state.phase === 'result') { this.#broadcast(id, 'result'); return clone(state.result); }
    if (state.phase !== 'open') throw new Error('押しボタンは受付中ではありません');
    this.#clear(state); state.phase = 'result'; state.endsAt = null;
    state.result = this.#makeResult(state);
    if (state.result.tier > 0 && !state.actionDone) {
      state.actionDone = true;
      try { this.onResult?.({ id, actions: clone(state.config[`${state.result.tierName}Actions`] ?? []), result: clone(state.result) }); } catch (error) { this.hub.emit('pushActionError', { id, error }); }
    }
    this.#broadcast(id, 'result'); return clone(state.result);
  }

  reset(id = null) {
    if (id == null) { for (const key of this.states.keys()) this.#resetOne(key); return; }
    if (this.states.has(id) || this.config[id]) this.#resetOne(id);
  }

  snapshot() {
    if (!this.enabled) return {};
    const ids = new Set([...Object.keys(this.config), ...this.states.keys()]); const out = {};
    for (const id of ids) out[id] = this.#public(this.states.get(id) ?? this.#newState(id, this.config[id]));
    return out;
  }

  #assertEnabled() { if (!this.enabled) throw new Error('押しボタンは利用できません'); }
  #state(id, entry) { let state = this.states.get(id); if (!state) { state = this.#newState(id, entry); this.states.set(id, state); } return state; }
  #newState(id, entry = {}) { return { id, phase: 'idle', label: String(entry.label ?? '押せ!'), seconds: Number(entry.seconds) || 5, endsAt: null, pushes: 0, byComments: 0, byLikes: 0, likes: 0, steps: (entry.steps ?? [3, 10, 30, 100]).slice(), result: null, recent: [], commenters: new Set(), timer: null, tallyTimer: null, actionDone: false, config: { ...entry } }; }
  #require(id) { const state = this.states.get(id) ?? (this.config[id] ? this.#state(id, this.config[id]) : null); if (!state) throw new Error(`押しボタン「${id}」がありません`); return state; }
  #onEvent(event) { if (!this.enabled) return; for (const [id, state] of this.states) if (state.phase === 'open') this.#take(id, state, event); }
  #take(id, state, event) {
    if (event.kind === 'chat') {
      const keyword = String(state.config.keyword ?? '押').trim();
      if (String(event.text ?? '').trim() !== keyword) return;
      const key = String(event.user?.id ?? event.user?.name ?? '').trim(); if (!key || state.commenters.has(key)) return;
      state.commenters.add(key); state.byComments += 1; state.pushes += 1;
      const name = String(event.user?.name ?? '').trim(); if (name) state.recent = [name].concat(state.recent).slice(0, RECENT_NAMES);
    } else if (event.kind === 'like') {
      const perPush = Number(state.config.likesPerPush) || 0; if (!perPush) return;
      state.likes += Math.max(0, Number(event.count) || 0);
      state.byLikes = Math.floor(state.likes / perPush);
      state.pushes = state.byComments + state.byLikes;
    } else return;
    this.#schedule(id, state);
  }
  #schedule(id, state) { if (state.tallyTimer) return; state.tallyTimer = setTimeout(() => { state.tallyTimer = null; if (state.phase === 'open') this.#broadcast(id, 'tally'); }, TALLY_DELAY); state.tallyTimer.unref?.(); }
  #makeResult(state) { let tier = 0; state.steps.forEach((step, index) => { if (state.pushes >= step) tier = index + 1; }); const names = ['miss', 'blue', 'green', 'red', 'gold']; return { pushes: state.pushes, byComments: state.byComments, byLikes: state.byLikes, tier, tierName: names[tier] }; }
  #public(state) { return { phase: state.phase, label: state.label, seconds: state.seconds, endsAt: state.endsAt, now: Date.now(), pushes: state.pushes, byComments: state.byComments, byLikes: state.byLikes, steps: state.config.steps?.slice?.() ?? state.steps.slice(), result: state.result ? clone(state.result) : null, recent: state.recent.slice(0, RECENT_NAMES) }; }
  #broadcast(id, event) { const state = this.states.get(id); if (state) this.hub.broadcast({ type: 'push', id, push: this.#public(state), event }); }
  #clear(state) { clearTimeout(state.timer); clearTimeout(state.tallyTimer); state.timer = null; state.tallyTimer = null; }
  #resetOne(id) { const state = this.states.get(id); if (state) this.#clear(state); this.states.delete(id); this.hub.broadcast({ type: 'push', id, push: this.#public(this.#newState(id, this.config[id])), event: 'reset' }); }
}
