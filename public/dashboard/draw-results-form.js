// 抽選の結果（誰が・何に当たったか）の一覧。おみくじ・ガチャ・カードめくりの画面に出す。
// 名前や結果は外から来るので、文字は必ず textContent で入れる。

function button(text, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn pressable';
  el.textContent = text;
  el.addEventListener('click', onClick);
  return el;
}

function timeText(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function drawResultsView({ api, kind }) {
  const wrap = document.createElement('section');
  wrap.className = 'draw-results';
  wrap.setAttribute('aria-label', '最近の結果');

  const head = document.createElement('div');
  head.className = 'draw-results-head';
  const title = document.createElement('h3');
  title.textContent = '最近の結果';
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = '当たった人の名前と内容を、新しい順に最大50件まで出します。';
  head.append(title, note);

  const tools = document.createElement('div');
  tools.className = 'draw-results-tools';

  const list = document.createElement('div');
  list.className = 'draw-results-list';

  const status = document.createElement('p');
  status.className = 'draw-results-status';
  status.setAttribute('role', 'status');

  const reload = button('読み直す', () => load());
  tools.append(reload);

  wrap.append(head, tools, list, status);

  // 連打しても、古い応答が新しい一覧を上書きしないようにする
  let request = 0;

  async function load() {
    const current = ++request;
    status.textContent = '読み込んでいます…';
    try {
      const data = await api('/api/draw-results?kind=' + encodeURIComponent(kind));
      if (current !== request) return;
      paint(Array.isArray(data?.results) ? data.results : []);
    } catch (err) {
      if (current !== request) return;
      list.replaceChildren();
      status.textContent = err?.message ?? '読み込めませんでした。';
    }
  }

  function paint(results) {
    list.replaceChildren();
    status.textContent = '';
    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'draw-results-empty';
      empty.textContent = 'まだ結果がありません';
      list.append(empty);
      return;
    }
    for (const item of results.slice(0, 50)) list.append(rowFor(item));
  }

  function rowFor(item) {
    const row = document.createElement('div');
    row.className = 'draw-results-row';

    const time = document.createElement('span');
    time.className = 'draw-results-time';
    time.textContent = timeText(item.ts);

    const user = document.createElement('span');
    user.className = 'draw-results-user';
    user.textContent = item.user ?? '—';

    const result = document.createElement('span');
    result.className = 'draw-results-result';
    if (item.win === true) result.classList.add('is-win');
    result.textContent = item.result ?? '';

    row.append(time, user, result);

    if (item.forced === true) {
      const tag = document.createElement('span');
      tag.className = 'draw-results-tag';
      tag.textContent = '天井';
      row.append(tag);
    }
    if (item.gift) {
      const gift = document.createElement('span');
      gift.className = 'draw-results-gift';
      gift.textContent = `ギフト: ${item.gift}`;
      row.append(gift);
    }
    return row;
  }

  load();
  return wrap;
}
