// public/ の静的ファイルを「使う前に必ず新しいか確かめる」応答にする部品。
// no-cache でも ETag は残るため、変わっていないファイルは 304 で軽く返せる。

export function setNoCacheHeader(res) {
  res.setHeader('Cache-Control', 'no-cache');
}

export const PUBLIC_STATIC_OPTIONS = {
  setHeaders: setNoCacheHeader,
};
