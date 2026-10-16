// ガチャの視聴者一覧。回数の足し戻しと、開発中だけの試し回し。

function button(text, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn pressable';
  el.textContent = text;
  el.addEventListener('click', onClick);
  return el;
}

function actionRow(labels, onClick) {
  const row = document.createElement('div');
  row.className = 'gacha-actions';
  for (const [text, type, amount] of labels) row.append(button(text, () => onClick(type, amount)));
  return row;
}

/** 視聴者ごとの残回数。dev のときだけ架空の視聴者で無料と有料を試せる */
export function gachaViewersView({ api, setMessage, dev }) {
  const wrap = document.createElement('section');
  wrap.className = 'gacha-viewers';
  wrap.setAttribute('aria-label', '視聴者の回数');

  const head = document.createElement('div');
  head.className = 'gacha-viewers-head';
  const title = document.createElement('h3');
  title.textContent = '視聴者';
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = '景品は演出と特典だけで、換金はできません。';
  head.append(title, note);

  const tools = document.createElement('div');
  tools.className = 'gacha-viewers-tools';
  const reset = button('全員の無料回をリセット', async () => {
    if (!window.confirm('全員の無料回数を残りの回数に戻します。有料回数はそのままです。')) return;
    reset.disabled = true;
    try {
      const data = await api('/api/gacha-viewers/reset-free', {});
      paint(data);
      setMessage('無料回数をリセットしました');
    } catch (err) {
      setMessage(err.message, true);
    } finally {
      reset.disabled = false;
    }
  });
  reset.classList.add('gacha-reset');
  tools.append(reset);

  if (dev) {
    const devNote = document.createElement('p');
    devNote.className = 'hint';
    devNote.textContent = '開発中だけ使えます。架空の視聴者で、無料と有料を別々に回せます。';
    const devRow = document.createElement('div');
    devRow.className = 'gacha-actions';
    const spinDev = async (paid) => {
      try {
        const data = await api('/api/dev/trigger', { target: 'gacha-viewer', name: 'テスト視聴者', paid });
        paint({ viewers: data.viewers, total: data.viewers?.length });
        setMessage(paid ? '有料で回しました' : '無料で回しました');
      } catch (err) {
        setMessage(err.message, true);
      }
    };
    devRow.append(button('無料で回す', () => spinDev(false)), button('有料で回す', () => spinDev(true)));
    tools.append(devNote, devRow);
  }

  const list = document.createElement('div');
  list.className = 'gacha-viewer-list';
  list.setAttribute('role', 'list');
  const status = document.createElement('p');
  status.className = 'hint gacha-viewers-status';
  wrap.append(head, tools, list, status);

  const adjust = async (userId, type, amount) => {
    try {
      await api(`/api/gacha-viewers/${encodeURIComponent(userId)}/adjust`, { type, amount });
      await load();
      setMessage('回数を変えました');
    } catch (err) {
      setMessage(err.message, true);
    }
  };

  const paint = (data) => {
    if (!wrap.isConnected) return;
    const viewers = Array.isArray(data?.viewers) ? data.viewers : [];
    const total = Number(data?.total);
    status.textContent = total > viewers.length ? `最近動いた ${viewers.length} 人を表示しています（全部で ${total} 人）` : '';
    list.replaceChildren();
    if (!viewers.length) {
      const empty = document.createElement('p');
      empty.className = 'hint gacha-viewer-empty';
      empty.textContent = 'まだ視聴者はいません';
      list.append(empty);
      return;
    }
    for (const viewer of viewers) {
      const row = document.createElement('article');
      row.className = 'gacha-viewer';
      row.setAttribute('role', 'listitem');
      const name = document.createElement('p');
      name.className = 'gacha-viewer-name';
      name.textContent = viewer.name || '名無し';
      const meta = document.createElement('p');
      meta.className = 'gacha-viewer-meta';
      const recent = viewer.history?.[0]?.label;
      meta.textContent = `無料 残${viewer.free?.remaining ?? 0} ・ 有料 残${viewer.paid?.credits ?? 0} ・ 最近 ${recent || 'まだありません'}`;
      row.append(name, meta, actionRow([
        ['無料を足す', 'free', 1],
        ['無料を戻す', 'free', -1],
        ['有料を足す', 'paid', 1],
        ['有料を戻す', 'paid', -1],
      ], (type, amount) => adjust(viewer.userId, type, amount)));
      list.append(row);
    }
  };

  const load = () => api('/api/gacha-viewers').then(paint).catch((err) => {
    if (wrap.isConnected) status.textContent = err.message || '読み込めませんでした';
  });
  load();
  const timer = setInterval(load, 2000);
  const stop = new MutationObserver(() => {
    if (!wrap.isConnected) {
      clearInterval(timer);
      stop.disconnect();
    }
  });
  stop.observe(document.body, { childList: true, subtree: true });
  return wrap;
}
