// コメントの番号をサーバー側で集計する投票エンジン。
// 投票者の ID は重複判定だけに使い、公開状態やファイルには出さない。

const OPTION_MIN = 2;
const OPTION_MAX = 9;
const RECENT_NAMES = 5;
const TALLY_DELAY = 250;

const clone = (value) => structuredClone(value);
const optionError = () => `選択肢は ${OPTION_MIN} 個以上 ${OPTION_MAX} 個以下にしてください`;

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length < OPTION_MIN || options.length > OPTION_MAX) throw new Error(optionError());
  const out = options.map((option) => String(option).trim());
  if (out.some((option) => !option)) throw new Error('選択肢の名前を入れてください');
  return out;
}

function publicResult(result) {
  return result ? clone(result) : null;
}

export class VoteEngine {
  constructor(hub, { onResult = null } = {}) {
    this.hub = hub;
    this.onResult = onResult;
    this.config = {};
    this.states = new Map();
    this.enabled = true;
    hub.on('event', (event) => this.#onEvent(event));
    hub.on('reset', () => this.reset());
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled) {
      for (const id of this.states.keys()) this.#resetOne(id, false);
      this.states.clear();
    }
  }

  setConfig(config) {
    const next = config && typeof config === 'object' ? config : {};
    for (const [id, state] of this.states) {
      if (next[id]) continue;
      if (state.phase === 'open') {
        this.#clearTimer(state);
        state.phase = 'closed';
        state.endsAt = null;
        this.#broadcast(id, 'close');
      }
    }
    this.config = next;
    for (const [id, entry] of Object.entries(next)) {
      const state = this.states.get(id);
      if (!state) continue;
      if (state.phase === 'idle') this.#applyEntry(state, entry);
    }
  }

  ids() {
    return Object.keys(this.config);
  }

  start(id, overrides = {}) {
    this.#assertEnabled();
    const entry = this.config[id];
    if (!entry) throw new Error(`投票「${id}」がありません`);
    const state = this.#state(id, entry);
    if (state.phase === 'open') throw new Error('もう始まっています');
    const options = normalizeOptions(overrides.options ?? entry.options);
    const seconds = overrides.seconds == null ? Number(entry.durationSeconds) || 0 : Number(overrides.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('投票の秒数は 0 以上にしてください');
    this.#clearTimer(state);
    state.title = String(entry.title ?? 'どれにする?');
    state.options = options;
    state.counts = options.map(() => 0);
    state.total = 0;
    state.phase = 'open';
    state.endsAt = seconds > 0 ? Date.now() + seconds * 1000 : null;
    state.result = null;
    state.voters = new Set();
    state.recent = [];
    state.resultActionsDone = false;
    state.config = { ...entry, options: options.slice(), durationSeconds: seconds };
    if (state.endsAt) {
      state.timer = setTimeout(() => this.#expire(id), Math.max(0, seconds * 1000));
      state.timer.unref?.();
    }
    this.#broadcast(id, 'start');
    return this.#publicState(state);
  }

  close(id) {
    this.#assertEnabled();
    const state = this.#requireState(id);
    if (state.phase !== 'open') throw new Error('投票は受付中ではありません');
    this.#clearTimer(state);
    state.phase = 'closed';
    state.endsAt = null;
    this.#broadcast(id, 'close');
    return this.#publicState(state);
  }

  result(id) {
    this.#assertEnabled();
    const state = this.#requireState(id);
    if (state.phase === 'idle') throw new Error('投票は受付中ではありません');
    if (state.phase === 'open') this.close(id);
    if (state.phase === 'result') {
      this.#broadcast(id, 'result');
      return publicResult(state.result);
    }
    state.result = this.#makeResult(state);
    state.phase = 'result';
    if (!state.resultActionsDone) {
      state.resultActionsDone = true;
      try {
        this.onResult?.({ id, result: publicResult(state.result), actions: clone(state.config.resultActions ?? []) });
      } catch (error) {
        // 動作の失敗で投票結果まで失わない。
        this.hub.emit('voteActionError', { id, error });
      }
    }
    this.#broadcast(id, 'result');
    return publicResult(state.result);
  }

  reset(id = null) {
    if (id == null) {
      for (const key of this.states.keys()) this.#resetOne(key, true);
      return;
    }
    if (!this.states.has(id) && !this.config[id]) return;
    this.#resetOne(id, true);
  }

  snapshot() {
    if (!this.enabled) return {};
    const ids = new Set([...Object.keys(this.config), ...this.states.keys()]);
    const out = {};
    for (const id of ids) {
      const state = this.states.get(id);
      if (state) out[id] = this.#publicState(state);
      else out[id] = this.#publicState(this.#newState(id, this.config[id]));
    }
    return out;
  }

  #assertEnabled() {
    if (!this.enabled) throw new Error('投票は利用できません');
  }

  #state(id, entry) {
    let state = this.states.get(id);
    if (!state) {
      state = this.#newState(id, entry);
      this.states.set(id, state);
    }
    return state;
  }

