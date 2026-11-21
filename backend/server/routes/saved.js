const express = require('express');
const { query } = require('../db');
const { HttpError, asyncH, isUuid } = require('../utils');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// PUT /api/saved/:listingId     save a listing (saving twice is fine)
router.put('/:listingId', requireAuth, asyncH(async (req, res) => {
  if (!isUuid(req.params.listingId)) throw new HttpError(400, 'The listing id is not valid.');
  const l = await query('select 1 from listings where id = $1', [req.params.listingId]);
  if (!l.rowCount) throw new HttpError(404, 'This listing could not be found.');
  const { rows } = await query(
    `insert into saved_listings (user_id, listing_id) values ($1, $2)
     on conflict (user_id, listing_id) do update set user_id = excluded.user_id
     returning id, created_at, user_id, listing_id`, [req.user.id, req.params.listingId]);
  res.json({ saved: rows[0] });
}));

// DELETE /api/saved/:listingId  remove it from your saved items
router.delete('/:listingId', requireAuth, asyncH(async (req, res) => {
  if (!isUuid(req.params.listingId)) throw new HttpError(400, 'The listing id is not valid.');
  await query('delete from saved_listings where user_id = $1 and listing_id = $2', [req.user.id, req.params.listingId]);
  res.status(204).end();
}));

module.exports = router;
