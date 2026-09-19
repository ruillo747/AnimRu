-- Полная идемпотентная схема AnimRu: профиль, прогресс, оценки и комментарии.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text check (char_length(name) between 2 and 32),
  gamify jsonb,
  watch jsonb,
  lists jsonb,
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles delete own" on public.profiles;
create policy "profiles delete own" on public.profiles for delete using (auth.uid() = id);

create table if not exists public.ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  title_id text not null check (char_length(title_id) between 1 and 160),
  value smallint not null check (value between 1 and 10),
  updated_at timestamptz default now(),
  primary key (user_id, title_id)
);
create index if not exists ratings_title_idx on public.ratings (title_id);
alter table public.ratings enable row level security;
drop policy if exists "ratings readable" on public.ratings;
drop policy if exists "ratings read own" on public.ratings;
create policy "ratings read own" on public.ratings for select using (auth.uid() = user_id);
drop policy if exists "ratings write own" on public.ratings;
create policy "ratings write own" on public.ratings for insert with check (auth.uid() = user_id);
drop policy if exists "ratings update own" on public.ratings;
create policy "ratings update own" on public.ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ratings delete own" on public.ratings;
create policy "ratings delete own" on public.ratings for delete using (auth.uid() = user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title_id text not null check (char_length(title_id) between 1 and 160),
  name text,
  body text not null check (char_length(body) between 2 and 1000),
  created_at timestamptz default now()
);
create index if not exists comments_title_idx on public.comments (title_id, created_at desc);
create index if not exists comments_user_recent_idx on public.comments (user_id, created_at desc);
alter table public.comments enable row level security;
drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select using (true);
drop policy if exists "comments insert own" on public.comments;
create policy "comments insert own" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "comments delete own" on public.comments;
create policy "comments delete own" on public.comments for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 32))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.comments_set_author()
returns trigger language plpgsql security definer set search_path = public as $$
declare profile_name text;
begin
  if auth.uid() is null then raise exception 'требуется авторизация'; end if;
  select p.name into profile_name from public.profiles p where p.id = auth.uid();
  new.user_id := auth.uid();
  new.name := coalesce(nullif(btrim(profile_name), ''), 'Зритель');
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists comments_set_author on public.comments;
create trigger comments_set_author before insert on public.comments for each row execute function public.comments_set_author();

create or replace function public.comments_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); recent integer;
begin
  if actor is null then raise exception 'требуется авторизация'; end if;
  select count(*) into recent from public.comments c
  where c.user_id = actor and c.created_at > now() - interval '5 minutes';
  if recent >= 5 then raise exception 'Слишком много комментариев, подождите несколько минут'; end if;
  return new;
end;
$$;
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments for each row execute function public.comments_rate_limit();

drop function if exists public.rating_summary(text);
create function public.rating_summary(p_title_id text)
returns table (avg_value numeric, votes integer, mine integer)
language sql security definer set search_path = public as $$
  select round(avg(r.value)::numeric, 2), count(*)::integer,
    max(case when r.user_id = auth.uid() then r.value end)::integer
  from public.ratings r where r.title_id = p_title_id;
$$;
revoke all on function public.rating_summary(text) from public;
grant execute on function public.rating_summary(text) to anon, authenticated;
