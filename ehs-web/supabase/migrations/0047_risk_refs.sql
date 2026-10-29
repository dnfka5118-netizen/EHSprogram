-- =====================================================================
-- 위험성평가 참고 자료 (AI 위험성평가 작성 1단계 · 비슷한 사례 찾기)
--   source 'jsa' = 우리 사업장 작업위험성평가서(JSA) 엑셀 (같은 작업은 최근 것 하나, meta.repeat = 반복 횟수)
--          'ext' = 타사 작업표준·JSA (참고용, 회사 이름 없음)
--          'sif' = 한국산업안전보건공단 사망사고 고위험요인(SIF) 아카이브
--   넣기 : node scripts/import-risk-refs.mjs --apply (service role) → rebuild_risk_ref_df()
--   검색 : search_risk_refs(검색어, 자료 종류, 개수) — 글자 두 개씩(bigram) 겹침 + 드문 글자일수록 가중치(IDF)
--   steps : [{content, current, control, post{freq,sev}, hazards[{type, content, freq, sev}]}]
-- =====================================================================

create table if not exists public.risk_refs (
  id          bigserial primary key,
  source      text not null check (source in ('jsa', 'ext', 'sif')),
  ref_key     text not null unique,
  title       text not null default '',
  area        text,
  group_name  text,
  year        int,
  meta        jsonb not null default '{}'::jsonb,
  steps       jsonb not null default '[]'::jsonb,
  title_grams text[] not null default '{}',
  body_grams  text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists risk_refs_title_grams on public.risk_refs using gin (title_grams);
create index if not exists risk_refs_body_grams on public.risk_refs using gin (body_grams);
create index if not exists risk_refs_source on public.risk_refs (source);

-- 글자 묶음 : 소문자 · 한글/영문/숫자만 · 낱말이 두 글자 이하면 그대로, 길면 두 글자씩
create or replace function public._grams(p text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct g), '{}')
  from (
    select case when length(w) <= 2 then w else substr(w, i, 2) end as g
    from regexp_split_to_table(lower(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z가-힣]+', ' ', 'g')), '\s+') as w
    cross join lateral generate_series(1, greatest(length(w) - 1, 1)) as i
    where length(w) > 0
  ) x
  where g <> ''
$$;

create or replace function public._risk_ref_grams() returns trigger
language plpgsql as $$
declare
  v_body text;
begin
  if new.source = 'sif' then
    v_body := concat_ws(' ', new.meta->>'situation', new.meta->>'overview', new.meta->>'origin', new.meta->>'kind', new.meta->>'industry');
  else
    select string_agg(concat_ws(' ', s->>'content', (select string_agg(h->>'content', ' ') from jsonb_array_elements(coalesce(s->'hazards', '[]'::jsonb)) h)), ' ')
      into v_body from jsonb_array_elements(new.steps) s;
    v_body := concat_ws(' ', new.area, new.meta->>'equip', v_body);
  end if;
  new.title_grams := _grams(new.title);
  new.body_grams := _grams(v_body);
  return new;
end $$;
drop trigger if exists grams on public.risk_refs;
create trigger grams before insert or update of title, area, meta, steps on public.risk_refs for each row execute function public._risk_ref_grams();

-- 글자 묶음이 들어 있는 자료 수 (드문 글자일수록 검색 가중치가 큼) · 자료를 다시 넣은 뒤 한 번 계산
create table if not exists public.risk_gram_df (
  gram text primary key,
  df   int not null
);
create or replace function public.rebuild_risk_ref_df() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  -- 가져오기 스크립트(service role, 로그인 없음) 또는 관리자
  if auth.uid() is not null and not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception '관리자만 할 수 있습니다.';
  end if;
  delete from risk_gram_df;
  insert into risk_gram_df (gram, df)
  select g, count(*) from risk_refs r cross join lateral unnest(array(select distinct unnest(r.title_grams || r.body_grams))) g group by g;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.rebuild_risk_ref_df() from public, anon;

alter table public.risk_refs enable row level security;
drop policy if exists read_risk on public.risk_refs;
create policy read_risk on public.risk_refs for select to authenticated using (perm_level('risk_adhoc') >= 1);
alter table public.risk_gram_df enable row level security;
-- 쓰기 정책 없음 : 넣기는 service role(가져오기 스크립트)만

-- 비슷한 사례 찾기 : 작업명에 겹치면 2배, 단계·위험 글에 겹치면 1배 (0~1 점수)
create or replace function public.search_risk_refs(p_q text, p_source text default null, p_limit int default 20)
returns table (id bigint, source text, title text, area text, group_name text, year int, meta jsonb, steps jsonb, score numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text[] := _grams(p_q);
  v_n numeric;
  v_total numeric;
begin
  if perm_level('risk_adhoc') < 1 then raise exception '위험성평가를 볼 권한이 없습니다.'; end if;
  if coalesce(array_length(v_q, 1), 0) = 0 then return; end if;
  select greatest(count(*), 1) into v_n from risk_refs;
  return query
  with q as (
    select g, ln((v_n + 1) / (coalesce(d.df, 0) + 1)) + 0.1 as w
    from unnest(v_q) g left join risk_gram_df d on d.gram = g
  ), total as (select sum(w) * 2 as t from q)
  select r.id, r.source, r.title, r.area, r.group_name, r.year, r.meta, r.steps,
         round((sum(case when q.g = any (r.title_grams) then q.w * 2 when q.g = any (r.body_grams) then q.w else 0 end) / (select t from total))::numeric, 3) as score
  from risk_refs r cross join q
  where (r.title_grams && v_q or r.body_grams && v_q)
    and (p_source is null or r.source = p_source)
  group by r.id
  order by 9 desc, r.year desc nulls last, r.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;
grant execute on function public.search_risk_refs(text, text, int) to authenticated;

-- 자료 건수 (화면 안내용)
create or replace function public.risk_ref_counts() returns table (source text, n bigint)
language sql stable security definer set search_path = public as $$
  select source, count(*) from risk_refs where perm_level('risk_adhoc') >= 1 group by source
$$;
grant execute on function public.risk_ref_counts() to authenticated;

-- 메뉴 : 위험성평가 › AI 위험성평가 작성 (수시 작업위험성평가 권한을 그대로 씀)
