/** ギフトした人の名前。なければ空（手動では出さない）。呼び出し側は textContent で入れて XSS を防ぐ */

export function giftUserName(trigger) {
  const name = trigger?.user?.name;
  return typeof name === 'string' && name ? name : '';
}
