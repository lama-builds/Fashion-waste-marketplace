const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, query } = require('../db');
const { HttpError, asyncH, str, oneOf, done } = require('../utils');
const { requireAuth, issueSession, clearSession } = require('../middleware/requireAuth');

const router = express.Router();
const ROUNDS = 10; // 12 is stronger but slow on serverless; 10 is a fair balance
// Compared against when the email is unknown, so "no such user" takes as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPassword(errors, v) {
  if (typeof v !== 'string' || v.length === 0) { errors.push('password is required.'); return undefined; }
  if (v.length < 8) errors.push('password must be at least 8 characters.');
  // bcrypt only reads the first 72 bytes, so refuse longer ones instead of silently cutting them.
  else if (Buffer.byteLength(v, 'utf8') > 72) errors.push('password must be at most 72 bytes.');
  return v;
}

// POST /api/auth/register
router.post('/register', asyncH(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  const email = str(errors, 'email', b.email, { required: true, max: 254, pattern: EMAIL_RE, patternMsg: 'is not a valid email address.' });
  const password = checkPassword(errors, b.password);
  const full_name = str(errors, 'full_name', b.full_name, { required: true, min: 2, max: 80 });
  const role = oneOf(errors, 'role', b.role === undefined ? 'buyer' : b.role, ['buyer', 'seller']);
  const phone = str(errors, 'phone', b.phone, { max: 20, pattern: /^[+\d][\d\s-]{5,19}$/, patternMsg: 'is not a valid phone number.' });
  const whatsapp = str(errors, 'whatsapp_number', b.whatsapp_number, { max: 16, pattern: /^\+[1-9]\d{7,14}$/, patternMsg: 'must be in international format, like +201001234567.' });
  const city = str(errors, 'city', b.city, { max: 60 });
  done(errors);

  const password_hash = await bcrypt.hash(password, ROUNDS);
  const client = await pool.connect();
  let user;
  try {
    await client.query('begin');
    const u = await client.query(
      'insert into users (email, password_hash, role) values ($1, $2, $3) returning id, email, role',
      [email.toLowerCase(), password_hash, role]
    );
    user = u.rows[0];
    await client.query(
      'insert into profiles (id, full_name, role, phone, whatsapp_number, city) values ($1, $2, $3, $4, $5, $6)',
      [user.id, full_name, role, phone || null, whatsapp || null, city || null]
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err; // a duplicate email becomes a friendly 409 in the error handler
  } finally {
    client.release();
  }

  issueSession(res, user);
  res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, full_name } });
}));

// POST /api/auth/login
router.post('/login', asyncH(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  const email = str(errors, 'email', b.email, { required: true, max: 254 });
  if (typeof b.password !== 'string' || b.password === '' || b.password.length > 200) errors.push('password is required.');
  done(errors);

  const { rows } = await query(
    `select u.id, u.email, u.role, u.password_hash, p.full_name
       from users u left join profiles p on p.id = u.id
      where lower(u.email) = $1`,
    [email.toLowerCase()]
  );
  const user = rows[0];
  const ok = await bcrypt.compare(b.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Wrong email or password.'); // same message for both cases

  issueSession(res, user);
  res.json({ user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
}));

// GET /api/auth/me  (who is logged in? the front end calls this when the app loads)
router.get('/me', requireAuth, asyncH(async (req, res) => {
  const { rows } = await query(
    `select u.id, u.email, u.role, p.full_name
       from users u left join profiles p on p.id = u.id where u.id = $1`,
    [req.user.id]
  );
  if (!rows[0]) { clearSession(res); throw new HttpError(401, 'This account no longer exists.'); }
  res.json({ user: rows[0] });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

module.exports = router;
