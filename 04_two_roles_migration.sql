-- Two roles only: buyer or seller. The old 'both' role is removed.
-- Run once in the Supabase SQL Editor AFTER the earlier login migration. Safe to run again.
-- No tables or rows are deleted. Only the role values and the role checks change.

begin;

-- 1. Convert every 'both' account: seller if it owns listings, otherwise buyer.
do $$
declare n_seller int; n_buyer int;
begin
  with c as (
    update public.users u
       set role = case when exists (select 1 from public.listings l where l.seller_id = u.id)
                       then 'seller' else 'buyer' end
     where u.role = 'both'
    returning role)
  select count(*) filter (where role = 'seller'), count(*) filter (where role = 'buyer')
    into n_seller, n_buyer from c;
  raise notice 'Converted "both" accounts: % to seller, % to buyer', n_seller, n_buyer;
end $$;

-- Any listing owner who is still a buyer must be a seller (listings need a seller).
update public.users u set role = 'seller'
 where u.role = 'buyer' and exists (select 1 from public.listings l where l.seller_id = u.id);

-- 2. profiles.role mirrors users.role.
update public.profiles p set role = u.role
  from public.users u
 where u.id = p.id and p.role is distinct from u.role;

-- 3. Drop every old role check that mentions 'both' (found by definition, not by name).
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
      from pg_constraint
     where contype = 'c'
       and conrelid in ('public.users'::regclass, 'public.profiles'::regclass)
       and pg_get_constraintdef(oid) ilike '%both%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- 4. Add the two-role checks (only if missing).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_two_check') then
    alter table public.users add constraint users_role_two_check check (role in ('buyer', 'seller'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_two_check') then
    alter table public.profiles add constraint profiles_role_two_check check (role in ('buyer', 'seller'));
  end if;
end $$;

commit;

-- Manual checks (should return 0 rows / only buyer and seller):
-- select role, count(*) from public.users group by role;
-- select u.id from public.users u join public.profiles p on p.id = u.id where p.role <> u.role;
