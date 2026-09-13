-- AnimRu — дополнение к schema.sql: защита от подмены автора, рейт-лимит,
-- закрытые оценки и агрегат rating_summary().
-- Скрипт идемпотентен. Запускать ПОСЛЕ schema.sql.

-- ---------------------------------------------------------------------------
-- 1. Автора комментария ставит база, а не клиент
-- ---------------------------------------------------------------------------

create or replace function public.comments_set_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
begin
  if auth.uid() is null then
    raise exception 'требуется авторизация';
  end if;

  select p.name into profile_name from public.profiles p where p.id = auth.uid();

  new.user_id := auth.uid();
  new.name := coalesce(nullif(btrim(profile_name), ''), 'Гость');
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists comments_set_author on public.comments;
create trigger comments_set_author
  before insert on public.comments
  for each row execute function public.comments_set_author();

-- ---------------------------------------------------------------------------
-- 2. Не больше 5 комментариев за 5 минут на пользователя
-- ---------------------------------------------------------------------------

create or replace function public.comments_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  recent integer;
begin
  if actor is null then
    raise exception 'требуется авторизация';
  end if;

  -- Нельзя доверять new.user_id: клиент может прислать чужой UUID, а соседний
  -- триггер исправит автора позже. Считаем лимит только по JWT-пользователю.
  select count(*) into recent
  from public.comments c
  where c.user_id = actor
    and c.created_at > now() - interval '5 minutes';

  if recent >= 5 then
    raise exception 'Слишком много комментариев, подождите несколько минут';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.comments_rate_limit();

-- ---------------------------------------------------------------------------
-- 3. Политики
-- ---------------------------------------------------------------------------

drop policy if exists "profiles delete own" on public.profiles;
create policy "profiles delete own" on public.profiles
  for delete using (auth.uid() = id);

drop policy if exists "ratings readable" on public.ratings;
drop policy if exists "ratings read own" on public.ratings;
create policy "ratings read own" on public.ratings
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Наружу отдаём только агрегат и оценку текущего пользователя
-- ---------------------------------------------------------------------------

drop function if exists public.rating_summary(text);

create function public.rating_summary(p_title_id text)
returns table (avg_value numeric, votes integer, mine integer)
language sql
security definer
set search_path = public
as $$
  select
    round(avg(r.value)::numeric, 2) as avg_value,
    count(*)::integer as votes,
    max(case when r.user_id = auth.uid() then r.value end)::integer as mine
  from public.ratings r
  where r.title_id = p_title_id;
$$;

revoke all on function public.rating_summary(text) from public;
grant execute on function public.rating_summary(text) to anon, authenticated;
