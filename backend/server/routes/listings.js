const express = require('express');
const { pool, query } = require('../db');
const { HttpError, asyncH, isUuid, str, num, oneOf, uuid, done } = require('../utils');
const { requireAuth, optionalAuth, requireRole } = require('../middleware/requireAuth');
const { JPEG_URI, MAX_PHOTO_CHARS } = require('../media');

const router = express.Router();
const UNITS = ['meters', 'kg', 'pieces'];
const CONDITIONS = ['new', 'like new', 'used', 'damaged'];
const STATUSES = ['available', 'reserved', 'sold'];
const FABRICS = ['cotton', 'polyester', 'denim', 'linen', 'viscose', 'wool', 'satin', 'jersey', 'leather', 'terry', 'other'];

// Shared SQL pieces
const COVER = `(select case when ph.image_url like 'data:%' then '/api/photos/' || ph.id else ph.image_url end from listing_photos ph where ph.listing_id = l.id order by ph.position, ph.created_at limit 1) as cover_image`;
const CARD_COLUMNS = `l.id, l.created_at, l.title, l.description, l.quantity, l.unit, l.price, l.is_free,
  l.condition, l.city, l.status, l.category_id, l.fabric_type, c.name as category_name, ${COVER}`;

// numeric comes back from pg as text ("30.00"); the front end wants a number
const shape = (row) => ({ ...row, price: row.price === null ? null : Number(row.price) });

// Checks a complete listing and returns clean values. Used by create (POST) and edit (PATCH).
function validateListing(b) {
  const errors = [];
  const out = {
    title: str(errors, 'title', b.title, { required: true, min: 2, max: 80 }),
    description: str(errors, 'description', b.description, { max: 600 }) ?? null,
    category_id: uuid(errors, 'category_id', b.category_id, { required: true }),
    fabric_type: oneOf(errors, 'fabric_type', b.fabric_type === undefined ? 'other' : b.fabric_type, FABRICS),
    quantity: num(errors, 'quantity', b.quantity, { integer: true, min: 1, max: 1000000, required: true }),
    unit: oneOf(errors, 'unit', b.unit === undefined ? 'pieces' : b.unit, UNITS),
    condition: oneOf(errors, 'condition', b.condition, CONDITIONS, { required: true }),
    city: str(errors, 'city', b.city, { required: true, max: 60 }),
  };
  if (b.is_free !== undefined && typeof b.is_free !== 'boolean') errors.push('is_free must be true or false.');
  out.is_free = b.is_free === true;
  if (out.is_free) {
    out.price = null; // a free item has no price (matches the database rule)
  } else {
    const p = num(errors, 'price', b.price, { min: 0.01, max: 99999999.99, required: true });
    out.price = p === undefined ? undefined : Math.round(p * 100) / 100;
  }
  done(errors);
  return out;
}

