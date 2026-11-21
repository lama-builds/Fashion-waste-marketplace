const express = require('express');
const { query } = require('../db');
const { asyncH, str, num, done } = require('../utils');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
const FABRICS = ['cotton', 'polyester', 'denim', 'linen', 'viscose', 'wool', 'satin', 'jersey', 'leather', 'terry', 'other'];
const CONDITIONS = ['new', 'like new', 'used', 'damaged'];

// PUT /api/preferences   save what the logged-in buyer is looking for (used by Smart matching)
router.put('/', requireAuth, asyncH(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  const project = str(errors, 'project', b.project, { max: 40 }) || null;
  const list = (name, v, allowed) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > 20 || v.some((x) => !allowed.includes(x))) { errors.push(`${name} has an invalid value.`); return []; }
    return [...new Set(v)];
  };
  const fabrics = list('fabrics', b.fabrics, FABRICS);
  const conditions = list('conditions', b.conditions, CONDITIONS);
  const maxPrice = num(errors, 'maxPrice', b.maxPrice === '' ? undefined : b.maxPrice, { min: 0, max: 99999999 });
  const minQty = num(errors, 'minQty', b.minQty === '' ? undefined : b.minQty, { min: 0, max: 1000000000 });
  const city = str(errors, 'city', b.city, { max: 60 }) || null;
  done(errors);

  await query(
    `insert into buyer_preferences (user_id, project, fabrics, max_price, min_qty, city, conditions)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id) do update set project = excluded.project, fabrics = excluded.fabrics,
       max_price = excluded.max_price, min_qty = excluded.min_qty, city = excluded.city, conditions = excluded.conditions`,
    [req.user.id, project, fabrics, maxPrice ?? null, minQty ?? null, city, conditions]
  );
  res.json({ ok: true });
}));

module.exports = router;
