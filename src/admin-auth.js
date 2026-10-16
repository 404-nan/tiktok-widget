import crypto from 'node:crypto';

export function adminGuard(token) {
  const expected = String(token ?? '');
  return (req, res, next) => {
    const actual = req.get('x-admin-token');
    if (typeof actual === 'string' && actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return next();
    return res.status(401).json({ error: '合言葉が違います' });
  };
}

