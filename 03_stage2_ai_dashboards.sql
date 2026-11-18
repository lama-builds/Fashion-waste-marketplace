-- Fashion Waste Marketplace: stage 2 database changes (Supabase / Postgres)
-- Adds what the prototype's new features need. Run after the original 4-table schema.

-- 1. Fabric type on listings (used by filters, matching, value estimate, upcycling)
alter table listings
  add column fabric_type text not null default 'other'
  check (fabric_type in ('cotton','polyester','denim','linen','viscose','wool','satin','jersey','leather','terry','other'));
create index listings_fabric_type_idx on listings (fabric_type);

-- 2. Order requests (buyer asks, seller accepts / declines / completes)
create table orders (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  listing_id  uuid not null references listings(id) on delete cascade,
  buyer_id    uuid not null references profiles(id) on delete cascade,
  seller_id   uuid not null references profiles(id) on delete cascade,
  quantity    numeric not null check (quantity > 0),
  unit_price  numeric not null default 0 check (unit_price >= 0),
  total       numeric not null default 0 check (total >= 0),
  status      text not null default 'requested'
              check (status in ('requested','accepted','declined','completed','cancelled')),
  note        text
);
create index orders_seller_idx on orders (seller_id, status);
create index orders_buyer_idx  on orders (buyer_id, status);

-- 3. Saved products
create table saved_listings (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references profiles(id) on delete cascade,
  listing_id  uuid not null references listings(id) on delete cascade,
  unique (user_id, listing_id)
);

-- 4. Optional: buyer matching preferences (the prototype keeps these in the browser)
create table buyer_preferences (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null unique references profiles(id) on delete cascade,
  project     text,
  fabrics     text[] not null default '{}',
  max_price   numeric,
  min_qty     numeric,
  city        text,
  conditions  text[] not null default '{new,like new}'
);

-- Row level security (enable and write policies before going live):
-- orders: buyer and seller of the row can read; buyer inserts; seller updates status.
-- saved_listings, buyer_preferences: owner only.
-- Reminder: this goes beyond the 6-table limit of the original ERD brief; confirm with your supervisor.
