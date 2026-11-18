const express = require('express');
const { query } = require('../db');
const { HttpError, asyncH, str, done } = require('../utils');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const PROFILE_SQL = `select u.id, u.email, u.role, u.created_at, p.full_name, p.phone, p.whatsapp_number, p.city, p.avatar_url
                       from users u left join profiles p on p.id = u.id where u.id = $1`;

// GET /api/profiles/me
router.get('/me', requireAuth, asyncH(async (req, res) => {
  const { rows } = await query(PROFILE_SQL, [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Profile not found.');
  res.json(rows[0]);
}));

// PATCH /api/profiles/me   change your own details (role and email cannot be changed here)
// Send null or "" to clear phone, whatsapp_number, city or avatar_url.
router.patch('/me', requireAuth, asyncH(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  const clean = {};
  const blank = (v) => v === null || (typeof v === 'string' && v.trim() === '');

  if (b.full_name !== undefined) clean.full_name = str(errors, 'full_name', b.full_name, { required: true, min: 2, max: 80 });
  const optional = {
    phone: { max: 20, pattern: /^[+\d][\d\s-]{5,19}$/, patternMsg: 'is not a valid phone number.' },
    whatsapp_number: { max: 16, pattern: /^\+[1-9]\d{7,14}$/, patternMsg: 'must be in international format, like +201001234567.' },
    city: { max: 60 },
    avatar_url: { max: 500 },
  };
  Object.keys(optional).forEach((f) => {
    if (b[f] === undefined) return;
    clean[f] = blank(b[f]) ? null : str(errors, f, b[f], optional[f]);
  });
  done(errors);

  const columns = Object.keys(clean); // only whitelisted names ever reach the SQL text
  if (!columns.length) throw new HttpError(400, 'Nothing to update. Send full_name, phone, whatsapp_number, city or avatar_url.');
  const sets = columns.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const result = await query(`update profiles set ${sets} where id = $1`, [req.user.id, ...columns.map((c) => clean[c])]);
  if (!result.rowCount) throw new HttpError(404, 'Profile not found.');

  const { rows } = await query(PROFILE_SQL, [req.user.id]);
  res.json(rows[0]);
}));

module.exports = router;
