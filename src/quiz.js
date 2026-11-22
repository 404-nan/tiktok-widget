// コメントで答えるクイズのエンジン。出題・制限時間・正解判定をサーバー側で持つ。
// 答えの文は受付中は公開状態に出さない。最初の正解者へのポイント支払いは、
// 呼び出し側（runtime）が onWin で行う（テスト送信のときは払わない）。

const MAX_SECONDS = 3600;
const CHOICE_MIN = 2;
const CHOICE_MAX = 4;

/** 答え合わせ用の形にそろえる（前後の空白・全角英数・大文字小文字をそろえる） */
export function normalizeAnswer(text) {
  return String(text ?? '')
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeChoices(choices) {
  if (choices == null || choices === '') return [];
  const list = (Array.isArray(choices) ? choices : String(choices).split(/[,、]/)).map((c) => String(c).trim()).filter(Boolean);
  if (list.length === 1 || list.length > CHOICE_MAX) throw new Error(`選択肢は ${CHOICE_MIN} 個以上 ${CHOICE_MAX} 個以下にしてください`);
  return list;
}

function checkQuestion(question, answer, choices) {
  const q = String(question ?? '').trim();
  const a = String(answer ?? '').trim();
  if (!q) throw new Error('問題文を入れてください');
  if (!a) throw new Error('答えを入れてください');
  const list = normalizeChoices(choices);
  if (list.length && !list.some((c) => normalizeAnswer(c) === normalizeAnswer(a))) {
    throw new Error('答えは選択肢のどれかと同じ文にしてください');
  }
  return { question: q, answer: a, choices: list };
}

/** 問題集の1件「問題文|答え」か「問題文|答え|選択肢1|選択肢2|…」を読む */
export function parseQuestionLine(line) {
  const parts = String(line ?? '').split('|').map((s) => s.trim());
  return checkQuestion(parts[0], parts[1], parts.slice(2).filter(Boolean));
}

export class QuizEngine {
  constructor(hub, { onWin = null } = {}) {
    this.hub = hub;
    this.onWin = onWin;
    this.config = {};
    this.states = new Map();
    this.enabled = true;
    hub.on('event', (event) => this.#onEvent(event));
    hub.on('reset', () => this.reset());
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled) {
      for (const id of this.states.keys()) this.#resetOne(id, true);
      this.states.clear();
    }
  }

  setConfig(config) {
    const next = config && typeof config === 'object' ? config : {};
    for (const [id, state] of this.states) {
      if (next[id]) continue;
      // 設定が消えたクイズは、その場で結果にして止める（投票の締め方にそろえる）
      if (state.phase === 'open') this.#toResult(id, state, 'closed');
    }
    this.config = next;
  }

  ids() {
    return Object.keys(this.config);
  }

  /** 出題する。overrides の question / answer / choices / seconds があれば今回だけ使う */
  start(id, overrides = {}) {
    this.#assertEnabled();
    const entry = this.config[id];
    if (!entry) throw new Error(`クイズ「${id}」がありません`);
    const state = this.#state(id, entry);
    if (state.phase === 'open') throw new Error('もう出題中です');
    const picked = this.#pickQuestion(state, entry, overrides);
    const requestedSeconds = overrides.seconds == null ? Number(entry.seconds) || 0 : Number(overrides.seconds);
    const seconds = Math.min(MAX_SECONDS, requestedSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('制限時間は 0 以上にしてください');
    this.#clearTimer(state);
    state.title = String(entry.title ?? 'クイズ');
    state.question = picked.question;
    state.answer = picked.answer;
    state.choices = picked.choices;
    state.phase = 'open';
    state.endsAt = seconds > 0 ? Date.now() + seconds * 1000 : null;
    state.winner = null;
    state.reason = null;
    state.winPaid = false;
    state.config = { ...entry, seconds };
    if (state.endsAt) {
      state.timer = setTimeout(() => this.#expire(id), Math.max(0, seconds * 1000));
      state.timer.unref?.();
    }
    this.#broadcast(id, 'start');
    return this.#publicState(state);
  }

  /** 手動で締めて答えを出す（正解者はいないまま結果にする） */
  finish(id) {
    this.#assertEnabled();
    const state = this.#requireState(id);
    if (state.phase !== 'open') throw new Error('クイズは出題中ではありません');
    this.#toResult(id, state, 'finish');
    return this.#publicState(state);
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

  #pickQuestion(state, entry, overrides) {
    if (overrides.question != null && String(overrides.question).trim() !== '') {
      return checkQuestion(overrides.question, overrides.answer, overrides.choices);
    }
    const source = overrides.source ?? entry.source ?? 'single';
    if (source === 'set') {
      const lines = (Array.isArray(entry.questions) ? entry.questions : []).map((line) => String(line).trim()).filter(Boolean);
      if (!lines.length) throw new Error('問題集が空です。問題集に問題を入れてください');
      const picked = parseQuestionLine(lines[state.nextIndex % lines.length]);
      state.nextIndex = (state.nextIndex + 1) % lines.length;
      return picked;
    }
    return checkQuestion(entry.question, entry.answer, entry.choices);
  }

  #assertEnabled() {
    if (!this.enabled) throw new Error('クイズは利用できません');
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
    return {
      id,
      phase: 'idle',
      title: String(entry.title ?? 'クイズ'),
      question: '',
      answer: '',
      choices: [],
      endsAt: null,
      winner: null,
      reason: null,
      nextIndex: 0,
      timer: null,
      winPaid: false,
      config: { ...entry },
    };
  }

  #requireState(id) {
    const state = this.states.get(id) ?? (this.config[id] ? this.#state(id, this.config[id]) : null);
    if (!state) throw new Error(`クイズ「${id}」がありません`);
    return state;
  }

  #onEvent(event) {
    if (!event || event.kind !== 'chat' || !this.enabled) return;
    for (const [id, state] of this.states) {
      if (state.phase !== 'open') continue;
      if (this.#isCorrect(state, event.text)) this.#win(id, state, event);
    }
  }

  #isCorrect(state, text) {
    const said = normalizeAnswer(text);
    if (!said) return false;
    if (said === normalizeAnswer(state.answer)) return true;
    // 選択肢があるときは、正解の選択肢の番号でも答えられる
    if (state.choices.length && /^[1-9]$/.test(said)) {
      const picked = state.choices[Number(said) - 1];
      return picked != null && normalizeAnswer(picked) === normalizeAnswer(state.answer);
    }
    return false;
  }

  #win(id, state, event) {
    const name = String(event.user?.name ?? '').trim();
    state.winner = { name };
    this.#toResult(id, state, 'win');
    if (!state.winPaid) {
      state.winPaid = true;
      try {
        this.onWin?.({
          id,
          user: event.user ?? {},
          points: Math.max(0, Math.floor(Number(state.config.rewardPoints) || 0)),
          test: event.test === true,
          quiz: this.#publicState(state),
        });
      } catch (error) {
        // 支払いの失敗で結果表示まで失わない。
        this.hub.emit('quizWinError', { id, error });
      }
    }
  }

  #expire(id) {
    const state = this.states.get(id);
    if (!state || state.phase !== 'open') return;
    state.timer = null;
    this.#toResult(id, state, 'timeout');
  }

  #toResult(id, state, reason) {
    this.#clearTimer(state);
    state.phase = 'result';
    state.endsAt = null;
    state.reason = reason;
    this.#broadcast(id, reason === 'win' ? 'win' : reason);
  }

  #publicState(state) {
    return {
      phase: state.phase,
      title: state.title,
      question: state.question,
      choices: state.choices.slice(),
      endsAt: state.endsAt,
      now: Date.now(),
      winner: state.winner ? { ...state.winner } : null,
      reason: state.reason,
      // 答えは結果のときだけ出す（受付中に見えると答えが分かってしまう）
      answer: state.phase === 'result' ? state.answer : null,
      rewardPoints: Math.max(0, Math.floor(Number(state.config.rewardPoints) || 0)),
    };
  }

  #broadcast(id, event) {
    const state = this.states.get(id);
    if (!state) return;
    this.hub.broadcast({ type: 'quiz', id, quiz: this.#publicState(state), event });
  }

  #clearTimer(state) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  #resetOne(id, notify) {
    const state = this.states.get(id);
    if (!state) return;
    this.#clearTimer(state);
    state.phase = 'idle';
    state.question = '';
    state.answer = '';
    state.choices = [];
    state.endsAt = null;
    state.winner = null;
    state.reason = null;
    state.winPaid = false;
    // 問題集の進み具合（nextIndex）は残す。リセットしても次の問題から続ける
    if (notify) this.#broadcast(id, 'reset');
  }
}
