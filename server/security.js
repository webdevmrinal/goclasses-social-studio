// Copyright (c) 2026 Mrinal. All rights reserved.
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
export function createSecurity({ password = '', origin = '', secureCookie = false } = {}) {
  const sessions = new Map();
  const hash = value => createHash('sha256').update(value).digest();
  const expected = hash(password);
  const authenticated = req => {
    if (!password) return true;
    const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('studio_session='))?.slice(15);
    const expires = sessions.get(token);
    if (!expires || expires < Date.now()) { sessions.delete(token); return false; }
    return true;
  };
  function requireAuth(req, res, next) {
    if (!authenticated(req)) return res.status(401).json({ error: 'Sign in to your company workspace.' });
    next();
  }
  function checkOrigin(req, res, next) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = origin || `${req.protocol}://${req.get('host')}`;
      // API clients must also present an origin. This prevents cross-site form submissions.
      if (req.get('origin') !== allowed) return res.status(403).json({ error: 'Request origin is not allowed. Set APP_ORIGIN to your exact workspace URL.' });
      if (!req.is('application/json') && !req.is('multipart/form-data')) return res.status(415).json({ error: 'Use JSON or multipart form data.' });
    }
    next();
  }
  function login(req, res) {
    if (typeof req.body.password !== 'string' || !timingSafeEqual(hash(req.body.password), expected)) return res.status(401).json({ error: 'That workspace password is incorrect.' });
    for (const [token, expires] of sessions) if (expires < Date.now()) sessions.delete(token);
    if (sessions.size > 1000) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
    res.cookie('studio_session', token, { httpOnly: true, sameSite: 'strict', secure: secureCookie, maxAge: 12 * 60 * 60 * 1000, path: '/' });
    res.json({ ok: true });
  }
  function logout(req, res) {
    const token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('studio_session='))?.slice(15);
    sessions.delete(token);
    res.clearCookie('studio_session', { path: '/', secure: secureCookie, sameSite: 'strict', httpOnly: true });
    res.json({ ok: true });
  }
  return { authenticated, requireAuth, checkOrigin, login, logout, enabled: Boolean(password) };
}
