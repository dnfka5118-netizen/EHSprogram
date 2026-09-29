-- =====================================================================
-- 메뉴 즐겨찾기 (PC·휴대폰에서 같은 즐겨찾기를 보도록 사용자별 저장)
-- =====================================================================
alter table public.profiles add column if not exists favorites text[] not null default '{}';

create or replace function public.set_favorites(p_items text[]) returns void
language sql security definer set search_path = public as $$
  update profiles
     set favorites = (select coalesce(array_agg(x), '{}') from (select distinct x from unnest(coalesce(p_items, '{}')) x where x like '/%' limit 30) t)
   where id = auth.uid()
$$;
