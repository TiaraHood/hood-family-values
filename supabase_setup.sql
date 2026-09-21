-- HOOD FAMILY VALUES — SUPABASE DATABASE SETUP
-- Run this whole file in Supabase SQL Editor.
-- Then create the Storage bucket "family-photos" and make it PUBLIC,
-- or replace getPublicUrl usage with signed URLs.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'Hood Family Member',
  default_relation text,
  generation integer default 1 check (generation > 0),
  hometown text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references public.profiles(id) on delete cascade,
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  relation_label text not null,
  created_at timestamptz not null default now(),
  unique(from_profile_id,to_profile_id,relation_label),
  check(from_profile_id <> to_profile_id)
);

create table if not exists public.family_photos (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  file_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reunion_settings (
  id integer primary key default 1 check(id=1),
  event_date date,
  location text,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.relationships enable row level security;
alter table public.family_photos enable row level security;
alter table public.announcements enable row level security;
alter table public.reunion_settings enable row level security;

drop policy if exists "profiles authenticated read" on public.profiles;
create policy "profiles authenticated read" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert to authenticated with check (id=auth.uid());

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists "relationships authenticated read" on public.relationships;
create policy "relationships authenticated read" on public.relationships for select to authenticated using (true);

drop policy if exists "relationships own insert" on public.relationships;
create policy "relationships own insert" on public.relationships for insert to authenticated with check (from_profile_id=auth.uid());

drop policy if exists "relationships own delete" on public.relationships;
create policy "relationships own delete" on public.relationships for delete to authenticated using (from_profile_id=auth.uid());

drop policy if exists "photos authenticated read" on public.family_photos;
create policy "photos authenticated read" on public.family_photos for select to authenticated using (true);

drop policy if exists "photos own insert" on public.family_photos;
create policy "photos own insert" on public.family_photos for insert to authenticated with check (uploaded_by=auth.uid());

drop policy if exists "photos own delete" on public.family_photos;
create policy "photos own delete" on public.family_photos for delete to authenticated using (uploaded_by=auth.uid());

drop policy if exists "announcements authenticated read" on public.announcements;
create policy "announcements authenticated read" on public.announcements for select to authenticated using (true);

drop policy if exists "reunion authenticated read" on public.reunion_settings;
create policy "reunion authenticated read" on public.reunion_settings for select to authenticated using (true);

-- Automatically create a profile after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name','Hood Family Member'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Storage bucket policies. Create the bucket in Storage first with this exact name.
drop policy if exists "family photos read" on storage.objects;
create policy "family photos read" on storage.objects
for select to authenticated using (bucket_id='family-photos');

drop policy if exists "family photos upload" on storage.objects;
create policy "family photos upload" on storage.objects
for insert to authenticated with check (bucket_id='family-photos' and (storage.foldername(name))[1] in ('photos','avatars'));

drop policy if exists "family photos update own" on storage.objects;
create policy "family photos update own" on storage.objects
for update to authenticated using (bucket_id='family-photos' and owner_id=auth.uid());

drop policy if exists "family photos delete own" on storage.objects;
create policy "family photos delete own" on storage.objects
for delete to authenticated using (bucket_id='family-photos' and owner_id=auth.uid());

-- Starter reunion record:
insert into public.reunion_settings(id,description)
values(1,'Annual Family Remix Reunion — reunion date, location, RSVP information and schedule will be posted here.')
on conflict (id) do nothing;
