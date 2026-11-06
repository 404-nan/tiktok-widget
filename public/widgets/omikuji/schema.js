// おみくじの設定定義への入口。正本は src/schema.js の SCHEMA.omikuji（この部品はガチャの仕組みを土台にしている）。
// 外部へ書き出すときは、書き出し側でこの中身を実体化して同梱する。
export { SCHEMA as _schemaRef } from "../../../src/schema.js";
export const section = "omikuji";
