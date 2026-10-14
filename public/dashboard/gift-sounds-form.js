// ギフト別サウンドの設定。ルール、音声だけの選択、試聴、音量、最近鳴った音。
import { giftPicker } from './gift-picker.js';
import { BASE } from '/widgets/lib/overlay.js';

const AUTOPLAY_NOTE = 'LIVE Studio のソース設定で音声を有効にしてください';
let previewAudio = null;

function btn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn pressable';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function rowOf(buttons) {
  const row = document.createElement('div');
  row.className = 'btn-row';
  row.append(...buttons);
  return row;
}

function gain(master, rule) {
  const m = Math.max(0, Math.min(100, Number(master) || 0)) / 100;
  const r = Math.max(0, Math.min(100, Number(rule) || 0)) / 100;
  return Math.max(0, Math.min(1, m * r));
}

async function audioItems(api) {
  const data = await api('/api/media-alerts');
  return (data.items || []).filter((item) => item.kind === 'audio');
}

function playLocal(mediaId, master, volume, setMessage) {
  if (!mediaId) {
    setMessage('音声を選んでください', true);
    return;
  }
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }
  const audio = new Audio(`${BASE}/api/media-alerts/${encodeURIComponent(mediaId)}/file`);
  audio.volume = gain(master, volume);
  previewAudio = audio;
  const started = audio.play();
  if (started && started.catch) {
    started.catch(() => setMessage(AUTOPLAY_NOTE, true));
  }
}

/** ルール一覧。返り値はフォームの塊 */
export function giftSoundRulesView({ rules, gifts, dev, api, onChange, setMessage, masterVolume }) {
  const wrap = document.createElement('div');
  wrap.className = 'field items-field wide sound-rules';
  const head = document.createElement('span');
  head.className = 'field-label';
  head.textContent = 'ルール';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = '上から順に見て、最初に合った1つだけ鳴らします。ギフトとコインの両方を書くと、両方そろったときだけです。';
  const list = document.createElement('div');
  list.className = 'items';
  let rows = (Array.isArray(rules) ? rules : []).map((rule) => ({
    mediaId: rule.mediaId ?? '',
    gifts: Array.isArray(rule.gifts) ? [...rule.gifts] : [],
    minCoins: rule.minCoins > 0 ? rule.minCoins : '',
    follow: Array.isArray(rule.events) && rule.events.includes('follow'),
    share: Array.isArray(rule.events) && rule.events.includes('share'),
    volume: rule.volume == null ? 100 : rule.volume,
  }));
  let items = [];

  const commit = (delay = 400) => {
    const next = [];
    for (const rule of rows) {
      const mediaId = String(rule.mediaId || '').trim();
      if (!mediaId) continue;
      const out = { mediaId, volume: Math.max(0, Math.min(100, Number(rule.volume) || 0)) };
      if (rule.gifts.length) out.gifts = [...rule.gifts];
      const n = Number(rule.minCoins);
      if (rule.minCoins !== '' && Number.isFinite(n) && n > 0) out.minCoins = n;
      const events = [];
      if (rule.follow) events.push('follow');
      if (rule.share) events.push('share');
      if (events.length) out.events = events;
      next.push(out);
    }
    onChange(next, delay);
  };

  const fillSelect = (sel, current) => {
    const chosen = current || sel.value || '';
    sel.replaceChildren(new Option('音声を選ぶ', ''));
    for (const item of items) sel.append(new Option(item.name || item.id, item.id));
    if (chosen && !items.some((item) => item.id === chosen)) sel.append(new Option('一覧にない音声', chosen));
    sel.value = chosen;
  };

  const draw = () => {
    list.replaceChildren(...rows.map((rule, index) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      const giftsField = document.createElement('div');
      giftsField.className = 'field';
      giftsField.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: 'ギフト' }));
      giftsField.append(giftPicker({
        value: rule.gifts,
        gifts,
        onChange: (names) => { rule.gifts = names; commit(); },
      }));
      const coins = document.createElement('label');
      coins.className = 'field';
      const coinsInput = document.createElement('input');
      coinsInput.type = 'number';
      coinsInput.min = '0';
      coinsInput.step = '1';
      coinsInput.value = rule.minCoins;
      coinsInput.placeholder = '指定しない';
      coinsInput.setAttribute('aria-label', 'このコイン以上');
      coinsInput.addEventListener('input', () => { rule.minCoins = coinsInput.value; commit(); });
      coins.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: 'このコイン以上' }), coinsInput);
      const events = document.createElement('div');
      events.className = 'checks';
      for (const [key, text] of [['follow', 'フォロー'], ['share', 'シェア']]) {
        const label = document.createElement('label');
        label.className = 'check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = rule[key];
        input.addEventListener('change', () => { rule[key] = input.checked; commit(0); });
        label.append(input, text);
        events.append(label);
      }
      const media = document.createElement('label');
      media.className = 'field';
      const mediaSel = document.createElement('select');
      mediaSel.setAttribute('aria-label', '音源');
      fillSelect(mediaSel, rule.mediaId);
      mediaSel.addEventListener('change', () => { rule.mediaId = mediaSel.value; commit(0); });
      media.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '音源' }), mediaSel);
      const volume = document.createElement('label');
      volume.className = 'field';
      const volumeRow = document.createElement('div');
      volumeRow.className = 'sound-volume';
      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.step = '1';
      range.value = String(rule.volume);
      range.setAttribute('aria-label', 'このルールの音量');
      const num = document.createElement('span');
      num.className = 'sound-volume-value';
      num.textContent = String(rule.volume);
      range.addEventListener('input', () => {
        rule.volume = Number(range.value);
        num.textContent = range.value;
        commit();
      });
      volumeRow.append(range, num);
      volume.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '音量' }), volumeRow);
      const buttons = [
        btn('試聴', () => playLocal(rule.mediaId, masterVolume(), rule.volume, setMessage)),
        btn('削除', () => { rows.splice(index, 1); draw(); commit(0); }),
      ];
      if (dev) {
        buttons.push(btn('鳴らす', async () => {
          if (!rule.mediaId) return setMessage('音声を選んでください', true);
          try {
            await api('/api/dev/trigger', { target: 'gift-sound', mediaId: rule.mediaId, volume: Number(rule.volume), count: 1 });
            setMessage('鳴らしました');
          } catch (err) {
            setMessage(err.message, true);
          }
        }));
      }
      row.append(giftsField, coins, events, media, volume, rowOf(buttons));
      return row;
    }));
  };

  const add = btn('追加', () => {
    rows.push({ mediaId: '', gifts: [], minCoins: '', follow: false, share: false, volume: 100 });
    draw();
  });
  wrap.append(head, hint, list, rowOf([add]));
  draw();
  audioItems(api).then((found) => {
    items = found;
    list.querySelectorAll('select[aria-label="音源"]').forEach((sel, index) => fillSelect(sel, rows[index]?.mediaId));
  }).catch((err) => setMessage(err.message, true));
  return wrap;
}

