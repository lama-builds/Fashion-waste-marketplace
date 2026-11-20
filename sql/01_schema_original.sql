-- Run this in the Supabase SQL Editor.

-- 1. categories: lookup table for listing types (no dependencies, so it goes first)
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null unique
);

-- 2. profiles: one row per user, linked to Supabase Auth.
--    The id is the auth user's id, so it has no gen_random_uuid() default.
--    Deleting the auth user deletes the profile.
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  full_name        text not null,
  role             text not null default 'buyer'
                   check (role in ('buyer', 'seller')),
  phone            text,
  whatsapp_number  text,   -- international format, e.g. +201001234567
  city             text,
  avatar_url       text
);

-- 3. listings: items for sale or free.
--    Deleting a seller deletes their listings (cascade).
--    A category in use cannot be deleted (restrict).
create table public.listings (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  seller_id    uuid not null references public.profiles (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete restrict,
  title        text not null,
  description  text,
  quantity     int not null default 1 check (quantity > 0),
  unit         text not null default 'pieces'
               check (unit in ('meters', 'kg', 'pieces')),
  price        numeric(10, 2),
  is_free      boolean not null default false,
  condition    text not null
               check (condition in ('new', 'like new', 'used', 'damaged')),
  city         text not null,
  status       text not null default 'available'
               check (status in ('available', 'reserved', 'sold')),
  -- a free item has no price; a paid item must have a price above 0
  constraint listings_price_matches_free check (
    (is_free = true  and price is null)
    or
    (is_free = false and price is not null and price > 0)
  )
);

-- 4. listing_photos: photos for a listing.
--    Deleting a listing deletes its photo rows (cascade).
create table public.listing_photos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  image_url   text not null,   -- Supabase Storage path
  position    int not null default 0
);
