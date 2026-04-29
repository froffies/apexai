-- ApexAI Supabase setup
-- Run this in the Supabase SQL editor for the project used by VITE_SUPABASE_URL.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_app_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  value jsonb not null,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, storage_key)
);

alter table public.user_profiles enable row level security;
alter table public.user_app_state enable row level security;

drop policy if exists "users can read their profile" on public.user_profiles;
drop policy if exists "users can write their profile" on public.user_profiles;
drop policy if exists "users can read their app state" on public.user_app_state;
drop policy if exists "users can write their app state" on public.user_app_state;
drop policy if exists "users can delete their app state" on public.user_app_state;

create policy "users can read their profile"
on public.user_profiles for select
using (auth.uid() = user_id);

create policy "users can write their profile"
on public.user_profiles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can read their app state"
on public.user_app_state for select
using (auth.uid() = user_id);

create policy "users can write their app state"
on public.user_app_state for insert
with check (auth.uid() = user_id);

create policy "users can update their app state"
on public.user_app_state for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete their app state"
on public.user_app_state for delete
using (auth.uid() = user_id);
