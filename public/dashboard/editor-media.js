// editor.js のメディア通知のきっかけ・ガチャの段階・メディアライブラリ。
import { giftPicker } from './gift-picker.js';

export function buildMedia(ctx) {

  function mediaRulesEditor(value) {
    const wrap = document.createElement('div');
    wrap.className = 'field items-field';
    const head = document.createElement('span');
    head.className = 'field-label';
    head.textContent = '再生のきっかけ';
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'ギフトとコインの両方を書くと、両方そろったときだけ再生します。フォローにチェックすると、フォローでも再生します。';
    const list = document.createElement('div');
    list.className = 'items';
    let rows = (Array.isArray(value) ? value : []).map((r) => ({
      mediaId: r.mediaId ?? '',
      gifts: Array.isArray(r.gifts) ? r.gifts.join(', ') : '',
      minCoins: r.minCoins > 0 ? r.minCoins : '',
      follow: Array.isArray(r.events) && r.events.includes('follow'),
    }));

    const commit = (delay = 400) => {
      const rules = [];
      for (const r of rows) {
        const mediaId = String(r.mediaId || '').trim();
        if (!mediaId) continue;
        const out = { mediaId };
        const gifts = String(r.gifts || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (gifts.length) out.gifts = gifts;
        const n = Number(r.minCoins);
        if (r.minCoins !== '' && Number.isFinite(n) && n > 0) out.minCoins = n;
        if (r.follow) out.events = ['follow'];
        rules.push(out);
      }
      ctx.save('rules', rules, delay);
    };

    const draw = () => {
      list.replaceChildren(...rows.map((r, i) => {
        const row = document.createElement('div');
        row.className = 'item-row';
        const media = document.createElement('label');
        media.className = 'field';
        const mediaSel = document.createElement('select');
        mediaSel.setAttribute('aria-label', '再生するメディア');
        ctx.fillSelect(mediaSel, r.mediaId, { empty: 'メディアを選ぶ', missing: '一覧にない' });
        mediaSel.addEventListener('change', () => { r.mediaId = mediaSel.value; commit(0); });
        media.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: 'メディア' }), mediaSel);
        const gifts = document.createElement('label');
        gifts.className = 'field';
        const giftsInput = document.createElement('input');
        giftsInput.value = r.gifts;
        giftsInput.placeholder = '例: バラ, 5655';
        giftsInput.setAttribute('aria-label', 'ギフト');
        giftsInput.addEventListener('input', () => { r.gifts = giftsInput.value; commit(); });
        gifts.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: 'ギフト（カンマ区切り。空なら指定しない）' }), giftsInput);
        const coins = document.createElement('label');
        coins.className = 'field';
        const coinsInput = document.createElement('input');
        coinsInput.type = 'number';
        coinsInput.min = '0';
        coinsInput.step = '1';
        coinsInput.value = r.minCoins;
        coinsInput.placeholder = '指定しない';
        coinsInput.setAttribute('aria-label', 'このコイン以上');
        coinsInput.addEventListener('input', () => { r.minCoins = coinsInput.value; commit(); });
        coins.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: 'このコイン以上' }), coinsInput);
        const follow = document.createElement('label');
        follow.className = 'check';
        const followInput = document.createElement('input');
        followInput.type = 'checkbox';
        followInput.checked = r.follow;
        followInput.addEventListener('change', () => { r.follow = followInput.checked; commit(0); });
        follow.append(followInput, 'フォローでも再生');
        const buttons = document.createElement('div');
        buttons.className = 'btn-row';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn pressable';
        del.textContent = '削除';
        del.addEventListener('click', () => { rows.splice(i, 1); draw(); commit(0); });
        buttons.append(del);
        row.append(media, gifts, coins, follow, buttons);
        return row;
      }));
      ctx.addMediaRefresher(() => list.querySelectorAll('select').forEach((sel, i) => ctx.fillSelect(sel, rows[i]?.mediaId, { empty: 'メディアを選ぶ', missing: '一覧にない' })));
    };

    const addRow = document.createElement('div');
    addRow.className = 'btn-row';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn pressable';
    add.textContent = 'きっかけ追加';
    add.addEventListener('click', () => { rows.push({ mediaId: '', gifts: '', minCoins: '', follow: false }); draw(); });
    addRow.append(add);
    draw();
    wrap.append(head, hint, list, addRow);
    return wrap;
  }

  function gachaPaidRuleEditor(key, value) {
    const current = {
      gifts: Array.isArray(value?.gifts) ? [...value.gifts] : [],
      minCoins: value?.minCoins ?? 100,
      spinsPerCoins: value?.spinsPerCoins ?? 100,
    };
    const wrap = document.createElement('div');
    wrap.className = 'field items-field wide gacha-paid';
    const head = document.createElement('span');
    head.className = 'field-label';
    head.textContent = ctx.labelText(key);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '対象のギフトか、最低コイン以上のギフトで回数がたまります。このコインごとに1回で、端数は次に繰り越しません。';
    const commit = (delay = 400) => ctx.save(key, {
      gifts: current.gifts,
      minCoins: Math.max(0, Number(current.minCoins) || 0),
      spinsPerCoins: Math.max(1, Number(current.spinsPerCoins) || 100),
    }, delay);
    const giftControl = giftPicker({ value: current.gifts, gifts: ctx.getGifts(), onChange: (names) => { current.gifts = names; commit(0); } });
    const grid = document.createElement('div');
    grid.className = 'gacha-paid-grid';
    const coinField = document.createElement('label');
    coinField.className = 'field';
    const coins = document.createElement('input');
    coins.type = 'number';
    coins.min = '0';
    coins.step = '1';
    coins.value = current.minCoins;
    coins.setAttribute('aria-label', '最低コイン');
    coins.addEventListener('input', () => {
      const n = Number(coins.value);
      if (coins.value !== '' && Number.isFinite(n)) current.minCoins = n;
      commit();
    });
    coinField.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '最低コイン' }), coins);
    const perField = document.createElement('label');
    perField.className = 'field';
    const per = document.createElement('input');
    per.type = 'number';
    per.min = '1';
    per.step = '1';
    per.value = current.spinsPerCoins;
    per.setAttribute('aria-label', '何コインで1回');
    per.addEventListener('input', () => {
      const n = Number(per.value);
      if (per.value !== '' && Number.isFinite(n)) current.spinsPerCoins = n;
      commit();
    });
    perField.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '何コインで1回' }), per);
    grid.append(coinField, perField);
    wrap.append(head, hint, giftControl, grid);
    return wrap;
  }

  const TIER_ACTIONS = [
    ['timer.add', 'タイマーを足す・減らす'],
    ['wins.add', 'WIN数を足す・減らす'],
    ['rush.start', 'RUSHを始める'],
    ['media.play', 'メディアを再生'],
    ['sound.play', '効果音を鳴らす'],
    ['boss.damage', 'ボスにダメージ'],
    ['boss.heal', 'ボスを回復'],
    ['gacha.start', 'ガチャを回す'],
  ];
  const tierActionReady = (a) => {
    if (!a?.type) return false;
    if (a.id != null && a.id !== '' && !/^[A-Za-z0-9_-]+$/.test(String(a.id))) return false;
    if (a.type === 'timer.add') return Number.isFinite(Number(a.seconds)) && Number(a.seconds) !== 0;
    if (a.type === 'wins.add') return Number.isInteger(Number(a.n)) && Number(a.n) !== 0;
    if (a.type === 'media.play') return String(a.mediaId || '').trim() !== '';
    if (a.type === 'sound.play') {
      if (!String(a.mediaId || '').trim()) return false;
      if (a.volume != null && a.volume !== '' && !(Number(a.volume) >= 0 && Number(a.volume) <= 100)) return false;
      return true;
    }
    if (a.type === 'boss.damage' || a.type === 'boss.heal') return Number(a.amount) > 0;
    return a.type === 'rush.start' || a.type === 'gacha.start';
  };
  const tierActionClean = (a) => {
    const out = { type: a.type };
    if (a.id) out.id = String(a.id);
    if (a.type === 'timer.add') out.seconds = Number(a.seconds);
    else if (a.type === 'wins.add') out.n = Number(a.n);
    else if (a.type === 'media.play') out.mediaId = String(a.mediaId).trim();
    else if (a.type === 'sound.play') {
      out.mediaId = String(a.mediaId).trim();
      if (a.volume != null && a.volume !== '') out.volume = Number(a.volume);
    } else if (a.type === 'boss.damage' || a.type === 'boss.heal') out.amount = Number(a.amount);
    return out;
  };
  const tierActionPlaceholder = (type) => {
    if (type === 'timer.add') return '秒（マイナスで減らす）';
    if (type === 'wins.add') return '数（マイナスで減らす）';
    if (type === 'media.play') return 'メディアID';
    if (type === 'sound.play') return '音声のID';
    if (type === 'boss.damage' || type === 'boss.heal') return '量';
    return '';
  };

  function gachaTiersEditor(value) {
    const wrap = document.createElement('div');
    wrap.className = 'field items-field';
    const head = document.createElement('span');
    head.className = 'field-label';
    head.textContent = 'レアリティと当たりやすさ';
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '割合は、当たりやすさの合計に対する割合です。天井の対象は1つだけです。当たったときの動作は、カットイン用の再生など既存の動作を紐付けます。';
    const list = document.createElement('div');
    list.className = 'items';
    let rows = (Array.isArray(value) && value.length ? value : [{ id: 'common', label: 'ふつう', weight: 1, pity: false }]).map((t) => ({
      id: t.id ?? '',
      label: t.label ?? '',
      weight: t.weight ?? 1,
      pity: t.pity === true,
      actions: Array.isArray(t.actions) ? t.actions.map((a) => ({ ...a })) : [],
    }));

    const pct = (part, total) => {
      if (!(total > 0)) return '0%';
      const n = Math.round((part / total) * 1000) / 10;
      return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
    };
    const commit = (delay = 400) => {
      let pityUsed = false;
      const tiers = rows.map((t, i) => {
        const id = String(t.id || `tier${i + 1}`).trim();
        const pity = t.pity === true && !pityUsed;
        if (pity) pityUsed = true;
        const weight = Number(t.weight);
        const actions = (t.actions || []).filter(tierActionReady).map(tierActionClean);
        const tier = { id, label: String(t.label || id).trim() || id, weight: Number.isFinite(weight) && weight >= 0 ? weight : 1, pity };
        if (actions.length) tier.actions = actions;
        return tier;
      });
      ctx.save('tiers', tiers, delay);
    };
    const updateOdds = () => {
      const total = rows.reduce((sum, t) => sum + (Number(t.weight) > 0 ? Number(t.weight) : 0), 0);
      list.querySelectorAll('[data-odds]').forEach((el) => {
        const row = rows[Number(el.getAttribute('data-odds'))];
        if (!row) return;
        const weight = Number(row.weight) > 0 ? Number(row.weight) : 0;
        el.textContent = `割合 ${pct(weight, total)}`;
      });
    };
    const draw = () => {
      list.replaceChildren(...rows.map((t, i) => {
        const row = document.createElement('div');
        row.className = 'item-row';
        const id = document.createElement('label');
        id.className = 'field';
        const idInput = document.createElement('input');
        idInput.value = t.id;
        idInput.placeholder = 'common';
        idInput.setAttribute('aria-label', 'ID');
        idInput.addEventListener('input', () => { t.id = idInput.value.trim(); commit(); });
        id.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: 'ID（英数字）' }), idInput);
        const label = document.createElement('label');
        label.className = 'field';
        const labelInput = document.createElement('input');
        labelInput.value = t.label;
        labelInput.placeholder = 'ふつう';
        labelInput.setAttribute('aria-label', '表示名');
        labelInput.addEventListener('input', () => { t.label = labelInput.value; commit(); });
        label.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '表示名' }), labelInput);
        const weight = document.createElement('label');
        weight.className = 'field';
        const weightInput = document.createElement('input');
        weightInput.type = 'number';
        weightInput.min = '1';
        weightInput.step = '1';
        weightInput.value = t.weight;
        weightInput.setAttribute('aria-label', '当たりやすさ');
        weightInput.addEventListener('input', () => {
          const n = Number(weightInput.value);
          if (weightInput.value !== '' && Number.isFinite(n)) t.weight = n;
          updateOdds();
          commit();
        });
        const odds = document.createElement('span');
        odds.className = 'hint';
        odds.setAttribute('data-odds', String(i));
        weight.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '当たりやすさ' }), weightInput, odds);
        const pity = document.createElement('label');
        pity.className = 'check';
        const pityInput = document.createElement('input');
        pityInput.type = 'checkbox';
        pityInput.checked = t.pity;
        pityInput.setAttribute('data-pity', String(i));
        pityInput.addEventListener('change', () => {
          rows.forEach((row, index) => { row.pity = pityInput.checked && index === i; });
          list.querySelectorAll('[data-pity]').forEach((el) => { el.checked = rows[Number(el.getAttribute('data-pity'))]?.pity === true; });
          commit(0);
        });
        pity.append(pityInput, '天井の対象');
        const actionsBox = document.createElement('div');
        actionsBox.className = 'field';
        actionsBox.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '当たったときの動作' }));
        const actionList = document.createElement('div');
        actionList.className = 'items';
        const paintActions = () => {
          actionList.replaceChildren(...(t.actions || []).map((a, index) => {
            const line = document.createElement('div');
            line.className = 'item-row';
            const type = document.createElement('select');
            type.setAttribute('aria-label', '動作の種類');
            for (const [choice, text] of TIER_ACTIONS) type.append(new Option(text, choice));
            type.value = a.type || 'timer.add';
            const valueInput = document.createElement('input');
            valueInput.setAttribute('aria-label', '動作の値');
            const volumeInput = document.createElement('input');
            volumeInput.type = 'number';
            volumeInput.min = '0';
            volumeInput.max = '100';
            volumeInput.step = '1';
            volumeInput.placeholder = '音量（空なら100）';
            volumeInput.setAttribute('aria-label', '効果音の音量');
            const idInput = document.createElement('input');
            idInput.placeholder = '対象の名前（空なら全部）';
            idInput.setAttribute('aria-label', '対象の名前');
            idInput.value = a.id ?? '';
            const sync = () => {
              const needsValue = a.type !== 'rush.start' && a.type !== 'gacha.start';
              const needsId = a.type === 'timer.add' || a.type === 'wins.add' || a.type === 'boss.damage' || a.type === 'boss.heal';
              valueInput.hidden = !needsValue;
              volumeInput.hidden = a.type !== 'sound.play';
              idInput.hidden = !needsId;
              valueInput.placeholder = tierActionPlaceholder(a.type);
              valueInput.type = a.type === 'media.play' || a.type === 'sound.play' ? 'text' : 'number';
              if (a.type === 'timer.add') valueInput.value = a.seconds ?? '';
              else if (a.type === 'wins.add') valueInput.value = a.n ?? '';
              else if (a.type === 'media.play' || a.type === 'sound.play') valueInput.value = a.mediaId ?? '';
              else if (a.type === 'boss.damage' || a.type === 'boss.heal') valueInput.value = a.amount ?? '';
              else valueInput.value = '';
              volumeInput.value = a.volume ?? '';
            };
            type.addEventListener('change', () => {
              a.type = type.value;
              delete a.seconds;
              delete a.n;
              delete a.mediaId;
              delete a.amount;
              delete a.volume;
              sync();
              commit(0);
            });
            valueInput.addEventListener('input', () => {
              const text = valueInput.value.trim();
              if (a.type === 'media.play' || a.type === 'sound.play') a.mediaId = text;
              else if (a.type === 'timer.add') a.seconds = text === '' ? '' : Number(text);
              else if (a.type === 'wins.add') a.n = text === '' ? '' : Number(text);
              else if (a.type === 'boss.damage' || a.type === 'boss.heal') a.amount = text === '' ? '' : Number(text);
              commit();
            });
            volumeInput.addEventListener('input', () => {
              const text = volumeInput.value.trim();
              if (text === '') delete a.volume;
              else a.volume = Number(text);
              commit();
            });
            idInput.addEventListener('input', () => {
              const text = idInput.value.trim();
              if (text) a.id = text;
              else delete a.id;
              commit();
            });
            const actionButtons = document.createElement('div');
            actionButtons.className = 'btn-row';
            const delAction = document.createElement('button');
            delAction.type = 'button';
            delAction.className = 'btn pressable';
            delAction.textContent = '削除';
            delAction.addEventListener('click', () => {
              t.actions.splice(index, 1);
              paintActions();
              commit(0);
            });
            actionButtons.append(delAction);
            sync();
            line.append(type, valueInput, volumeInput, idInput, actionButtons);
            return line;
          }));
        };
        const addActions = document.createElement('div');
        addActions.className = 'btn-row';
        const addAction = document.createElement('button');
        addAction.type = 'button';
        addAction.className = 'btn pressable';
        addAction.textContent = '動作追加';
        addAction.addEventListener('click', () => {
          if (!Array.isArray(t.actions)) t.actions = [];
          t.actions.push({ type: 'media.play', mediaId: '' });
          paintActions();
          commit(0);
        });
        addActions.append(addAction);
        paintActions();
        actionsBox.append(actionList, addActions);
        const buttons = document.createElement('div');
        buttons.className = 'btn-row';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn pressable';
        del.textContent = '削除';
        del.addEventListener('click', () => {
          if (rows.length <= 1) return ctx.setMessage('段階は1つ以上残してください', true);
          rows.splice(i, 1);
          draw();
          commit(0);
        });
        buttons.append(del);
        row.append(id, label, weight, pity, actionsBox, buttons);
        return row;
      }));
      updateOdds();
    };
    const addRow = document.createElement('div');
    addRow.className = 'btn-row';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn pressable';
    add.textContent = '段階追加';
    add.addEventListener('click', () => {
      let n = rows.length + 1;
      let id = `tier${n}`;
      while (rows.some((r) => r.id === id)) id = `tier${++n}`;
      rows.push({ id, label: '新しい段階', weight: 10, pity: false, actions: [] });
      draw();
      commit(0);
    });
    addRow.append(add);
    draw();
    wrap.append(head, hint, list, addRow);
    return wrap;
  }

  function mediaLibrary() {
    const wrap = document.createElement('div');
    wrap.className = 'field wide';
    const head = document.createElement('span');
    head.className = 'field-label';
    head.textContent = 'アップロードしたファイル';
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '動画は32MB、音声は12MB、画像は8MBまで。きっかけでは、ここに出たIDを選びます。';
    const list = document.createElement('div');
    list.className = 'items';
    const file = document.createElement('input');
    file.type = 'file';
    file.hidden = true;
    file.accept = 'video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm,image/png,image/jpeg,image/gif,image/webp';
    const buttons = document.createElement('div');
    buttons.className = 'btn-row';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn primary pressable';
    add.textContent = 'アップロード';
    add.addEventListener('click', () => file.click());
    buttons.append(add);
    const kindLabel = { video: '動画', audio: '音声', image: '画像' };
    const paint = (items) => {
      ctx.setAlertMedia(items);
      list.replaceChildren();
      if (!items.length) {
        list.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'まだファイルがありません。' }));
      } else {
        for (const item of items) {
          const line = document.createElement('div');
          line.className = 'srow url-item';
          const main = document.createElement('span');
          main.className = 'srow-main';
          main.append(
            Object.assign(document.createElement('span'), { className: 'srow-title', textContent: item.name || item.id }),
            Object.assign(document.createElement('span'), { className: 'srow-sub', textContent: `${kindLabel[item.kind] || item.kind} ・ ID ${item.id}` }),
          );
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'chip pressable';
          del.textContent = '削除';
          del.addEventListener('click', async () => {
            if (!confirm(`「${item.name || item.id}」を削除しますか？`)) return;
            try {
              await ctx.api(`/api/media-alerts/${encodeURIComponent(item.id)}`, {}, 'DELETE');
              ctx.setMessage('削除しました');
              await load();
            } catch (err) {
              ctx.setMessage(err.message, true);
            }
          });
          line.append(main, del);
          list.append(line);
        }
      }
      ctx.refreshMediaSelects();
    };
    const load = async () => {
      try {
        const data = await ctx.api('/api/media-alerts');
        paint(data.items || []);
      } catch (err) {
        list.replaceChildren(Object.assign(document.createElement('p'), { className: 'hint', textContent: err.message }));
      }
    };
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      add.disabled = true;
      try {
        const res = await fetch(`/api/media-alerts?name=${encodeURIComponent(f.name)}`, {
          method: 'POST',
          headers: { 'content-type': f.type || 'application/octet-stream' },
          body: f,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '入れられませんでした');
        ctx.setMessage('入れました');
        await load();
      } catch (err) {
        ctx.setMessage(err.message, true);
      } finally {
        add.disabled = false;
      }
    });
    wrap.append(head, hint, list, buttons, file);
    load();
    return wrap;
  }

  return { mediaRulesEditor, gachaPaidRuleEditor, gachaTiersEditor, mediaLibrary };
}
