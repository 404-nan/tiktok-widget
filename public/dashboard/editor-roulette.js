// editor.js のルーレット項目エディタ。マスの追加・削除・色・画像・動作・RUSH確率。
import { icon, mediaUrl, giftLabel } from '/widgets/lib/overlay.js';
import { WEIGHT_INPUT, parseWeight } from './weight.js';
import { TOKEN_LABELS } from './editor-constants.js';
import { planLimitText } from './common.js';

export function buildRoulette(ctx) {

  function itemsEditor(items, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'field items-field';
    const head = document.createElement('span');
    head.className = 'field-label';
    head.textContent = '中身（色と画像は1つずつ決められます）';
    const list = document.createElement('div');
    list.className = 'items';
    let rows = items.map((it) => ({ ...it, actions: Array.isArray(it.actions) ? it.actions.map((a) => ({ ...a })) : [] }));
    let rushOn = !!(opts && opts.rushOdds);
    const ACTION_CHOICES = [
      ['timer.add', 'タイマーを足す・減らす'],
      ['wins.add', 'WIN数を足す・減らす'],
      ['rush.start', 'RUSHを始める'],
      ['media.play', 'メディアを再生'],
      ['sound.play', '効果音を鳴らす'],
      ['boss.damage', 'ボスにダメージ'],
      ['boss.heal', 'ボスを回復'],
      ['gacha.start', 'ガチャを回す'],
      ['omikuji.start', 'おみくじを引く'],
    ];
    const actionReady = (a) => {
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
      return a.type === 'rush.start' || a.type === 'gacha.start' || a.type === 'omikuji.start';
    };
    const actionClean = (a) => {
      const out = { type: a.type };
      if (a.id) out.id = String(a.id);
      if (a.type === 'timer.add') out.seconds = Number(a.seconds);
      else if (a.type === 'wins.add') out.n = Number(a.n);
      else if (a.type === 'media.play') out.mediaId = String(a.mediaId).trim();
      else if (a.type === 'sound.play') {
        out.mediaId = String(a.mediaId).trim();
        if (a.volume != null && a.volume !== '') out.volume = Number(a.volume);
      }
      else if (a.type === 'boss.damage' || a.type === 'boss.heal') out.amount = Number(a.amount);
      return out;
    };
    const actionPlaceholder = (type) => {
      if (type === 'timer.add') return '秒（マイナスで減らす）';
      if (type === 'wins.add') return '数（マイナスで減らす）';
      if (type === 'media.play') return 'メディアID';
      if (type === 'sound.play') return '音声のID';
      if (type === 'boss.damage' || type === 'boss.heal') return '量';
      return '';
    };

    const baseOf = (r) => {
      const n = r.weight == null || r.weight === '' ? 1 : Number(r.weight);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const rushOf = (r) => {
      if (r.rushWeight == null || r.rushWeight === '') return baseOf(r);
      const n = Number(r.rushWeight);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const fmtPct = (part, total) => {
      if (!(total > 0)) return '0%';
      const n = Math.round((part / total) * 1000) / 10;
      return `${Number.isInteger(n) ? String(n) : n.toFixed(1)}%`;
    };
    const updateOdds = () => {
      const baseTotal = rows.reduce((a, r) => a + baseOf(r), 0);
      let rushParts = rows.map(rushOf);
      let rushTotal = rushParts.reduce((a, b) => a + b, 0);
      if (!(rushTotal > 0)) {
        rushParts = rows.map(baseOf);
        rushTotal = baseTotal;
      }
      list.querySelectorAll('[data-odds]').forEach((el) => {
        const i = Number(el.getAttribute('data-odds'));
        const row = rows[i];
        if (!row) return;
        el.textContent = `いつも ${fmtPct(baseOf(row), baseTotal)} → RUSH中 ${fmtPct(rushParts[i], rushTotal)}`;
      });
    };
    const applyRush = () => {
      list.querySelectorAll('[data-rush-row]').forEach((el) => {
        el.hidden = !rushOn;
      });
    };
    ctx.setSyncRushOdds((on) => {
      rushOn = !!on;
      applyRush();
      updateOdds();
    });

    const { save, setMessage } = ctx;

    const commit = (delay = 400) => {
      // 色も画像もない項目は「名前*重み」の短い形で書く
      const value = rows.map((r) => {
        const out = { label: r.label };
        if (r.weight && r.weight !== 1) out.weight = r.weight;
        if (typeof r.rushWeight === 'number' && r.rushWeight >= 0) out.rushWeight = r.rushWeight;
        if (r.color) out.color = r.color;
        if (r.textColor) out.textColor = r.textColor;
        if (r.image) out.image = r.image;
        if (r.commands?.length) out.commands = r.commands;
        if (r.superstreamGift) out.superstreamGift = r.superstreamGift;
        if (r.superstreamAction) out.superstreamAction = r.superstreamAction;
        if (r.rush) out.rush = true;
        if (r.win) out.win = true;
        if (r.tease) out.tease = true;
        const ready = (r.actions || []).filter(actionReady).map(actionClean);
        if (ready.length) out.actions = ready;
        const keys = Object.keys(out);
        if (keys.length === 1) return r.label;
        if (keys.length === 2 && out.weight) return `${r.label}*${r.weight}`;
        return out;
      });
      save('items', value, delay);
    };

    const draw = () => {
      list.replaceChildren(...rows.map((r, i) => itemRow(r, i)));
      updateOdds();
      applyRush();
    };

    const itemRow = (r, i) => {
      const schema = ctx.getSchema();
      const media = ctx.getMedia();
      const superstream = ctx.getSuperstream();
      const row = document.createElement('div');
      row.className = 'item-row';
      // 画像の四角は押すと画像を選べる（ファイルを落としても入る）
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'thumb pressable';
      thumb.title = '押して画像を選ぶ（右クリック・長押しで差し替え／外す。画像を落としても入ります）';
      thumb.setAttribute('aria-label', `${r.label ?? 'マス'}の画像を選ぶ`);
      const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/avif', hidden: true });
      const takeFile = async (f) => {
        if (!f) return;
        thumb.classList.add('loading');
        try {
          const res = await fetch('/api/media', { method: 'POST', headers: { 'content-type': f.type }, body: f });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(planLimitText(data, res.status) || data.error || '画像を入れられませんでした');
          if (!media.includes(data.path)) media.push(data.path);
          r.image = data.path;
          paint();
          commit(0);
          draw();
        } catch (err) {
          setMessage(err.message, true);
        } finally {
          thumb.classList.remove('loading');
        }
      };
      thumb.addEventListener('click', () => file.click());
      file.addEventListener('change', () => takeFile(file.files[0]));
      // 右クリック・長押しで「画像を差し替える / 外す」を出す
      const openMenu = (x, y) => {
        document.querySelector('.ctx-menu')?.remove();
        const menu = Object.assign(document.createElement('div'), { className: 'ctx-menu' });
        menu.setAttribute('role', 'menu');
        const opt = (text, fn) => {
          const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pressable', textContent: text });
          b.setAttribute('role', 'menuitem');
          b.addEventListener('click', () => (menu.remove(), fn()));
          menu.append(b);
        };
        opt(r.image ? '画像を差し替える' : '画像を入れる', () => file.click());
        if (r.image) opt('画像を外す', () => { r.image = undefined; paint(); commit(0); draw(); });
        document.body.append(menu);
        const w = menu.offsetWidth, h = menu.offsetHeight;
        menu.style.left = `${Math.min(x, innerWidth - w - 8)}px`;
        menu.style.top = `${Math.min(y, innerHeight - h - 8)}px`;
        setTimeout(() => document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) menu.remove(); }, { once: true }));
      };
      row.addEventListener('contextmenu', (e) => { if (e.target.closest('input')) return; e.preventDefault(); openMenu(e.clientX, e.clientY); });
      let press = null;
      thumb.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        press = setTimeout(() => { press = 'done'; openMenu(e.clientX, e.clientY); }, 500);
      });
      const cancel = () => { if (press && press !== 'done') clearTimeout(press); };
      thumb.addEventListener('pointerup', cancel);
      thumb.addEventListener('pointerleave', cancel);
      thumb.addEventListener('click', (e) => { if (press === 'done') { e.stopImmediatePropagation(); press = null; } }, true);
      thumb.addEventListener('dragover', (e) => (e.preventDefault(), thumb.classList.add('drop')));
      thumb.addEventListener('dragleave', () => thumb.classList.remove('drop'));
      thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        thumb.classList.remove('drop');
        takeFile([...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/')));
      });
      const paint = () => {
        thumb.style.background = r.color ? (schema.colorTokens.includes(r.color) ? `var(--tok-${r.color})` : r.color) : '';
        thumb.replaceChildren();
        if (r.image) {
          const img = new Image();
          img.src = mediaUrl(r.image);
          img.alt = '';
          thumb.append(img);
        } else {
          thumb.append(icon('image-plus'));
        }
      };
      paint();

      const label = document.createElement('input');
      label.value = r.label ?? '';
      label.placeholder = '名前';
      label.addEventListener('input', () => ((r.label = label.value), commit()));

      const weight = document.createElement('input');
      weight.type = 'number';
      Object.assign(weight, WEIGHT_INPUT);
      weight.value = r.weight ?? 1;
      weight.title = '当たりやすさ';
      weight.className = 'weight';
      weight.addEventListener('input', () => {
        const n = parseWeight(weight.value);
        if (n != null) {
          r.weight = n;
          commit();
          updateOdds();
        }
      });

      // RUSH中だけ当たりやすさを変える。空欄はいつもの weight のまま
      const rushBox = document.createElement('div');
      rushBox.className = 'row wrap';
      rushBox.setAttribute('data-rush-row', '');
      rushBox.hidden = !rushOn;
      const rushName = document.createElement('span');
      rushName.className = 'field-label';
      rushName.textContent = 'RUSH中の当たりやすさ';
      const rushWeight = document.createElement('input');
      rushWeight.type = 'number';
      rushWeight.className = 'weight';
      rushWeight.placeholder = 'いつもと同じ';
      rushWeight.title = 'RUSH中の当たりやすさ（空欄はいつもと同じ）';
      rushWeight.setAttribute('aria-label', 'RUSH中の当たりやすさ');
      rushWeight.min = '0';
      rushWeight.step = '1';
      if (r.rushWeight != null && r.rushWeight !== '') rushWeight.value = r.rushWeight;
      rushWeight.addEventListener('input', () => {
        const text = rushWeight.value.trim();
        if (text === '') {
          delete r.rushWeight;
          commit();
          updateOdds();
          return;
        }
        const n = Number(text);
        if (!Number.isFinite(n) || n < 0) return;
        r.rushWeight = Math.round(n * 100) / 100;
        commit();
        updateOdds();
      });
      const odds = document.createElement('span');
      odds.className = 'hint';
      odds.setAttribute('data-odds', String(i));
      rushBox.append(rushName, rushWeight, odds);

      const color = document.createElement('select');
      color.title = '色';
      color.append(new Option('色: 自動', ''));
      for (const t of schema.colorTokens) color.append(new Option(`色: ${TOKEN_LABELS[t]}`, t));
      color.append(new Option('色: 指定する', 'custom'));
      const picker = document.createElement('input');
      picker.type = 'color';
      const custom = r.color && !schema.colorTokens.includes(r.color);
      color.value = custom ? 'custom' : r.color ?? '';
      picker.value = custom && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#3fa9f5';
      picker.hidden = !custom;
      color.addEventListener('change', () => {
        picker.hidden = color.value !== 'custom';
        r.color = color.value === 'custom' ? picker.value.toUpperCase() : color.value || undefined;
        paint();
        commit(0);
      });
      picker.addEventListener('input', () => ((r.color = picker.value.toUpperCase()), paint(), commit(250)));

      const image = document.createElement('select');
      image.title = '画像';
      image.append(new Option('画像: なし', ''));
      for (const m of media) image.append(new Option(`画像: ${m.replace(/^media\//, '')}`, m));
      image.append(new Option('画像: URL を入れる', 'url'));
      const url = document.createElement('input');
      url.placeholder = 'https://… または media/…';
      const isMedia = media.includes(r.image);
      image.value = !r.image ? '' : isMedia ? r.image : 'url';
      url.value = r.image && !isMedia ? r.image : '';
      url.hidden = image.value !== 'url';
      image.addEventListener('change', () => {
        url.hidden = image.value !== 'url';
        r.image = image.value === 'url' ? url.value || undefined : image.value || undefined;
        paint();
        commit(0);
      });
      url.addEventListener('input', () => ((r.image = url.value.trim() || undefined), paint(), commit(600)));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn small pressable';
      del.title = 'これを消す';
      del.append(icon('x'));
      del.addEventListener('click', () => {
        rows.splice(i, 1);
        draw();
        commit(0);
      });

      // 色・画像の選び直しは、必要なときだけ「…」で開く
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'icon-btn small pressable';
      more.title = '色と画像';
      more.setAttribute('aria-expanded', 'false');
      more.append(icon('ellipsis'));
      more.addEventListener('click', () => more.setAttribute('aria-expanded', String(row.classList.toggle('open'))));

      const actionsBox = document.createElement('div');
      actionsBox.className = 'field';
      actionsBox.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '当たったときの動作' }));
      const actionList = document.createElement('div');
      actionList.className = 'items';
      const paintActions = () => {
        actionList.replaceChildren(...(r.actions || []).map((a, index) => {
          const line = document.createElement('div');
          line.className = 'item-row';
          const type = document.createElement('select');
          type.setAttribute('aria-label', '動作の種類');
          for (const [value, text] of ACTION_CHOICES) type.append(new Option(text, value));
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
            const needsValue = a.type !== 'rush.start' && a.type !== 'gacha.start' && a.type !== 'omikuji.start';
            const needsId = a.type === 'timer.add' || a.type === 'wins.add' || a.type === 'boss.damage' || a.type === 'boss.heal';
            valueInput.hidden = !needsValue;
            volumeInput.hidden = a.type !== 'sound.play';
            idInput.hidden = !needsId;
            valueInput.placeholder = actionPlaceholder(a.type);
            valueInput.type = a.type === 'media.play' || a.type === 'sound.play' ? 'text' : 'number';
            if (a.type === 'wins.add') valueInput.step = '1';
            else valueInput.step = '1';
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
          const buttons = document.createElement('div');
          buttons.className = 'btn-row';
          const delAction = document.createElement('button');
          delAction.type = 'button';
          delAction.className = 'btn pressable';
          delAction.textContent = '削除';
          delAction.addEventListener('click', () => {
            r.actions.splice(index, 1);
            paintActions();
            commit(0);
          });
          buttons.append(delAction);
          sync();
          line.append(type, valueInput, volumeInput, idInput, buttons);
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
        if (!Array.isArray(r.actions)) r.actions = [];
        r.actions.push({ type: 'timer.add', seconds: 10 });
        paintActions();
        commit(0);
      });
      addActions.append(addAction);
      paintActions();
      actionsBox.append(actionList, addActions);

      const top = document.createElement('div');
      top.className = 'item-top';
      top.append(thumb, file, label, weight, more, del);
      // 当たりの項目: 出たらカットインの「大当たり」演出が入る
      const win = Object.assign(document.createElement('label'), { className: 'check', title: '出たらカットインで「大当たり」を出す' });
      const winBox = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!r.win });
      winBox.addEventListener('change', () => ((r.win = winBox.checked || undefined), commit(0)));
      win.append(winBox, '当たり');
      // 当たりそうで当たらない: 針がこのマスの近くで止まりかけて、外れる(結果は変えない)
      const tease = Object.assign(document.createElement('label'), { className: 'check', title: '針がこのマスの近くで止まりかけて、外れる演出を入れる' });
      const teaseBox = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!r.tease });
      teaseBox.addEventListener('change', () => ((r.tease = teaseBox.checked || undefined), commit(0)));
      tease.append(teaseBox, '当たりそうで当たらない');

      const bottom = document.createElement('div');
      bottom.className = 'item-bottom';
      bottom.append(color, picker, image, url, win, tease);

      if (!ctx.usesMinecraft()) {
        row.append(top, rushBox, actionsBox, bottom);
        return row;
      }

      // 当たったらマイクラで起こすこと（マイクラ側の演出かコマンド）
      const ss = document.createElement('select');
      ss.title = '当たったらマイクラの演出を起こす';
      ss.append(new Option('マイクラの演出: なし', ''));
      for (const g of superstream.gifts) {
        ss.append(new Option(`マイクラの演出 ${g.id}${g.name ? `（${giftLabel({ id: g.id, name: g.name })}）` : ''}: ${g.actions.join('・')}`, g.id));
      }
      if (r.superstreamGift && !superstream.gifts.some((g) => g.id === r.superstreamGift)) ss.append(new Option(`マイクラの演出 ${r.superstreamGift}`, r.superstreamGift));
      ss.value = r.superstreamGift ?? '';
      ss.addEventListener('change', () => ((r.superstreamGift = ss.value || undefined), commit(0)));
      const cmd = document.createElement('input');
      cmd.placeholder = '当たったら送るコマンド（; 区切り。例: give {user} diamond）';
      cmd.value = (r.commands ?? []).join('; ');
      cmd.addEventListener('input', () => {
        r.commands = cmd.value.split(';').map((c) => c.trim()).filter(Boolean);
        commit(600);
      });
      const mc = document.createElement('div');
      mc.className = 'item-bottom item-mc';
      mc.append(ss, cmd);
      row.append(top, rushBox, actionsBox, bottom, mc);
      return row;
    };

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'chip pressable';
    add.append(icon('plus'), '1つ足す');
    add.addEventListener('click', () => {
      rows.push({ label: '新しいマス', weight: 1, actions: [] });
      draw();
      commit(0);
      list.lastElementChild?.querySelector('input')?.select();
    });

    draw();
    wrap.append(head, list, add);
    return wrap;
  }

  return { itemsEditor };
}
