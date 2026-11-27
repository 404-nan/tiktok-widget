// 使えないウィジェットの代わりに出す locked.html で、ダッシュボードの見本（?preview=1）にだけ出す理由の文を作る。
// 配信画面（OBS）では使わない。/api/me の locked（{ key, label, requiredPlanLabel, reason, pages }）と plan から決める。

/** URL のパス（/t/<鍵>/widgets/cutin.html や /widgets/quiz/index.html）から、ウィジェットのページ名（cutin.html）を取り出す */
export function pageOfPath(pathname) {
  const rest = String(pathname || '').split('/widgets/').pop() || '';
  const folder = /^([A-Za-z0-9_-]+)\/index\.html$/.exec(rest);
  return folder ? `${folder[1]}.html` : rest;
}

/**
 * 見本に出す文 { title, detail }。me が無い（読めなかった）ときも、空白にせず短い文を返す。
 * 停止中 → プランに入っていない → 管理者が止めている、の順に見る。
 */
export function lockedReason(me, page) {
  const plan = me && me.plan ? me.plan : null;
  const locked = me && Array.isArray(me.locked) ? me.locked : [];
  const lock = locked.find((item) => item.kind !== 'capability' && Array.isArray(item.pages) && item.pages.includes(page)) || null;
  const contact = plan && plan.contactNote ? plan.contactNote : 'くわしくは LuL にご連絡ください。';
  const obsNote = '配信画面には何も出ません（見ている人には空白のままです）。';
  if ((lock && lock.reason === 'stopped') || (plan && plan.status === 'suspended' && plan.enforcementOn)) {
    return { title: 'いまは配信画面を止めています', detail: `お支払いの確認が取れていません。${contact} ${obsNote}` };
  }
  if (lock && lock.reason === 'plan' && lock.requiredPlanLabel) {
    const now = plan ? `いまは${plan.label}プランです。` : '';
    return { title: `「${lock.label}」は ${lock.requiredPlanLabel} プランで使えます`, detail: `${now}${obsNote}` };
  }
  if (lock) {
    return { title: `「${lock.label}」はいまは使えないようになっています`, detail: `${contact} ${obsNote}` };
  }
  return { title: 'このウィジェットはいまは使えません', detail: `${contact} ${obsNote}` };
}
