import crypto from 'crypto';

export const CSRF_COOKIE_NAME = 'csrfToken';

const isProduction = process.env.NODE_ENV === 'production';

export const csrfCookieOptions = {
  httpOnly: false,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000
};

export function createCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.get('X-CSRF-Token');

  if (
    typeof cookieToken !== 'string'
    || typeof headerToken !== 'string'
    || cookieToken.length !== headerToken.length
  ) {
    return res.status(403).json({ message: 'Virheellinen tai puuttuva CSRF-token' });
  }

  const tokensMatch = crypto.timingSafeEqual(
    Buffer.from(cookieToken, 'utf8'),
    Buffer.from(headerToken, 'utf8')
  );

  if (!tokensMatch) {
    return res.status(403).json({ message: 'Virheellinen tai puuttuva CSRF-token' });
  }

  next();
}
