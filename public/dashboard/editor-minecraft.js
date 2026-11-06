// editor.js のマイクラ連携セクション。パネル・状態表示・コマンドログ。
import { icon, giftLabel } from '/widgets/lib/overlay.js';

const $ = (id) => document.getElementById(id);

export function buildMinecraft(ctx) {
  const mcLog = [];
  let mcStatus = null;

  function renderSide() {
    const col = $('previewCol');
    let panel = $('mcPanel');
    if (ctx.tab() !== 'minecraft') {
      col.classList.remove('mc-mode');
      if (panel) panel.hidden = true;
      return;
    }
    col.classList.add('mc-mode');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mcPanel';
      panel.className = 'stack mc-panel';
      col.prepend(panel);
    }
    panel.hidden = false;
    panel.replaceChildren();

    const status = document.createElement('div');
    status.className = 'status mc-status';
    status.id = 'mcStatus';
    if (ctx.isTenant()) {
      const line = document.createElement('p');
      line.className = 'desc';
      const clock = (iso) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
      const day = (iso) => {
        const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
        const target = fmt.format(new Date(iso));
        const today = fmt.format(new Date());
        const tomorrow = fmt.format(new Date(Date.now() + 24 * 3600_000));
        return target === today ? '今日' : target === tomorrow ? '明日' : target.slice(5).replace('-', '/');
      };
      const me = ctx.me();
      if (me.rental?.now) line.textContent = `いまあなたの枠です（${clock(me.rental.now.until)} まで）。マイクラのサーバーは用意されています`;
      else if (me.rental?.next) line.textContent = `次の枠: ${day(me.rental.next.start)} ${clock(me.rental.next.start)}〜${clock(me.rental.next.end)}`;
      else line.textContent = '予約はありません';
      panel.append(line);
      return;
    }

    const head = document.createElement('div');
    head.className = 'row wrap';
    head.append(status, ctx.chip('接続を確認', 'plug', async () => renderMcStatus(await ctx.api('/api/minecraft/check', {}))));
    panel.append(head);

    const form = document.createElement('form');
    form.className = 'url-row';
    const input = document.createElement('input');
    input.placeholder = 'コマンドを試す（例: list / ss status）';
    input.className = 'mono';
    const send = document.createElement('button');
    send.className = 'btn primary pressable';
    send.type = 'submit';
    send.append(icon('send'), '送る');
    form.append(input, send);
    const out = document.createElement('pre');
    out.className = 'code';
    out.hidden = true;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!input.value.trim()) return;
      out.hidden = false;
      try {
        const r = await ctx.api('/api/minecraft/command', { command: input.value.trim() });
        out.textContent = r.response || '（返事なし）';
      } catch (err) {
        out.textContent = err.message;
      }
    });
    panel.append(form, out);

    // マイクラ側の演出プロフィールに設定済みの演出
    const ssBox = document.createElement('div');
    ssBox.className = 'field';
    const ssLabel = document.createElement('span');
    ssLabel.className = 'field-label';
    ssLabel.textContent = 'マイクラ側の演出プロフィール（押すと試せます）';
    ssBox.append(ssLabel);
    const ss = ctx.superstream();
    if (ss.error) {
      const p = document.createElement('span');
      p.className = 'hint';
      p.textContent = ss.error;
      ssBox.append(p);
    }
    const ssList = document.createElement('div');
    ssList.className = 'ss-list';
    for (const g of ss.gifts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ss-item pressable';
      const idEl = document.createElement('span');
      idEl.className = 'num';
      idEl.textContent = g.id;
      const name = document.createElement('span');
      name.textContent = g.name ? giftLabel({ id: g.id, name: g.name }) : '';
      const acts = document.createElement('span');
      acts.className = 'hint';
      acts.textContent = g.actions.join('・');
      b.append(idEl, name, acts);
      b.addEventListener('click', async () => {
        out.hidden = false;
        const profile = ctx.payload().config.minecraft.superstreamProfile;
        try {
          const r = await ctx.api('/api/minecraft/command', { command: `ss test profile ${profile} ${g.id}` });
          out.textContent = r.response || `ss test profile ${profile} ${g.id} を送りました`;
        } catch (err) {
          out.textContent = err.message;
        }
      });
      ssList.append(b);
    }
    ssBox.append(ssList);
    panel.append(ssBox);

    const logBox = document.createElement('div');
    logBox.className = 'field';
    const logLabel = document.createElement('span');
    logLabel.className = 'field-label';
    logLabel.textContent = '送ったコマンド';
    const log = document.createElement('ol');
    log.className = 'log mc-log';
    log.id = 'mcLog';
    logBox.append(logLabel, log);
    panel.append(logBox);
    renderMcStatus(mcStatus);
    renderMcLog();
  }

  function renderMcStatus(st) {
    if (st) mcStatus = st;
    const el = $('mcStatus');
    if (!el || !mcStatus) return;
    el.dataset.mode = { ok: 'live', error: 'error', off: 'idle' }[mcStatus.state] ?? 'idle';
    el.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot' }), mcStatus.message ?? '');
  }

  function renderMcLog() {
    const el = $('mcLog');
    if (!el) return;
    el.replaceChildren(
      ...mcLog.slice(0, 30).map((l) => {
        const li = document.createElement('li');
        const t = document.createElement('span');
        t.className = 'time';
        t.textContent = new Date(l.ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const c = document.createElement('span');
        c.className = `text mono ${l.ok ? '' : 'fail'}`;
        c.textContent = l.command;
        c.title = l.response ?? '';
        li.append(t, icon(l.ok ? 'check' : 'x'), c);
        return li;
      }),
    );
    if (!mcLog.length) el.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'まだ送っていません' }));
  }

  function onMinecraft(msg) {
    renderMcStatus(msg.status);
    if (msg.log) {
      mcLog.unshift(msg.log);
      mcLog.length = Math.min(mcLog.length, 100);
      renderMcLog();
    }
  }

  return { mcLog, renderSide, renderMcStatus, renderMcLog, onMinecraft, setMcStatus(st) { mcStatus = st; } };
}
