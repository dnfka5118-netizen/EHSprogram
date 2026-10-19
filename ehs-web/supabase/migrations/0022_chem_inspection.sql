-- =====================================================================
-- 유해화학물질 취급시설 자체점검 (화학물질관리법 시행규칙 별지 제42호서식 · 양식 CE310-07)
--   · 주 1회 · 점검 단위(부서별, 생산은 HBC/과수로 나뉨)마다 점검자 · 점검장소
--   · 12개 항목 × 점검장소 : 문제없음 / 자체점검 시 조치완료 / 정밀 재점검 필요, 항목별 비고
--   · 정밀 재점검 필요 → 지적사항(개선 요청)으로 등록 · 점검 지표 '실시' 기록
--   · 결재 : 점검자 → EHS부서장(합의) → 해당 부서장 (공통 전자결재, 양식별 결재선에서 수정)
-- =====================================================================

update public.modules set form = 'finding', is_enabled = true, name = '유해화학물질 자체점검' where code = 'insp_chem';

create table if not exists public.chem_items (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,          -- ① ~ ⑫
  content    text not null,
  sort_order int  not null default 0,
  is_active  boolean not null default true
);
create table if not exists public.chem_groups (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites(id),
  name          text not null,       -- 예 : 생산팀 (HBC)
  department_id uuid references public.departments(id) on delete set null,  -- 소속 · 결재 해당 부서 · 재점검 개선 부서
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create table if not exists public.chem_group_members (
  group_id uuid not null references public.chem_groups(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, user_id)
);
create table if not exists public.chem_places (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.chem_groups(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  is_active  boolean not null default true
);
create index if not exists chem_places_group on public.chem_places (group_id, sort_order);

create table if not exists public.chem_checks (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.chem_groups(id) on delete cascade,
  check_date date not null,
  week_start date not null,          -- 그 주 월요일 (주 1회)
  time_text  text,                   -- 점검시간 (예 : 10:00 ~ 11:00)
  user_id    uuid references public.profiles(id) on delete set null,   -- 점검자 (성명)
  saved_at   timestamptz,            -- 점검 내용 저장 시각 (null = 아직 작성 전)
  created_at timestamptz not null default now(),
  unique (group_id, week_start)
);
create table if not exists public.chem_results (
  check_id uuid not null references public.chem_checks(id) on delete cascade,
  item_id  uuid not null references public.chem_items(id) on delete cascade,
  place_id uuid not null references public.chem_places(id) on delete cascade,
  result   text not null check (result in ('ok', 'fixed', 'recheck')),  -- 문제없음 · 자체점검 시 조치완료 · 정밀 재점검 필요
  primary key (check_id, item_id, place_id)
);
create table if not exists public.chem_notes (
  check_id   uuid not null references public.chem_checks(id) on delete cascade,
  item_id    uuid not null references public.chem_items(id) on delete cascade,
  note       text,
  finding_id uuid references public.findings(id) on delete set null,     -- 정밀 재점검 필요 → 지적사항
  primary key (check_id, item_id)
);

alter table public.chem_items         enable row level security;
alter table public.chem_groups        enable row level security;
alter table public.chem_group_members enable row level security;
alter table public.chem_places        enable row level security;
alter table public.chem_checks        enable row level security;
alter table public.chem_results       enable row level security;
alter table public.chem_notes         enable row level security;
create policy read_all on public.chem_items         for select to authenticated using (is_member());
create policy admin_all on public.chem_items        for all to authenticated using (is_admin()) with check (is_admin());
create policy read_all on public.chem_groups        for select to authenticated using (is_member());
create policy admin_all on public.chem_groups       for all to authenticated using (is_admin()) with check (is_admin());
create policy read_all on public.chem_group_members for select to authenticated using (is_member());
create policy admin_all on public.chem_group_members for all to authenticated using (is_admin()) with check (is_admin());
create policy read_all on public.chem_places        for select to authenticated using (is_member());
create policy admin_all on public.chem_places       for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public.can_view_chem(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level('insp_chem') >= 1 or exists (select 1 from chem_group_members where group_id = p_group and user_id = auth.uid())
$$;
create policy read_chem on public.chem_checks  for select to authenticated using (can_view_chem(group_id));
create policy read_chem on public.chem_results for select to authenticated using (exists (select 1 from chem_checks c where c.id = check_id));
create policy read_chem on public.chem_notes   for select to authenticated using (exists (select 1 from chem_checks c where c.id = check_id));

-- 점검자 지정 (관리자) = 점검 주기 '매주' 자동 등록 (점검 지표 미진행)
create or replace function public.set_chem_group_members(p_group uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_removed uuid[];
begin
  if not is_admin() then raise exception '관리자만 지정할 수 있습니다.'; end if;
  select coalesce(array_agg(user_id), '{}') into v_removed from chem_group_members where group_id = p_group and user_id <> all (coalesce(p_users, '{}'));
  delete from chem_group_members where group_id = p_group and user_id = any (v_removed);
  insert into chem_group_members (group_id, user_id) select p_group, u from unnest(coalesce(p_users, '{}')) u on conflict do nothing;
  insert into inspection_schedules (module_code, user_id, period, start_date, note)
  select 'insp_chem', u, 'weekly', kst_today(), '유해화학물질 점검자 (자동)' from unnest(coalesce(p_users, '{}')) u
  on conflict (module_code, user_id) do update set is_active = true, end_date = null;
  update inspection_schedules s set end_date = greatest(s.start_date, kst_today() - 1), is_active = s.start_date < kst_today()
   where s.module_code = 'insp_chem' and s.user_id = any (v_removed) and s.end_date is null
     and not exists (select 1 from chem_group_members m where m.user_id = s.user_id);
end $$;

create or replace function public._chem_editable(p_check uuid) returns chem_checks
language plpgsql security definer set search_path = public as $$
declare v chem_checks%rowtype; v_st text;
begin
  select * into v from chem_checks where id = p_check;
  if not found then raise exception '점검 기록을 찾을 수 없습니다.'; end if;
  if not (is_admin() or exists (select 1 from chem_group_members where group_id = v.group_id and user_id = auth.uid())) then
    raise exception '이 점검의 점검자만 작성할 수 있습니다.';
  end if;
  select status into v_st from approvals where module_code = 'insp_chem' and doc_id = v.id;
  if v_st in ('in_review', 'approved') then raise exception '결재 중이거나 결재가 끝난 점검대장은 고칠 수 없습니다.'; end if;
  return v;
end $$;
revoke execute on function public._chem_editable(uuid) from public, anon, authenticated;

-- 이번 주(또는 고른 날의 주) 점검대장 열기 : 없으면 만듦
create or replace function public.open_chem_check(p_group uuid, p_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_day date := coalesce(p_date, kst_today()); v_id uuid;
begin
  if not (is_admin() or exists (select 1 from chem_group_members where group_id = p_group and user_id = auth.uid())) then
    raise exception '이 점검의 점검자만 작성할 수 있습니다.';
  end if;
  if v_day > kst_today() then raise exception '앞으로의 날짜는 고를 수 없습니다.'; end if;
  insert into chem_checks (group_id, check_date, week_start, user_id)
  values (p_group, v_day, date_trunc('week', v_day)::date, auth.uid())
  on conflict (group_id, week_start) do nothing;
  select id into v_id from chem_checks where group_id = p_group and week_start = date_trunc('week', v_day)::date;
  return v_id;
end $$;

-- 같은 점검 회차(모듈 · 사업장 · 날짜 · 점검자) 찾기/만들기
create or replace function public._module_inspection(p_module text, p_site uuid, p_day date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inspector text := inspector_for(p_module); v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_module || p_site::text || p_day::text || coalesce(v_inspector, '')));
  select id into v_id from inspections
   where module_code = p_module and site_id = p_site and inspection_date = p_day and inspector is not distinct from v_inspector
   order by created_at limit 1;
  if v_id is null then
    insert into inspections (site_id, module_code, inspection_date, title, inspector, created_by)
    values (p_site, p_module, p_day,
            extract(year from p_day)::int || '년 ' || extract(month from p_day)::int || '월 ' || extract(day from p_day)::int || '일 ' || (select name from modules where code = p_module),
            v_inspector, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public._module_inspection(text, uuid, date) from public, anon, authenticated;

-- 점검 내용 저장
--   p_results : [{ item_id, place_id, result: ok|fixed|recheck }]  — 사용 중인 항목 × 장소 모두
--   p_notes   : [{ item_id, note }]                                — 조치완료 · 재점검 이 있는 항목은 비고 필수
create or replace function public.save_chem_check(p_id uuid, p_date date, p_time text, p_results jsonb, p_notes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v chem_checks%rowtype;
  g chem_groups%rowtype;
  v_missing int;
  it record;
  v_note text;
  v_fid uuid;
  v_insp uuid;
  v_seq int;
  v_places text;
  v_new int := 0;
begin
  v := _chem_editable(p_id);
  select * into g from chem_groups where id = v.group_id;
  if p_date is null or p_date > kst_today() then raise exception '점검일을 확인해 주세요.'; end if;
  if date_trunc('week', p_date)::date <> v.week_start then raise exception '점검일은 이 점검대장의 주(%) 안이어야 합니다.', to_char(v.week_start, 'MM.DD') || ' 주'; end if;

  select count(*) into v_missing
    from chem_items i cross join chem_places pl
   where i.is_active and pl.group_id = v.group_id and pl.is_active
     and not exists (select 1 from jsonb_array_elements(coalesce(p_results, '[]')) x
                      where (x->>'item_id')::uuid = i.id and (x->>'place_id')::uuid = pl.id and x->>'result' in ('ok', 'fixed', 'recheck'));
  if v_missing > 0 then raise exception '표시하지 않은 칸이 %개 있습니다.', v_missing; end if;

  delete from chem_results where check_id = p_id;
  insert into chem_results (check_id, item_id, place_id, result)
  select p_id, (x->>'item_id')::uuid, (x->>'place_id')::uuid, x->>'result'
    from jsonb_array_elements(p_results) x
    join chem_places pl on pl.id = (x->>'place_id')::uuid and pl.group_id = v.group_id
    join chem_items i on i.id = (x->>'item_id')::uuid;

  for it in select i.* from chem_items i where i.is_active order by i.sort_order loop
    select nullif(trim(x->>'note'), '') into v_note from jsonb_array_elements(coalesce(p_notes, '[]')) x where (x->>'item_id')::uuid = it.id limit 1;
    if exists (select 1 from chem_results where check_id = p_id and item_id = it.id and result <> 'ok') and v_note is null then
      raise exception '%번 항목의 비고(조치 내용 또는 재점검 필요 사항)를 적어 주세요.', it.code;
    end if;
    select finding_id into v_fid from chem_notes where check_id = p_id and item_id = it.id;
    -- 정밀 재점검 필요 → 지적사항 (처음 한 번)
    if v_fid is null and exists (select 1 from chem_results where check_id = p_id and item_id = it.id and result = 'recheck') then
      if g.department_id is null then raise exception '점검 단위(%)의 부서가 지정되지 않았습니다. 환경설정에서 지정해 주세요.', g.name; end if;
      select string_agg(pl.name, ', ' order by pl.sort_order) into v_places
        from chem_results r join chem_places pl on pl.id = r.place_id where r.check_id = p_id and r.item_id = it.id and r.result = 'recheck';
      v_insp := _module_inspection('insp_chem', g.site_id, p_date);
      select coalesce(max(seq), 0) + 1 into v_seq from findings where inspection_id = v_insp;
      insert into findings (inspection_id, site_id, module_code, seq, sub_location_text, problem, request_department_id, created_by)
      values (v_insp, g.site_id, 'insp_chem', v_seq, v_places,
              format('[%s %s] %s', it.code, left(regexp_replace(it.content, '\s+', ' ', 'g'), 40), v_note), g.department_id, auth.uid())
      returning id into v_fid;
      perform log_event(v_fid, '등록', g.name || ' 유해화학물질 자체점검 · 정밀 재점검 필요');
      v_new := v_new + 1;
    end if;
    insert into chem_notes (check_id, item_id, note, finding_id) values (p_id, it.id, v_note, v_fid)
    on conflict (check_id, item_id) do update set note = excluded.note, finding_id = excluded.finding_id;
  end loop;

  update chem_checks set check_date = p_date, time_text = nullif(trim(p_time), ''), user_id = auth.uid(), saved_at = now() where id = p_id;

  -- 점검 지표 : 이번 주 실시
  if not exists (select 1 from inspection_checks where module_code = 'insp_chem' and user_id = auth.uid() and done_on = p_date) then
    insert into inspection_checks (module_code, user_id, done_on, note) values ('insp_chem', auth.uid(), p_date, g.name);
  end if;
  return jsonb_build_object('findings', v_new);
end $$;

-- 상신 : 점검자 → EHS부서장 → 해당 부서장 (상신할 때 바꿀 수 있음)
create or replace function public.submit_chem_check(p_id uuid, p_steps jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v chem_checks%rowtype; g chem_groups%rowtype;
begin
  v := _chem_editable(p_id);
  if v.saved_at is null then raise exception '점검 내용을 먼저 저장해 주세요.'; end if;
  select * into g from chem_groups where id = v.group_id;
  return _submit_approval('insp_chem', v.id,
    format('유해화학물질 취급시설 자체점검대장(%s) · %s', to_char(v.check_date, 'YYYY.MM.DD'), g.name),
    g.site_id, g.department_id, p_steps);
end $$;

create or replace function public.approval_doc_path(p_module text, p_doc uuid) returns text
language sql immutable as $$
  select case p_module
    when 'permit'     then '/permit/' || p_doc
    when 'risk_adhoc' then '/risk/adhoc/' || p_doc
    when 'insp_daily' then '/insp/daily/logs/' || p_doc
    when 'insp_chem'  then '/insp/chem/checks/' || p_doc
    else '/approvals'
  end
$$;

insert into public.approval_template_steps (module_code, step_order, step_kind, label, resolver, department_id, required)
select 'insp_chem', v.o, v.k, v.l, v.r,
       case when v.r = 'dept_head' then (select id from public.departments where name in ('EHS팀', 'EHS부서') and parent_id is null order by sort_order limit 1) end, true
  from (values (1, '담당', '점검자', 'drafter'), (2, '협조', 'EHS부서장', 'dept_head'), (3, '승인', '해당부서장', 'doc_dept_head')) v(o, k, l, r)
on conflict (module_code, step_order) do nothing;

-- ---------------------------------------------------------------------
-- 초기 데이터 : 점검 항목 12개 (별지 제42호서식) · 점검 단위 · 장소 · 점검자 (2026.10 점검대장 기준)
-- ---------------------------------------------------------------------
insert into public.chem_items (code, content, sort_order)
select * from (values
  ('①', '유해화학물질의 이송배관ㆍ접합부 및 밸브 등 관련 설비의 부식 등으로 인한 유출ㆍ누출 여부', 10),
  ('②', '고체 상태 유해화학물질의 용기를 밀폐한 상태로 보관하고 있는지 여부', 20),
  ('③', '액체ㆍ기체 상태의 유해화학물질을 완전히 밀폐한 상태로 보관하고 있는지 여부', 30),
  ('④', '유해화학물질의 보관용기가 파손 또는 부식되거나 균열이 발생하였는지 여부', 40),
  ('⑤', '탱크로리, 트레일러 등 유해화학물질 운반장비의 부식ㆍ손상ㆍ노후화 여부', 50),
  ('⑥', '물 반응성 물질이나 인화성 고체의 물 접촉으로 인한 화재ㆍ폭발 가능성이 있는지 여부', 60),
  ('⑦', '인화성 액체의 증기 또는 인화성 가스가 공기 중에 존재하여 화재ㆍ폭발 가능성이 있는지 여부', 70),
  ('⑧', '자연발화의 위험이 있는 물질이 취급시설 및 장비주변에 존재함에 따라 화재ㆍ폭발 가능성이 있는지 여부', 80),
  ('⑨', '누출감지장치, 안전밸브, 경보기 및 온도ㆍ압력계기가 정상적으로 작동하는지 여부', 90),
  ('⑩', '법 제14조제2항에 따라 환경부장관이 고시한 개인보호장구가 본래의 성능을 유지하는지 여부', 100),
  ('⑪', '유해화학물질 저장ㆍ보관설비의 부식ㆍ손상ㆍ균열 등으로 인한 유출ㆍ누출이 있는지 여부', 110),
  ('⑫', '방류벽, 트렌치(도랑 형식의 배수설비) 등 액체 유해화학물질의 누출확산을 방지하기 위한 집수시설이 본래의 성능을 유지하는지 여부', 120)
) v(code, content, sort_order)
where not exists (select 1 from public.chem_items);

do $$
declare
  v_site uuid := (select id from public.sites where code = 'CA');
  r record;
  v_g uuid;
  v_ord int := 0;
  pl text;
  i int;
begin
  if v_site is null or exists (select 1 from public.chem_groups) then return; end if;
  for r in select * from (values
    ('생산팀 (HBC)', '생산팀', '이진혁', array['ANE-10 제조시설', 'TX-10S 제조시설', 'PLP 제조시설', '합성장치', 'WTE-100 제조시설', 'WTE-100 소형 제조시설', 'PCS-02 제조시설', 'PCS-02 양산 제조시설', '7동 1층 보관창고', '10동 1층 보관창고', '10동 2층 보관창고']),
    ('생산팀 (과수)', '생산팀', '이종광', array['과수 TANK', '과수 제조', 'BDS 충전실', 'T/C', 'WLC', '과수1 sample1', '과수1 sample2', '과수2 sample']),
    ('품질보증팀', '품질보증팀', '전현철', array['분석 1실 습식실', '분석 1실 클린룸', '분석 1실 가스실', '분석 2실 습식실', '분석 2실 클린룸', '분석 2실 가스실']),
    ('지원팀', '지원팀', '서용운', array['6동 창고']),
    ('EHS팀', 'EHS팀', '류성호', array['폐드럼 보관장소'])
  ) t(name, dept, person, places) loop
    v_ord := v_ord + 10;
    insert into public.chem_groups (site_id, name, department_id, sort_order)
    values (v_site, r.name, (select id from public.departments where name = r.dept and parent_id is null and site_id = v_site limit 1), v_ord)
    returning id into v_g;
    i := 0;
    foreach pl in array r.places loop
      i := i + 10;
      insert into public.chem_places (group_id, name, sort_order) values (v_g, pl, i);
    end loop;
    insert into public.chem_group_members (group_id, user_id)
    select v_g, p.id from public.profiles p
     where p.name = r.person and p.is_active
       and p.department_id = (select id from public.departments where name = r.dept and parent_id is null and site_id = v_site limit 1)
    on conflict do nothing;
  end loop;
  insert into public.inspection_schedules (module_code, user_id, period, start_date, note)
  select distinct 'insp_chem', m.user_id, 'weekly', public.kst_today(), '유해화학물질 점검자 (자동)' from public.chem_group_members m
  on conflict (module_code, user_id) do nothing;
end $$;
