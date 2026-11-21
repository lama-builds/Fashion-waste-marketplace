const express = require('express');
const { query } = require('../db');
const { HttpError, asyncH, str, oneOf, done } = require('../utils');
const { requireAuth } = require('../middleware/requireAuth');
const { pool } = require('../db');
const { JPEG_URI, MAX_AVATAR_CHARS, AVATAR_SQL } = require('../media');

const router = express.Router();

const PROFILE_SQL = `select u.id, u.email, u.role, u.created_at, p.full_name, p.phone, p.whatsapp_number, p.city, ${AVATAR_SQL} as avatar_url
                       from users u left join profiles p on p.id = u.id where u.id = $1`;

// GET /api/profiles/me
router.get('/me', requireAuth, asyncH(async (req, res) => {
  const { rows } = await query(PROFILE_SQL, [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Profile not found.');
  res.json(rows[0]);
}));

// PATCH /api/profiles/me   change your own details and your role (buyer or seller). The email cannot be changed here.
// Send null or "" to clear phone, whatsapp_number, city or avatar_url.
// avatar_url is a small JPEG data URI sent by the page (or null to remove the picture); leave it out to keep the current one.
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
  };
  Object.keys(optional).forEach((f) => {
    if (b[f] === undefined) return;
    clean[f] = blank(b[f]) ? null : str(errors, f, b[f], optional[f]);
  });
  if (b.avatar_url !== undefined) {
    if (blank(b.avatar_url)) clean.avatar_url = null;
    else if (typeof b.avatar_url === 'string' && b.avatar_url.length <= MAX_AVATAR_CHARS && JPEG_URI.test(b.avatar_url)) clean.avatar_url = b.avatar_url;
    else errors.push('avatar_url must be a small JPEG picture (about 60 KB at most).');
  }
  const role = oneOf(errors, 'role', b.role, ['buyer', 'seller']);
  done(errors);

  const columns = Object.keys(clean); // only whitelisted names ever reach the SQL text
  if (!columns.length && !role) throw new HttpError(400, 'Nothing to update. Send full_name, role, phone, whatsapp_number, city or avatar_url.');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const cur = (await client.query(
      'select u.role, p.whatsapp_number from users u join profiles p on p.id = u.id where u.id = $1 for update of u', [req.user.id])).rows[0];
    if (!cur) throw new HttpError(404, 'Profile not found.');

    if (role && role !== cur.role) {
      if (role === 'buyer') {
        // A seller with items still on sale cannot become a buyer until those are sold or removed.
        const live = (await client.query("select count(*)::int as n from listings where seller_id = $1 and status <> 'sold'", [req.user.id])).rows[0].n;
        if (live) throw new HttpError(409, `You still have ${live} listing${live > 1 ? 's' : ''} that are not sold. Mark them as sold or delete them in My listings before switching to Buyer.`);
      }
      await client.query('update users set role = $2 where id = $1', [req.user.id, role]);
      clean.role = role;
    }
    const finalRole = role || cur.role;
    const finalWa = clean.whatsapp_number !== undefined ? clean.whatsapp_number : cur.whatsapp_number;
    if (finalRole === 'seller' && !finalWa) throw new HttpError(400, 'Sellers need a WhatsApp number so buyers can reach them.');

    const keys = Object.keys(clean);
    if (keys.length) {
      const sets = keys.map((c, i) => `${c} = $${i + 2}`).join(', ');
      await client.query(`update profiles set ${sets} where id = $1`, [req.user.id, ...keys.map((c) => clean[c])]);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await query(PROFILE_SQL, [req.user.id]);
  res.json(rows[0]);
}));

module.exports = router;