/** 最近鳴った音と、開発用の4連続。音量の全体はスキーマの欄に出す */
export function giftSoundStatusView({ dev, api, setMessage, rules }) {
  const wrap = document.createElement('div');
  wrap.className = 'field wide sound-rules';
  const head = document.createElement('span');
  head.className = 'field-label';
  head.textContent = '最近鳴った音';
  const state = document.createElement('p');
  state.className = 'desc';
  state.id = 'giftSoundState';
  const recent = document.createElement('div');
  recent.className = 'items';
  const note = document.createElement('p');
  note.className = 'hint';
  note.id = 'giftSoundAutoplay';
  wrap.append(head, state, recent, note);

  const paint = (data) => {
    if (!wrap.isConnected) return;
    const playing = data?.playing?.length ?? 0;
    const waiting = data?.queue?.length ?? 0;
    state.textContent = `再生中 ${playing}・待ち ${waiting}`;
    const rows = data?.recent ?? [];
    recent.replaceChildren();
    if (!rows.length) {
      recent.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'まだ鳴っていません' }));
    } else {
      for (const item of rows) {
        const line = document.createElement('p');
        line.className = 'desc';
        const when = item.at ? new Date(item.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        line.textContent = `${item.label || item.name || '音声'}${when ? ` ・ ${when}` : ''}`;
        recent.append(line);
      }
    }
    note.textContent = data?.autoplay?.note || '';
  };

  const load = () => api('/api/gift-sounds').then(paint).catch(() => {});
  load();
  const timer = setInterval(load, 2000);
  const stop = new MutationObserver(() => {
    if (!wrap.isConnected) {
      clearInterval(timer);
      stop.disconnect();
    }
  });
  stop.observe(document.body, { childList: true, subtree: true });

  if (dev) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'テスト送信です。同じ音を4回鳴らして、同時に3つまでの上限を確認します。';
    const burst = btn('4連続', async () => {
      const rule = (rules() || []).find((item) => item.mediaId);
      let mediaId = rule?.mediaId;
      if (!mediaId) {
        try {
          const items = await audioItems(api);
          mediaId = items[0]?.id;
        } catch (err) {
          return setMessage(err.message, true);
        }
      }
      if (!mediaId) return setMessage('音声を選んでください', true);
      try {
        const data = await api('/api/dev/trigger', { target: 'gift-sound', mediaId, volume: rule?.volume ?? 100, count: 4 });
        paint(data.giftSounds);
        setMessage('4回送りました');
      } catch (err) {
        setMessage(err.message, true);
      }
    });
    burst.id = 'giftSoundBurst';
    wrap.append(hint, rowOf([burst]));
  }
  return wrap;
}

export function masterVolumeField(value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field wide';
  const row = document.createElement('div');
  row.className = 'sound-volume';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(value ?? 80);
  range.setAttribute('aria-label', '全体の音量');
  const num = document.createElement('span');
  num.className = 'sound-volume-value';
  num.textContent = String(range.value);
  range.addEventListener('input', () => {
    num.textContent = range.value;
    onChange(Number(range.value));
  });
  row.append(range, num);
  wrap.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '全体の音量' }), row);
  return wrap;
}
