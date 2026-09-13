-- AnimRu — доводка безопасности базы. Запускать после schema.sql.
-- Закрывает: подмену имени в комментариях, спам без ограничений,
-- отсутствие удаления профиля и вычисление среднего рейтинга на клиенте.

-- 1. Имя в комментарии больше не берётся с клиента: подставляем из профиля.
create or replace function public.comments_set_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  select coalesce(p.name, split_part(coalesce(p.email, ''), '@', 1), 'Зритель')
    into new.name
  from public.profiles p
  where p.id = auth.uid();
  if new.name is null then
    new.name := 'Зритель';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_set_author on public.comments;
create trigger comments_set_author
  before insert on public.comments
  for each row execute function public.comments_set_author();

-- 2. Простой рейт-лимит: не больше 5 комментариев за 5 минут на пользователя.
create or replace function public.comments_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.comments
  where user_id = auth.uid()
    and created_at > now() - interval '5 minutes';

  if recent >= 5 then
    raise exception 'Слишком часто, подождите несколько минут';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.comments_rate_limit();

-- 3. Пользователь может удалить свой профиль (и вместе с ним прогресс).
drop policy if exists "profiles delete own" on public.profiles;
create policy "profiles delete own" on public.profiles
  for delete using (auth.uid() = id);

-- 4. Среднее и количество оценок считает база, а не браузер.
--    Раньше клиент выкачивал все строки ratings вместе с user_id.
create or replace function public.rating_summary(p_title_id text)
returns table (avg_value numeric, votes integer, mine integer)
language sql
security definer
set search_path = public
as $$
  select
    round(avg(r.value)::numeric, 1) as avg_value,
    count(*)::int as votes,
    max(case when r.user_id = auth.uid() then r.value end)::int as mine
  from public.ratings r
  where r.title_id = p_title_id;
$$;

grant execute on function public.rating_summary(text) to anon, authenticated;

-- 5. Чтение оценок больше не раздаёт user_id всем желающим.
drop policy if exists "ratings readable" on public.ratings;
create policy "ratings read own" on public.ratings
  for select using (auth.uid() = user_id);
