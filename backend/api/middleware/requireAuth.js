const jwt = require('jsonwebtoken');
const { HttpError } = require('../utils');
const { query } = require('../db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET is missing or too short. Use at least 32 random characters.');
}

const COOKIE = 'token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,                                   // JavaScript in the page cannot read it
  secure: process.env.NODE_ENV === 'production',    // HTTPS only on Vercel
  sameSite: 'lax',
  path: '/',
};

function issueSession(res, user) {
  const token = jwt.sign({ role: user.role }, SECRET, { subject: user.id, expiresIn: '7d', algorithm: 'HS256' });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SEVEN_DAYS_MS });
}

function clearSession(res) {
  res.clearCookie(COOKIE, cookieOptions);
}

function readToken(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  return { id: payload.sub, role: payload.role };
}

// Blocks the request unless the user is logged in.
function requireAuth(req, res, next) {
  try {
    const user = readToken(req);
    if (!user) throw new HttpError(401, 'Please log in first.');
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(401, 'Your session has expired. Please log in again.'));
  }
}

// Lets the request through either way; sets req.user only when a valid token is present.
function optionalAuth(req, res, next) {
  try { req.user = readToken(req) || undefined; } catch (e) { req.user = undefined; }
  next();
}

// Use after requireAuth: requireRole('seller')
// The role is read from the database, not from the token, so a role change (or the 'both' -> buyer/seller
// migration) applies at once and an old 7-day token cannot keep an outdated role.
const requireRole = (...roles) => async (req, res, next) => {
  try {
    if (!req.user) return next(new HttpError(401, 'Please log in first.'));
    const { rows } = await query('select role from users where id = $1', [req.user.id]);
    const role = rows[0] && rows[0].role;
    if (!role) return next(new HttpError(401, 'Your session has expired. Please log in again.'));
    req.user.role = role;
    if (!roles.includes(role)) return next(new HttpError(403, `This action needs a ${roles.join(' or ')} account.`));
    next();
  } catch (err) { next(err); }
};

module.exports = { requireAuth, optionalAuth, requireRole, issueSession, clearSession };