// ---------------------------------------------------------------------------
// GET /api/listings   public marketplace list (available items only)
// Filters: q, category_id, city, condition, is_free, min_price, max_price, sort, limit, offset
router.get('/', asyncH(async (req, res) => {
  const q = req.query;
  const errors = [];
  const search = str(errors, 'q', q.q, { max: 80 });
  const category_id = uuid(errors, 'category_id', q.category_id);
  const city = str(errors, 'city', q.city, { max: 60 });
  const condition = oneOf(errors, 'condition', q.condition, CONDITIONS);
  const minPrice = num(errors, 'min_price', q.min_price, { min: 0 });
  const maxPrice = num(errors, 'max_price', q.max_price, { min: 0 });
  const sort = oneOf(errors, 'sort', q.sort, ['new', 'price_low', 'price_high']) || 'new';
  const limit = num(errors, 'limit', q.limit, { integer: true, min: 1, max: 50 }) ?? 20;
  const offset = num(errors, 'offset', q.offset, { integer: true, min: 0, max: 100000 }) ?? 0;
  if (q.is_free !== undefined && !['true', 'false'].includes(q.is_free)) errors.push('is_free must be true or false.');
  done(errors);

  const where = ["l.status = 'available'"];
  const params = [];
  // {p} becomes $1, $2 ... so values are always sent as parameters, never pasted into the SQL
  const add = (sql, value) => {
    params.push(value);
    const n = params.length;
    where.push(sql.replace(/\{p\}/g, () => '$' + n));
  };
  if (search) add("(l.title ilike {p} or coalesce(l.description, '') ilike {p})", `%${search.replace(/[\\%_]/g, '\\$&')}%`);
  if (category_id) add('l.category_id = {p}', category_id);
  if (city) add('lower(l.city) = lower({p})', city);
  if (condition) add('l.condition = {p}', condition);
  if (q.is_free !== undefined) add('l.is_free = {p}', q.is_free === 'true');
  if (minPrice !== undefined) add('l.price >= {p}', minPrice);
  if (maxPrice !== undefined) add('l.price <= {p}', maxPrice);

  const ORDER = {
    new: 'l.created_at desc',
    price_low: 'coalesce(l.price, 0) asc, l.created_at desc',
    price_high: 'coalesce(l.price, 0) desc, l.created_at desc',
  }[sort];
  const whereSql = where.join(' and ');

  const total = await query(`select count(*) from listings l where ${whereSql}`, params);
  const { rows } = await query(
    `select ${CARD_COLUMNS}, p.full_name as seller_name
       from listings l
       join categories c on c.id = l.category_id
       left join profiles p on p.id = l.seller_id
      where ${whereSql}
      order by ${ORDER}
      limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json({ items: rows.map(shape), total: Number(total.rows[0].count), limit, offset });
}));

// ---------------------------------------------------------------------------
// GET /api/listings/mine   the logged-in user's own listings, every status ("My listings" page)
// Must stay above "/:id", otherwise "mine" would be read as an id.
router.get('/mine', requireAuth, asyncH(async (req, res) => {
  const { rows } = await query(
    `select ${CARD_COLUMNS}
       from listings l join categories c on c.id = l.category_id
      where l.seller_id = $1
      order by l.created_at desc`,
    [req.user.id]
  );
  res.json({ items: rows.map(shape) });
}));

// ---------------------------------------------------------------------------
// GET /api/listings/:id   one listing with photos. The seller's WhatsApp number is only shown to logged-in users.
router.get('/:id', optionalAuth, asyncH(async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(400, 'The listing id is not valid.');
  const { rows } = await query(
    `select l.id, l.created_at, l.title, l.description, l.quantity, l.unit, l.price, l.is_free,
            l.condition, l.city, l.status, l.category_id, l.fabric_type, l.seller_id, c.name as category_name,
            p.full_name as seller_name, p.city as seller_city, p.whatsapp_number as seller_whatsapp,
            u.created_at as seller_since
       from listings l
       join categories c on c.id = l.category_id
       left join profiles p on p.id = l.seller_id
       left join users u on u.id = l.seller_id
      where l.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Listing not found. It may have been removed.');
  const photos = await query(
    "select id, case when image_url like 'data:%' then '/api/photos/' || id else image_url end as image_url, position from listing_photos where listing_id = $1 order by position, created_at",
    [req.params.id]
  );
  const { seller_id, seller_whatsapp, ...listing } = shape(rows[0]);
  res.json({
    ...listing,
    is_owner: !!req.user && req.user.id === seller_id,
    seller_whatsapp: req.user ? seller_whatsapp : null,
    photos: photos.rows,
  });
}));

// ---------------------------------------------------------------------------
// POST /api/listings   create a listing (sellers only). Optional "photos": up to 4 storage paths.
router.post('/', requireAuth, requireRole('seller'), asyncH(async (req, res) => {
  const b = req.body || {};
  const v = validateListing(b);

  const errors = [];
  let photos = [];
  if (b.photos !== undefined) {
    if (!Array.isArray(b.photos) || b.photos.length > 4) errors.push('photos must be a list of at most 4 pictures.');
    else {
      // each photo is either a small JPEG data URI sent by the page, or a storage path like "listings/abc.jpg"
      const okPhoto = (p) => typeof p === 'string' && (
        (p.length <= MAX_PHOTO_CHARS && JPEG_URI.test(p)) || (/^[\w\-./]{1,500}$/.test(p) && !p.includes('..')));
      photos = b.photos.filter(okPhoto);
      if (photos.length !== b.photos.length) errors.push('Each photo must be a JPEG picture of at most about 300 KB.');
    }
  }
  done(errors);

  const client = await pool.connect();
  let listing;
  try {
    await client.query('begin');
    const r = await client.query(
      `insert into listings (seller_id, category_id, fabric_type, title, description, quantity, unit, price, is_free, condition, city)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id, created_at, seller_id, title, description, quantity, unit, price, is_free, condition, city, status, category_id, fabric_type`,
      [req.user.id, v.category_id, v.fabric_type || 'other', v.title, v.description, v.quantity, v.unit, v.price, v.is_free, v.condition, v.city]
    );
    listing = r.rows[0];
    listing.photos = [];
    for (let i = 0; i < photos.length; i++) {
      const ph = await client.query(
        'insert into listing_photos (listing_id, image_url, position) values ($1, $2, $3) returning id, created_at, listing_id, position, image_url', [listing.id, photos[i], i]);
      const row = ph.rows[0];
      listing.photos.push({ ...row, image_url: row.image_url.startsWith('data:') ? '/api/photos/' + row.id : row.image_url });
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json(shape(listing));
}));

// ---------------------------------------------------------------------------
// PATCH /api/listings/:id   edit your own listing, including its status (available / reserved / sold)
router.patch('/:id', requireAuth, asyncH(async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(400, 'The listing id is not valid.');
  const b = req.body || {};
  const FIELDS = ['title', 'description', 'category_id', 'fabric_type', 'quantity', 'unit', 'condition', 'city', 'price', 'is_free', 'status'];
  const sent = FIELDS.filter((f) => b[f] !== undefined);
  if (!sent.length) throw new HttpError(400, `Nothing to update. Send at least one of: ${FIELDS.join(', ')}.`);

  // The "and seller_id = $2" makes sure you can only touch your own listing.
  const cur = await query(
    `select title, description, category_id, fabric_type, quantity, unit, condition, city, price, is_free, status
       from listings where id = $1 and seller_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!cur.rows[0]) throw new HttpError(404, 'Listing not found, or it is not yours.');

  // Merge the changes into the current values, then check the whole listing again.
  const merged = { ...shape(cur.rows[0]) };
  sent.forEach((f) => { merged[f] = b[f]; });
  const v = validateListing(merged);
  const errors = [];
  const status = oneOf(errors, 'status', merged.status, STATUSES, { required: true });
  done(errors);

  const { rows } = await query(
    `update listings
        set title = $3, description = $4, category_id = $5, quantity = $6, unit = $7,
            condition = $8, city = $9, price = $10, is_free = $11, status = $12, fabric_type = $13
      where id = $1 and seller_id = $2
      returning id, created_at, seller_id, title, description, quantity, unit, price, is_free, condition, city, status, category_id, fabric_type`,
    [req.params.id, req.user.id, v.title, v.description, v.category_id, v.quantity, v.unit, v.condition, v.city, v.price, v.is_free, status, v.fabric_type || 'other']
  );
  res.json(shape(rows[0]));
}));

// ---------------------------------------------------------------------------
// DELETE /api/listings/:id   delete your own listing (its photo rows go with it)
router.delete('/:id', requireAuth, asyncH(async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(400, 'The listing id is not valid.');
  const { rowCount } = await query('delete from listings where id = $1 and seller_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Listing not found, or it is not yours.');
  res.status(204).end();
}));

module.exports = router;
