const express = require('express');
const { pool } = require('../db');
const { HttpError, asyncH, isUuid, str, num, uuid, oneOf, done } = require('../utils');
const { requireAuth, requireRole } = require('../middleware/requireAuth');

const router = express.Router();

const COLUMNS = 'id, created_at, updated_at, listing_id, buyer_id, seller_id, quantity, unit_price, total, status, coalesce(note, \'\') as note';
const shape = (r) => ({ ...r, quantity: Number(r.quantity), unit_price: Number(r.unit_price), total: Number(r.total) });

// POST /api/orders   a buyer asks for (part of) a listing. No payment is taken.
router.post('/', requireAuth, requireRole('buyer'), asyncH(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  const listing_id = uuid(errors, 'listing_id', b.listing_id, { required: true });
  const quantity = num(errors, 'quantity', b.quantity, { integer: true, min: 1, max: 1000000, required: true });
  const note = str(errors, 'note', b.note, { max: 300 });
  done(errors);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const l = (await client.query(
      'select id, seller_id, quantity, price, is_free, status from listings where id = $1 for update', [listing_id])).rows[0];
    if (!l) throw new HttpError(404, 'This listing could not be found. It may have been removed.');
    if (l.status === 'sold') throw new HttpError(409, 'This item has been sold.');
    if (l.seller_id === req.user.id) throw new HttpError(400, 'You cannot order your own listing.');
    if (quantity > l.quantity) throw new HttpError(400, `Enter a quantity between 1 and ${l.quantity}.`);
    const unitPrice = l.is_free ? 0 : Number(l.price);
    const r = await client.query(
      `insert into orders (listing_id, buyer_id, seller_id, quantity, unit_price, total, note)
       values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
      [l.id, req.user.id, l.seller_id, quantity, unitPrice, Math.round(unitPrice * quantity * 100) / 100, note || null]
    );
    await client.query('commit');
    res.status(201).json({ order: shape(r.rows[0]) });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

// Who may move an order to which status. Same rules the screens show as buttons.
const SELLER_MOVES = { requested: ['accepted', 'declined'], accepted: ['completed', 'cancelled'] };
const BUYER_MOVES = { requested: ['cancelled'], accepted: ['cancelled'] };

// PATCH /api/orders/:id   { status }   seller: accept / decline / complete / cancel; buyer: cancel.
// The listing follows along: reserved when a request for all of it is accepted, sold or reduced when completed,
// available again when a reservation falls through.
router.patch('/:id', requireAuth, asyncH(async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(400, 'The order id is not valid.');
  const errors = [];
  const status = oneOf(errors, 'status', req.body && req.body.status, ['accepted', 'declined', 'completed', 'cancelled'], { required: true });
  done(errors);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const o = (await client.query('select * from orders where id = $1 for update', [req.params.id])).rows[0];
    if (!o || (o.seller_id !== req.user.id && o.buyer_id !== req.user.id)) throw new HttpError(404, 'Order not found.');
    const moves = (o.seller_id === req.user.id ? SELLER_MOVES : BUYER_MOVES)[o.status] || [];
    if (!moves.includes(status)) throw new HttpError(409, `This order is ${o.status}, so it cannot be changed to ${status}.`);

    const l = (await client.query('select id, quantity, status from listings where id = $1 for update', [o.listing_id])).rows[0];
    const qty = Number(o.quantity);
    if (l) {
      let next = l.status, left = l.quantity;
      if (status === 'accepted' && qty >= l.quantity && l.status === 'available') next = 'reserved';
      if (status === 'completed') {
        if (qty >= l.quantity) { next = 'sold'; } else { left = l.quantity - qty; if (l.status === 'reserved') next = 'available'; }
      }
      if ((status === 'declined' || status === 'cancelled') && l.status === 'reserved') {
        const other = await client.query(
          "select 1 from orders where listing_id = $1 and id <> $2 and status = 'accepted' limit 1", [l.id, o.id]);
        if (!other.rowCount) next = 'available';
      }
      if (next !== l.status || left !== l.quantity) {
        await client.query('update listings set status = $2, quantity = $3 where id = $1', [l.id, next, left]);
      }
    }
    const upd = await client.query(
      `update orders set status = $2, updated_at = now() where id = $1 returning ${COLUMNS}`, [o.id, status]);
    const listing = l ? (await client.query('select id, quantity, status from listings where id = $1', [l.id])).rows[0] : null;
    await client.query('commit');
    res.json({ order: shape(upd.rows[0]), listing });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
