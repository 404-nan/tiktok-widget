import crypto from 'node:crypto';

export function adminGuard(token) {
  const expected = Buffer.from(String(token ?? ''));
  return (req, res, next) => {
    const header = req.get('x-admin-token');
    const actual = typeof header === 'string' ? Buffer.from(header) : null;
    if (actual?.length === expected.length && crypto.timingSafeEqual(actual, expected)) return next();
    console.warn('[admin] adminGuard: 合言葉が違います');
    return res.status(401).json({ error: '合言葉が違います' });
  };
}
