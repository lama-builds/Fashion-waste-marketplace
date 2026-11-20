-- Initial categories, the same four the prototype uses.
-- Run once in the Supabase SQL Editor after 01 and 02 (and 04). Safe to run again:
-- a category that already exists (same name) is skipped, so nothing is duplicated or changed.

insert into public.categories (name) values
  ('Fabric'),
  ('New clothing'),
  ('Used clothing'),
  ('Trims & accessories')
on conflict (name) do nothing;

-- Check (should list the four categories):
-- select name from public.categories order by name;
