// 詳細設定画面で、設定を置く折りたたみを作る条件をまとめる。
// editor.js が使い、レビュー時にも画面の分岐を同じ条件で検査できるようにする。
export function shouldRenderDetails({ tab, restCount, streamDeckUrlCount }) {
  return restCount > 0 || streamDeckUrlCount > 0 || tab === 'roulettes';
}