  #newState(id, entry = {}) {
    const options = Array.isArray(entry.options) ? entry.options.map((option) => String(option)) : [];
    return {
      id,
      phase: 'idle',
      title: String(entry.title ?? 'どれにする?'),
      options,
      counts: options.map(() => 0),
      total: 0,
      endsAt: null,
      result: null,
      recent: [],
      voters: new Set(),
      timer: null,
      tallyTimer: null,
      config: { ...entry },
      resultActionsDone: false,
    };
  }

  #applyEntry(state, entry) {
    state.title = String(entry.title ?? state.title);
    state.options = Array.isArray(entry.options) ? entry.options.map((option) => String(option)) : state.options;
    state.counts = state.options.map(() => 0);
  }

  #requireState(id) {
    const state = this.states.get(id) ?? (this.config[id] ? this.#state(id, this.config[id]) : null);
    if (!state) throw new Error(`投票「${id}」がありません`);
    return state;
  }

  #onEvent(event) {
    if (!event || event.kind !== 'chat' || !this.enabled) return;
    for (const [id, state] of this.states) {
      if (state.phase !== 'open') continue;
      this.#takeVote(id, state, event);
    }
  }

  #takeVote(id, state, event) {
    const text = String(event.text ?? '').trim().replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - '０'.charCodeAt(0)));
    if (!/^[1-9]$/.test(text)) return;
    const option = Number(text);
    if (option > state.options.length) return;
    const key = String(event.user?.id ?? event.user?.name ?? '').trim();
    if (!key || state.voters.has(key)) return;
    state.voters.add(key);
    state.counts[option - 1] += 1;
    state.total += 1;
    const name = String(event.user?.name ?? '').trim();
    if (name) {
      state.recent.unshift(name);
      state.recent = state.recent.slice(0, RECENT_NAMES);
    }
    this.#scheduleTally(id, state);
  }

  #scheduleTally(id, state) {
    if (state.tallyTimer) return;
    state.tallyTimer = setTimeout(() => {
      state.tallyTimer = null;
      if (state.phase === 'open') this.#broadcast(id, 'tally');
    }, TALLY_DELAY);
    state.tallyTimer.unref?.();
  }

  #expire(id) {
    const state = this.states.get(id);
    if (!state || state.phase !== 'open') return;
    state.timer = null;
    this.close(id);
    if (state.config.autoReveal !== false) this.result(id);
  }

  #makeResult(state) {
    const max = Math.max(...state.counts, 0);
    const winners = max === 0 ? [] : state.counts.map((count, index) => (count === max ? index + 1 : null)).filter(Boolean);
    return {
      counts: state.counts.slice(),
      total: state.total,
      winners,
      tie: winners.length > 1,
      percent: state.total ? state.counts.map((count) => Number((count / state.total * 100).toFixed(1))) : state.counts.map(() => 0),
    };
  }

  #publicState(state) {
    return {
      phase: state.phase,
      title: state.title,
      options: state.options.slice(),
      counts: state.counts.slice(),
      total: state.total,
      endsAt: state.endsAt,
      now: Date.now(),
      result: publicResult(state.result),
      recent: state.recent.slice(0, RECENT_NAMES),
    };
  }

  #broadcast(id, event) {
    const state = this.states.get(id);
    if (!state) return;
    this.hub.broadcast({ type: 'vote', id, vote: this.#publicState(state), event });
  }

  #clearTimer(state) {
    clearTimeout(state.timer);
    clearTimeout(state.tallyTimer);
    state.timer = null;
    state.tallyTimer = null;
  }

  #resetOne(id, notify) {
    const state = this.states.get(id);
    if (!state) return;
    this.#clearTimer(state);
    state.phase = 'idle';
    state.counts = state.options.map(() => 0);
    state.total = 0;
    state.endsAt = null;
    state.result = null;
    state.recent = [];
    state.voters = new Set();
    state.resultActionsDone = false;
    if (notify) this.#broadcast(id, 'reset');
  }
}

