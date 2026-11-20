-- Fashion Waste Marketplace: custom-login migration (reviewed and tested on PostgreSQL 16)
-- Run once in the Supabase SQL Editor. It is also safe to run again: a second run changes nothing.
begin;

-- 1. users table: email, password hash and role for your own login code.
create table if not exists public.users (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    email         text not null check (position('@' in email) > 1),
    password_hash text not null,   -- hash only (bcrypt or argon2), never a plain password
    role          text not null default 'buyer'
                  check (role in ('buyer', 'seller', 'both'))
);

-- 2. One account per email, ignoring upper/lower case.
create unique index if not exists users_email_lower_key
    on public.users (lower(email));

-- 3. Safety check. Stop with a clear message if any profile has no usable login to copy
--    (no auth.users row, no email, or no password hash). Nothing is changed if this fails.
do $$
declare
    n   int;
    ids text;
begin
    select count(*), string_agg(p.id::text, ', ')
      into n, ids
    from (
        select p.id
        from public.profiles p
        left join auth.users a on a.id = p.id
        where not exists (select 1 from public.users u where u.id = p.id)
          and (a.id is null or a.email is null or coalesce(a.encrypted_password, '') = '')
        limit 20
    ) p;
    if n > 0 then
        raise exception 'Migration stopped: % profile(s) have no email or password hash to copy (first ids: %). Fix or remove them, then run again.', n, ids;
    end if;
end $$;

-- 4. Lock users away from the public Supabase API. Your backend connects directly and is unaffected.
alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;

-- 5. Copy existing accounts, keeping the same ids and password hashes; emails stored in lowercase.
insert into public.users (id, created_at, email, password_hash, role)
select p.id, p.created_at, lower(a.email), a.encrypted_password, p.role
from public.profiles p
join auth.users a on a.id = p.id
where a.email is not null
  and coalesce(a.encrypted_password, '') <> ''
on conflict (id) do nothing;

-- 6. profiles.id now references users instead of auth.users (finds the old constraint by what it
--    points to, so the name does not matter). Does nothing if already done.
do $$
declare r record;
begin
    for r in
        select c.conname
        from pg_constraint c
        where c.conrelid = 'public.profiles'::regclass
          and c.contype = 'f'
          and c.confrelid <> 'public.users'::regclass
          and c.conkey = array[(select attnum from pg_attribute
                                where attrelid = 'public.profiles'::regclass and attname = 'id')]
    loop
        execute format('alter table public.profiles drop constraint %I', r.conname);
    end loop;

    if not exists (select 1 from pg_constraint
                   where conrelid = 'public.profiles'::regclass and contype = 'f'
                     and confrelid = 'public.users'::regclass) then
        alter table public.profiles
            add constraint profiles_id_fkey
            foreign key (id) references public.users (id) on delete cascade;
    end if;
end $$;

-- 7. listings.seller_id now references users (each listing belongs to the user who created it).
--    Same approach: only the seller_id constraint is touched; the category constraint is left alone.
do $$
declare r record;
begin
    for r in
        select c.conname
        from pg_constraint c
        where c.conrelid = 'public.listings'::regclass
          and c.contype = 'f'
          and c.confrelid <> 'public.users'::regclass
          and c.conkey = array[(select attnum from pg_attribute
                                where attrelid = 'public.listings'::regclass and attname = 'seller_id')]
    loop
        execute format('alter table public.listings drop constraint %I', r.conname);
    end loop;

    if not exists (select 1 from pg_constraint c
                   where c.conrelid = 'public.listings'::regclass and c.contype = 'f'
                     and c.confrelid = 'public.users'::regclass) then
        alter table public.listings
            add constraint listings_seller_id_fkey
            foreign key (seller_id) references public.users (id) on delete cascade;
    end if;
end $$;

-- 8. Index for "show this user's listings" (Profile page).
create index if not exists listings_seller_id_idx
    on public.listings (seller_id);

-- 9. Close the public API on the other tables too. With your own login, Supabase's anon key must not
--    read or write them; only your backend (direct database connection) does.
--    SKIP THIS STEP if your front end still talks to Supabase directly (supabase-js).
alter table public.categories     enable row level security;
alter table public.profiles       enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_photos enable row level security;
revoke all on public.categories, public.profiles, public.listings, public.listing_photos
    from anon, authenticated;

commit;
