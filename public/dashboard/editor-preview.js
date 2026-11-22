// URL・プレビュー・操作ボタンの組み立て。editor.js の createEditor から呼ばれる。

import { BASE, giftLabel } from '/widgets/lib/overlay.js';
import { copyText, flashCopied } from './common.js';
import { renderRouletteUrls as renderRouletteUrlBox } from './roulette-urls.js';
import { lossSteps, gainSteps } from './editor-constants.js';

const $ = (id) => document.getElementById(id);

/**
 * URL・プレビュー・操作を組み立てる。
 * @param {object} ctx
 * @returns {{ updateUrl, fitPreview, renderActions, currentWidget }}
 */
export function buildPreview(ctx) {
  const {
    api, setMessage, chip, goTo,
    getTab, getId, getPayload, getSchema, getLive, getDevMode,
    getSuperstream, getRouletteUrlsTarget,
    simple, isObj, isTenant,
  } = ctx;

  let previewTimer = null;
  let previewUrl = null;
  // 見え方の枠: このウィジェットだけ / 配信画面ぜんぶ(all.html)
  let previewAll = false;
  // プレビューの見え方: false=「配信画面そのまま」(preview=live)、true=「動きを確認」(preview=1)
  let previewDebug = true;
  let rouletteUrlsBox = null;
  let testVoteParticipant = 0;

  function currentWidget() {
    const tab = getTab();
    if (tab === 'minecraft') return null;
    const payload = getPayload();
    const section = tab === 'theme' ? 'alerts' : tab;
    const wid = tab === 'theme'
      ? Object.keys(payload.config.alerts ?? {})[0]
      : tab === 'roulettes' || tab === 'puchuns' ? '*'
        : isObj(tab) ? null : getId();
    return payload.widgets.find((w) => w.section === section && w.id === wid && !w.extra);
  }

  function previewModeSwitch() {
    let box = $('previewMode');
    if (!box) {
      box = Object.assign(document.createElement('div'), { id: 'previewMode', className: 'preset-chips preview-mode' });
      for (const [label, all] of [['このウィジェットだけ', false], ['配信画面ぜんぶ', true]]) {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'preset pressable', textContent: label });
        b.dataset.all = String(all);
        b.addEventListener('click', () => { previewAll = all; updateUrl(true); });
        box.append(b);
      }
      // 「動きを確認」チェックボックス（チェックを外すと「配信画面そのまま」）
      const debugLabel = Object.assign(document.createElement('label'), { className: 'check preview-debug-check' });
      const debugCb = Object.assign(document.createElement('input'), { type: 'checkbox', id: 'previewDebugCb', checked: previewDebug });
      debugCb.addEventListener('change', () => { previewDebug = debugCb.checked; previewUrl = null; updateUrl(true); });
      debugLabel.append(debugCb, ' 動きを確認');
      box.append(debugLabel);
      // 切り替えと見え方の枠を1つの列にまとめる(右の列の高さに引っぱられて、枠の上に隙間ができないように)
      const left = Object.assign(document.createElement('div'), { className: 'preview-left' });
      $('preview').before(left);
      left.append(box, $('preview'));
    }
    for (const b of [...box.querySelectorAll('button')]) b.setAttribute('aria-pressed', String(b.dataset.all === String(previewAll)));
    // チェックボックスの同期（初回以外にも呼ばれるため）
    const debugCb = $('previewDebugCb');
    if (debugCb) debugCb.checked = previewDebug;
    // 配信画面ぜんぶのときは、置き場所と大きさを変える画面(配信画面の編集)へ行ける
    let edit = $('stageEditBtn');
    if (!edit) {
      edit = Object.assign(document.createElement('button'), { id: 'stageEditBtn', type: 'button', className: 'btn pressable stage-edit-btn', textContent: '配信画面を編集する' });
      edit.addEventListener('click', goTo('stage'));
      box.after(edit);
    }
    edit.hidden = !previewAll;
  }

  function renderRouletteUrls(w) {
    const tab = getTab();
    const payload = getPayload();
    const schema = getSchema();
    rouletteUrlsBox = renderRouletteUrlBox({
      existingBox: rouletteUrlsBox,
      widget: tab === 'roulettes' ? w : null,
      roulettes: payload.config.roulettes ?? {},
      schemaTitle: schema.sections.roulettes.title,
      target: getRouletteUrlsTarget(),
      fallback: $('previewCol'),
      copyText,
      flashCopied,
    });
  }

  function updateUrl(immediate = false) {
    const tab = getTab();
    const id = getId();
    const payload = getPayload();
    const w = currentWidget();
    if (!w) {
      $('widgetUrl').value = '';
      renderRouletteUrls(null);
      return;
    }
    const explicit = !isObj(tab) && tab !== 'roulettes' ? (() => { const u = new URL(w.url, location.origin); u.searchParams.set('id', id); return u.href; })() : new URL(w.url, location.origin).href;
    $('widgetUrl').value = explicit;
    $('sizeHint').textContent =
      tab === 'roulettes'
        ? `配信ソフトに「ブラウザ」ソースとして幅 ${w.size[0]}・高さ ${w.size[1]} で追加してください。`
        : `配信ソフトに「ブラウザ」ソースとして追加し、幅 ${w.size[0]}・高さ ${w.size[1]} に設定してください。`;
    if (simple()) $('sizeHint').textContent = `幅 ${w.size[0]}・高さ ${w.size[1]}`;
    // WIN 数は、ゲーム中でも Stream Deck などから押せる URL を出す
    if (simple()) {
      // ボタン用の URL などは「くわしく」で出す
    } else if (tab === 'wins') {
      // ボタン用の URL は、このダッシュボードの URL の下（配信者ごとの URL なら /t/<鍵>/）
      const base = `${location.origin}${BASE}`;
      const fx = payload.widgets.find((x) => x.section === 'wins' && x.id === id && x.extra);
      if (fx) $('sizeHint').textContent += ` 大妨害・超妨害・壊滅の全画面演出は ${fx.url} を配信画面と同じ大きさ（${fx.size[0]} × ${fx.size[1]}）で重ねてください。`;
      $('sizeHint').textContent +=
        ` ゲーム中は Stream Deck の「Webサイト」などで次の URL を開くと押せます（今の種類）: クリア +1 ${base}/api/wins/active/win ／ -1 ${base}/api/wins/active/add?value=-1 ／ 1つ戻す ${base}/api/wins/active/undo ／ リセット ${base}/api/wins/active/reset`;
    }
    // 延長タイマーも、Stream Deck などから押せる URL を出す
    if (!simple() && tab === 'timers') {
      const base = `${location.origin}${BASE}/api/timer/${id}`;
      $('sizeHint').textContent +=
        ` Stream Deck の「Webサイト」などで次の URL を開くと押せます（今の種類）: スタート ${location.origin}${BASE}/api/timer/active/start ／ 一時停止 ${location.origin}${BASE}/api/timer/active/pause ／ 止める・動かすを1つで ${location.origin}${BASE}/api/timer/active/toggle ／ +1分 ${location.origin}${BASE}/api/timer/active/add?seconds=60 ／ -1分 ${location.origin}${BASE}/api/timer/active/add?seconds=-60 ／ リセット ${location.origin}${BASE}/api/timer/active/reset`;
    }
    // ボス討伐も、Stream Deck などから押せる URL を出す
    if (!simple() && tab === 'bosses') {
      const base = `${location.origin}${BASE}`;
      $('sizeHint').textContent +=
        ` Stream Deck の「Webサイト」などで次の URL を開くと押せます（今の種類）: HP を戻す ${base}/api/boss/active/heal ／ ダメージ 100 ${base}/api/boss/active/damage?value=100 ／ 討伐 ${base}/api/boss/active/defeat ／ 次のボス ${base}/api/boss/active/next ／ 1体目から ${base}/api/boss/active/reset`;
    }
    renderRouletteUrls(w);
    if (simple()) previewModeSwitch();
    // 配信画面ぜんぶのときは、全部が1本で出る URL と大きさを見せる
    if (simple() && previewAll) {
      const allW = payload.widgets.find((x) => x.section === 'all');
      $('widgetUrl').value = new URL(allW?.url ?? `${BASE}/widgets/all.html`, location.origin).href;
      $('sizeHint').textContent = `幅 ${allW?.size?.[0] ?? 1080}・高さ ${allW?.size?.[1] ?? 1920}(この URL 1本で、使っているものが全部出ます)`;
    }
    const allUrl = payload.widgets.find((x) => x.section === 'all')?.url ?? `${BASE}/widgets/all.html`;
    const shownSize = previewAll ? [1080, 1920] : w.size;
    const url = new URL(previewAll ? allUrl : explicit, location.origin);
    url.searchParams.set('preview', previewDebug ? '1' : 'live');
    url.searchParams.set('sound', '0');
    url.searchParams.set('keep', '0');
    const next = `${url.pathname}${url.search}`;
    clearTimeout(previewTimer);
    // 同じ URL なら読み込み直さない（設定が変わればウィジェットが自分で読み込み直す）
    if (next === previewUrl) return fitPreview(shownSize);
    previewTimer = setTimeout(
      () => {
        previewUrl = next;
        $('frame').src = next;
        fitPreview(shownSize);
      },
      immediate ? 0 : 300,
    );
  }

  function fitPreview(size = previewAll ? [1080, 1920] : currentWidget()?.size) {
    if (!size) return;
    const [w, h] = size;
    const box = $('preview');
    // 見え方の枠はいつも 4:3。ウィジェットはその中に収まる大きさで真ん中に置く
    const boxW = box.clientWidth;
    const boxH = Math.round(boxW * 3 / 4);
    const scale = Math.min(1, boxW / w, boxH / h);
    const frame = $('frame');
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.left = `${Math.max(0, (boxW - w * scale) / 2)}px`;
    frame.style.top = `${Math.max(0, (boxH - h * scale) / 2)}px`;
    box.style.height = `${boxH}px`;
  }

  // そのウィジェットの条件に合うテストのギフトを送る
  function testGift() {
    const tab = getTab();
    const id = getId();
    const payload = getPayload();
    const e = isObj(tab) ? {} : payload.config[tab]?.[id] ?? {};
    // おみくじは仮の名前の人が送った形で始め、番号待ちから見せる（名前がないと番号待ちを飛ばすため）
    if (tab === 'omikuji') return api('/api/control', { target: 'omikuji', action: 'start', data: { user: 'テスト視聴者' } });
    // 出す条件がギフト以外だけのときは、ギフトを流しても出ない。先に出来事の条件を見る
    if (e.events?.length && !e.events.includes('gift')) return api('/api/simulate', { kind: e.events[0] });
    if (e.gifts?.length) return api('/api/simulate', { kind: 'gift', giftName: e.gifts[0], diamonds: 10 });
    if (e.minCoins > 1) return api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: e.minCoins });
    return api('/api/simulate', { kind: 'gift' });
  }

  function renderActions() {
    fillActions();
    // かんたんでは、試すボタンが多いときは初めの4つだけ出す
    const box = $('actions');
    box.classList.remove('open');
    box.classList.toggle('live', getLive());
    const chips = [...box.children];
    // おみくじの番号ボタンは配信中に押すので、たたまない
    if (!simple() || chips.length <= 5 || getTab() === 'omikuji') return;
    chips.slice(4).forEach((c) => c.classList.add('extra'));
    const more = chip('ほかも試す', 'plus', () => {
      box.classList.add('open');
      more.remove();
    });
    box.append(more);
  }

  function fillActions() {
    const tab = getTab();
    const id = getId();
    const payload = getPayload();
    const live = getLive();
    const devMode = getDevMode();
    const box = $('actions');
    box.replaceChildren(chip(simple() ? 'ためしに1つ出す' : '条件に合うテストギフト', 'gift', () => testGift().catch((e) => setMessage(e.message, true))));
    if (!live) {
      // 見本を出している間は、ボタンの見た目と言葉が変わる(出しているのか分かるように)
      const sample = chip('見本を出したままにする', 'layout-template', async () => {
        try {
          const now = await api('/api/sample');
          await api('/api/sample', { on: !now.on }, 'POST');
          fillActions();
        } catch (e) { setMessage(e.message, true); }
      });
      sample.classList.add('sample-toggle');
      api('/api/sample').then((now) => {
        sample.setAttribute('aria-pressed', String(Boolean(now.on)));
        if (now.on) sample.lastChild.textContent = '見本を出しています(押すと止める)';
      }).catch(() => {});
      box.append(sample);
    }
    const control = (target, action, data) => () => api('/api/control', { target, action, data });
    if (tab === 'roulettes') {
      box.append(chip('まわす', 'rotate-cw', control('roulette', 'spin', { id })), chip('待ち列を消す', null, control('roulette', 'reset')));
    } else if (tab === 'omikuji') {
      // 「配信者が選ぶ」番のとき、押した番号の棒で引く
      // 押せるのは配信者の番のときだけ。画面を開いている間、1秒ごとに今の番を見る
      const numbers = [];
      for (let n = 1; n <= 10; n++) numbers.push(chip(`${n}番`, null, () => control('omikuji', 'pick', { n })().catch((e) => setMessage(e.message, true))));
      const sync = (state) => numbers.forEach((b) => { b.disabled = state?.pick?.by !== 'streamer'; });
      sync(null);
      box.append(...numbers);
      const poll = setInterval(() => {
        if (!numbers[0].isConnected) return clearInterval(poll);
        api('/api/omikuji').then(sync).catch(() => sync(null));
      }, 1000);
    } else if (tab === 'votes') {
      const vote = (action, data) => control('vote', action, { id, ...(data ?? {}) });
      const options = payload.config.votes?.[id]?.options ?? [];
      box.replaceChildren(
        chip('はじめる', 'play', vote('start')),
        chip('しめきる', 'pause', vote('close')),
        chip('結果を出す', 'trophy', vote('result')),
        chip('リセット', 'rotate-ccw', vote('reset')),
        ...options.map((_, index) => chip(`${index + 1} に1票（テスト）`, 'message-circle', () => api('/api/simulate', { kind: 'chat', text: String(index + 1), user: `テスト参加者${++testVoteParticipant}` }))),
      );
    } else if (tab === 'quizzes') {
      const quiz = (action, data) => control('quiz', action, { id, ...(data ?? {}) });
      const answer = payload.config.quizzes?.[id]?.answer ?? '';
      box.replaceChildren(
        chip('出題する', 'play', quiz('start')),
        chip('締めて答えを出す', 'pause', quiz('finish')),
        chip('リセット', 'rotate-ccw', quiz('reset')),
        ...(answer ? [chip('答えを打つ（テスト）', 'message-circle', () => api('/api/simulate', { kind: 'chat', text: answer, user: `テスト参加者${++testVoteParticipant}` }))] : []),
      );
    } else if (tab === 'cheers') {
      const cheer = (action, data) => control('cheer', action, { id, ...(data ?? {}) });
      box.replaceChildren(chip('いいね ×20（テスト）', 'heart', cheer('add', { value: 20 })), chip('いいね ×100（テスト）', 'heart', cheer('add', { value: 100 })), chip('満タンにする', 'trophy', cheer('fill')), chip('リセット', 'rotate-ccw', cheer('reset')));
    } else if (tab === 'pushButtons') {
      const push = (action, data) => control('push', action, { id, ...(data ?? {}) });
      box.replaceChildren(chip('はじめる', 'play', push('start')), chip('いま締める', 'pause', push('finish')), chip('リセット', 'rotate-ccw', push('reset')), chip('「押」と打つ（テスト）', 'message-circle', () => api('/api/simulate', { kind: 'chat', text: '押', user: 'テスト参加者' + (++testVoteParticipant) })), chip('いいね ×5（テスト）', 'heart', () => api('/api/simulate', { kind: 'like', count: 5, user: 'テスト参加者' + (++testVoteParticipant) })));
    } else if (tab === 'jars') {
      box.append(chip('ゆらす', null, control('gift-jar', 'shake', { id })), chip('中身を空にする', null, control('gift-jar', 'reset', { id })));
    } else if (tab === 'cutins' || tab === 'imageCutins') {
      // 段階ごとに試す（そのコイン数のテストギフトを送る）
      const e = payload.config[tab]?.[id] ?? {};
      const tiers = [['青', e.minCoins], ['緑', e.greenCoins], ['赤', e.redCoins], ['金', e.goldCoins], ['虹', e.rainbowCoins]];
      box.replaceChildren(
        ...tiers.map(([label, coins]) =>
          chip(`${label}（${coins} コイン）`, null, () => api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: coins })),
        ),
      );
    } else if (tab === 'wins') {
      const w = (action, value) => control('wins', action, { id, value });
      const e = payload.config.wins?.[id] ?? {};
      box.replaceChildren(
        chip('クリア（WIN +1）', 'trophy', w('win')),
        chip('WIN -1', 'minus', w('add', -1)),
        chip('1つ戻す', 'undo-2', w('undo')),
        // 段階ごとの演出を試す（境目は選んだプリセットのもの）
        ...lossSteps(e).map(([text, n]) => chip(`${text}（-${n}）を試す`, 'zap', w('add', -n))),
        ...gainSteps(e).map(([text, n]) => chip(`${text}（+${n}）を試す`, 'sparkles', w('add', n))),
        chip('リセット（0 に戻す）', 'rotate-ccw', () => confirm('WIN 数を 0 にリセットしますか？（「1つ戻す」で元に戻せます）') && w('reset')()),
        // ルールに書いたギフトを1つずつ試せる
        ...(e.rules ?? [])
          .filter((r) => r.gifts?.length || r.minCoins != null)
          .slice(0, 4)
          .map((r) =>
            chip(`${r.gifts?.[0] ? giftLabel(r.gifts[0]) : `${r.minCoins} コイン`}（${r.set != null ? `WIN ${r.set} に` : `WIN ${r.add > 0 ? '+' : ''}${r.add}`}）`, 'gift', () =>
              api('/api/simulate', r.gifts?.length ? { kind: 'gift', giftName: r.gifts[0], count: 1, diamonds: 1 } : { kind: 'gift', giftName: 'テストギフト', diamonds: r.minCoins }),
            ),
          ),
      );
    } else if (tab === 'timers') {
      const tm = (action, seconds) => control('timer', action, { id, seconds });
      const e = payload.config.timers?.[id] ?? {};
      const extra = [];
      if (e.coinSeconds > 0) {
        const coins = Math.max(10, e.minCoins ?? 1);
        extra.push(chip(`${coins} コインのギフト`, 'gift', () => api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: coins, count: 1 })));
      }
      for (const r of (e.rules ?? []).filter((r) => r.gifts?.length).slice(0, 2)) {
        extra.push(chip(giftLabel(r.gifts[0]), 'gift', () => api('/api/simulate', { kind: 'gift', giftName: r.gifts[0], diamonds: 1, count: 1 })));
      }
      if (e.followSeconds > 0) extra.push(chip('フォロー', 'user-plus', () => api('/api/simulate', { kind: 'follow' })));
      if (e.likeEvery > 0) extra.push(chip(`いいね ×${e.likeEvery}`, 'heart', () => api('/api/simulate', { kind: 'like', count: e.likeEvery })));
      box.replaceChildren(
        chip('スタート', 'play', tm('start')),
        chip('一時停止', 'pause', tm('pause')),
        chip('+1分', 'plus', tm('add', 60)),
        chip('-1分', 'minus', tm('add', -60)),
        chip('リセット（初めの時間に戻す）', 'rotate-ccw', () => confirm('タイマーを初めの時間に戻して、スタート前にしますか？') && tm('reset')()),
        ...extra,
      );
    } else if (tab === 'bosses') {
      const b = (action, value) => control('boss', action, { id, value });
      const e = payload.config.bosses?.[id] ?? {};
      box.replaceChildren(
        chip('ダメージ 100 を与える', 'swords', b('damage', 100)),
        chip(`大ダメージ（${e.bigHit ?? 1000}）`, 'zap', b('damage', e.bigHit ?? 1000)),
        chip('討伐する', 'skull', b('defeat')),
        chip('HP を戻す', 'heart-pulse', b('heal')),
        chip('次のボス', 'skip-forward', b('next')),
        chip('1体目からやり直す', 'rotate-ccw', () => confirm('1体目のボスからやり直しますか？') && b('reset')()),
        chip(`テストギフト（${giftLabel(e.gifts?.[0] ?? 'Rose')} ×10）`, 'gift', () => api('/api/simulate', { kind: 'gift', giftName: e.gifts?.[0] ?? 'Rose', count: 10, diamonds: 1 })),
        ...(e.damageFrom?.includes('likes') ? [chip('いいね ×50', 'heart', () => api('/api/simulate', { kind: 'like', count: 50 }))] : []),
      );
    } else if (tab === 'rush') {
      const r = payload.config.rush ?? {};
      box.replaceChildren(
        chip('RUSH 突入', 'zap', control('rush', 'start')),
        chip(`RUSH 中のギフト（${r.extendMinCoins ?? 100} コイン）`, 'gift', () =>
          api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: r.extendMinCoins ?? 100 }),
        ),
        chip('RUSH 終了', 'square', control('rush', 'stop')),
      );
    } else if (tab === 'tickers' || tab === 'supporters') {
      box.replaceChildren(
        chip('テストギフト', 'gift', () => api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: 10 })),
        chip('フォロー', 'user-plus', () => api('/api/simulate', { kind: 'follow' })),
      );
    } else if (tab === 'visitors') {
      const e = payload.config.visitors?.[id] ?? {};
      box.replaceChildren(
        chip('初見さんを迎える', 'door-open', () => api('/api/simulate', { kind: 'member', visits: 1 })),
        chip('常連さんを迎える', 'users', () => api('/api/simulate', { kind: 'member', visits: e.regularVisits ?? 3 })),
      );
    } else if (tab === 'combo') {
      if (devMode) box.append(chip('5連続を試す', 'layers', control('combo', 'test', { count: 5 })));
      box.append(chip('リセット', 'rotate-ccw', control('combo', 'reset')));
    } else if (tab === 'chats') {
      // コメントと、ギフトを送った人のコメント（先にその人のギフトを送り、同じ人がコメントする）
      const e = payload.config.chats?.[id] ?? {};
      const say = (body) => api('/api/simulate', { kind: 'chat', ...body });
      const gifterSays = (user, coins, text) => async () => {
        try {
          await api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: coins, count: 1, user });
          await say({ user, text });
        } catch (err) {
          setMessage(err.message, true);
        }
      };
      box.replaceChildren(
        chip('コメントを送る', 'message-square', () => say({})),
        chip(`ギフトした人のコメント（${e.gifterCoins ?? 1}〜）`, 'gift', gifterSays('みお', Math.max(30, e.gifterCoins ?? 1), 'ギフト送りました！')),
        chip(`2段目（${e.bigGifterCoins ?? 1000}〜）`, 'gift', gifterSays('Ken', e.bigGifterCoins ?? 1000, 'いつも楽しい配信ありがとう')),
        chip(`3段目（${e.topGifterCoins ?? 10000}〜）`, 'gift', gifterSays('つむぎ', e.topGifterCoins ?? 10000, '今日もがんばって！応援してます')),
        chip('長いコメント', null, () =>
          say({ text: 'はじめまして！いつも切り抜きから見ていて、今日やっと生で見られました。声がすごく落ち着くので作業用に流してます' }),
        ),
        chip('「!」のコマンド', null, () => say({ text: '!roulette' })),
        chip('コメント欄を空にする', null, control('chat', 'reset')),
      );
    } else if (tab === 'counters' || tab === 'goals' || tab === 'rankings') {
      box.append(
        chip('いいね ×20', 'heart', () => api('/api/simulate', { kind: 'like', count: 20 })),
        chip('フォロー', 'user-plus', () => api('/api/simulate', { kind: 'follow' })),
      );
    }
  }

  /** プレビュー URL キャッシュを無効にする（次の updateUrl で iframe を読み直す） */
  function resetPreviewUrl() { previewUrl = null; }

  return { currentWidget, updateUrl, fitPreview, renderActions, resetPreviewUrl };
}
