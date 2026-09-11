-- AnimRu — схема базы для Supabase.
-- Выполните весь файл в SQL Editor проекта, затем заполните config.js.

create extension if not exists "pgcrypto";

-- Профиль и личный прогресс ------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  gamify jsonb,
  watch jsonb,
  lists jsonb,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Оценки тайтлов -------------------------------------------------------
create table if not exists public.ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  title_id text not null,
  value smallint not null check (value between 1 and 10),
  updated_at timestamptz default now(),
  primary key (user_id, title_id)
);

create index if not exists ratings_title_idx on public.ratings (title_id);

alter table public.ratings enable row level security;

drop policy if exists "ratings readable" on public.ratings;
create policy "ratings readable" on public.ratings
  for select using (true);

drop policy if exists "ratings write own" on public.ratings;
create policy "ratings write own" on public.ratings
  for insert with check (auth.uid() = user_id);

drop policy if exists "ratings update own" on public.ratings;
create policy "ratings update own" on public.ratings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ratings delete own" on public.ratings;
create policy "ratings delete own" on public.ratings
  for delete using (auth.uid() = user_id);

-- Комментарии ----------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title_id text not null,
  name text,
  body text not null check (char_length(body) between 2 and 1000),
  created_at timestamptz default now()
);

create index if not exists comments_title_idx on public.comments (title_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments
  for select using (true);

drop policy if exists "comments insert own" on public.comments;
create policy "comments insert own" on public.comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "comments delete own" on public.comments;
create policy "comments delete own" on public.comments
  for delete using (auth.uid() = user_id);

-- Автосоздание профиля при регистрации -------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
