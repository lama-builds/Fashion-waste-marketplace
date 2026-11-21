const express = require('express');
const { query } = require('../db');
const { asyncH, isUuid } = require('../utils');
const { optionalAuth } = require('../middleware/requireAuth');
const { AVATAR_SQL } = require('../media');

const router = express.Router();

const num = (v) => (v === null || v === undefined ? null : Number(v));
const listingOut = (r) => ({ ...r, price: num(r.price) });
const orderOut = (r) => ({ ...r, quantity: Number(r.quantity), unit_price: Number(r.unit_price), total: Number(r.total) });

// GET /api/bootstrap[?listing=<id>]
// Everything the front end needs in one request, so its pages can work without waiting on many calls:
// categories, available listings (plus the ones that matter to you), their photos and sellers,
// and, when logged in, your own orders, saved items and preferences.
// Other people's contact details are only included for logged-in visitors. Other people's orders are
// never included: "impact" and "feed" hold anonymous figures only (no names, no ids of people).
router.get('/', optionalAuth, asyncH(async (req, res) => {
  const uid = req.user ? req.user.id : null;
  const wanted = isUuid(req.query.listing) ? req.query.listing : null;

  const me = uid
    ? (await query(
        `select u.id, u.email, u.role, u.created_at, p.full_name, p.phone, p.whatsapp_number, p.city, ${AVATAR_SQL} as avatar_url
           from users u left join profiles p on p.id = u.id where u.id = $1`, [uid])).rows[0] || null
    : null;

  const categories = (await query('select id, created_at, name from categories order by name')).rows;

  const listings = (await query(
    `with ids as (
        select id from (select id from listings where status = 'available' order by created_at desc limit 300) a
        union select id from listings where seller_id = $1::uuid
        union select listing_id from orders where buyer_id = $1::uuid or seller_id = $1::uuid
        union select listing_id from saved_listings where user_id = $1::uuid
        union select listing_id from (select listing_id from orders where status = 'completed' order by updated_at desc limit 500) c
        union select listing_id from (select listing_id from orders order by updated_at desc limit 6) f
        union select $2::uuid
     )
     select l.id, l.created_at, l.seller_id, l.category_id, l.fabric_type, l.title, l.description, l.quantity, l.unit,
            l.price, l.is_free, l.condition, l.city, l.status
       from listings l where l.id in (select id from ids) order by l.created_at desc`, [uid, wanted])).rows.map(listingOut);

  const listingIds = listings.map((l) => l.id);
  const photos = listingIds.length
    ? (await query(
        `select id, created_at, listing_id, position,
                case when image_url like 'data:%' then '/api/photos/' || id else image_url end as image_url
           from listing_photos where listing_id = any($1::uuid[]) order by listing_id, position, created_at`, [listingIds])).rows
    : [];

  const orders = uid
    ? (await query(
        `select id, created_at, updated_at, listing_id, buyer_id, seller_id, quantity, unit_price, total, status, coalesce(note, '') as note
           from orders where buyer_id = $1 or seller_id = $1 order by created_at desc`, [uid])).rows.map(orderOut)
    : [];

  const profileIds = new Set(listings.map((l) => l.seller_id));
  orders.forEach((o) => { profileIds.add(o.buyer_id); profileIds.add(o.seller_id); });
  if (uid) profileIds.add(uid);
  const profiles = profileIds.size
    ? (await query(
        `select u.id, u.created_at, p.full_name, u.role, p.city, ${AVATAR_SQL} as avatar_url,
                case when $2::boolean then p.phone end as phone,
                case when $2::boolean then p.whatsapp_number end as whatsapp_number
           from users u join profiles p on p.id = u.id where u.id = any($1::uuid[])`, [[...profileIds], !!uid])).rows
    : [];

  const saved = uid
    ? (await query('select id, created_at, user_id, listing_id from saved_listings where user_id = $1 order by created_at desc', [uid])).rows
    : [];

  let prefs = null;
  if (uid) {
    const r = (await query('select project, fabrics, max_price, min_qty, city, conditions from buyer_preferences where user_id = $1', [uid])).rows[0];
    if (r) prefs = { project: r.project, fabrics: r.fabrics, maxPrice: r.max_price === null ? '' : Number(r.max_price), minQty: r.min_qty === null ? '' : Number(r.min_qty), city: r.city || '', conditions: r.conditions };
  }

  // Anonymous marketplace figures for the Impact page and the dashboard activity feed.
  const impact = (await query(
    `select listing_id, quantity, updated_at from orders where status = 'completed' order by updated_at desc limit 2000`)).rows
    .map((r) => ({ listing_id: r.listing_id, quantity: Number(r.quantity), updated_at: r.updated_at }));
  const feed = (await query('select listing_id, status, updated_at from orders order by updated_at desc limit 6')).rows;

  res.json({ me, categories, listings, photos, profiles, orders, saved, prefs, impact, feed });
}));

module.exports = router;
