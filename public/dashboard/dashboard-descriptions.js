// ダッシュボードの短い説明と、かんたん・くわしい表示の説明文の選択をまとめる。
// simple.js と editor.js が同じ説明を使い、フォーム用モジュールへ逆向きに依存しない。
export const ROULETTE_DESCRIPTION = 'ルーレットが何個あっても、入れるのはこの1本です。ギフトが来たルーレットが順番に出ます';

export function widgetDescription(simpleMode, tab, info, definition) {
  return simpleMode ? (info[tab]?.desc ?? definition.desc) : definition.desc;
}
