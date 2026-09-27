-- =====================================================================
-- EHS 프로그램 : 기반 구조 + 사내점검(CEO/월간/공장장 안전점검)
-- Supabase SQL Editor 에서 0001 → 0002 순서로 실행
-- =====================================================================


-- 한국 시간 기준 오늘 날짜 (Supabase DB 는 UTC)
create or replace function public.kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- ---------------------------------------------------------------------
-- 1. 조직 : 사업장 / 부서 / 사용자
-- ---------------------------------------------------------------------
create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  name          text not null,
  site_id       uuid references public.sites(id) on delete set null,
  department_id uuid,
  position      text,                                   -- 직위/직책
  user_type     text not null default 'employee'
                check (user_type in ('employee', 'contractor')),
  company_name  text,                                   -- 협력업체명
  is_admin      boolean not null default false,
  must_change_password boolean not null default true,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  assigner_id uuid references public.profiles(id) on delete set null, -- 조치담당자 지정자
  approver_id uuid references public.profiles(id) on delete set null, -- 종결 승인자(부서장)
  created_at  timestamptz not null default now(),
  unique (site_id, name)
);

alter table public.profiles
  add constraint profiles_department_fk
  foreign key (department_id) references public.departments(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. 프로세스(모듈) 와 사용자별 권한
--    임직원: 권한 행이 없으면 기본 '작성'
--    협력업체: 권한 행이 없으면 기본 '없음' → 관리자가 선택적으로 부여
-- ---------------------------------------------------------------------
create table public.modules (
  code        text primary key,
  slug        text not null unique,
  name        text not null,
  category    text not null,          -- 사내점검 / 사외점검 / 위험성평가 / 작업허가
  form        text,                   -- 'finding' = 지적사항 조치형 양식
  sort_order  int  not null default 0,
  is_enabled  boolean not null default false
);

create table public.user_permissions (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  module_code text not null references public.modules(code) on delete cascade,
  level       text not null check (level in ('none', 'read', 'write')),
  primary key (user_id, module_code)
);

-- ---------------------------------------------------------------------
-- 3. 기준정보 : 장소 / 세부장소 / 유형
-- ---------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  unique (site_id, name)
);

create table public.sub_locations (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  unique (location_id, name)
);

create table public.finding_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

-- ---------------------------------------------------------------------
-- 4. 점검(회차) 과 지적사항
-- ---------------------------------------------------------------------
create table public.inspections (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites(id),
  module_code     text not null references public.modules(code),
  inspection_date date not null,
  title           text not null,
  inspectors      text,               -- 점검 참여자 (예: 대표이사, 환경안전팀장)
  note            text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on public.inspections (module_code, inspection_date desc);

-- status
--   assign_wait   : 조치담당자 지정 대기
--   plan_wait     : 조치계획 수립 대기
--   in_progress   : 조치 중
--   approval_wait : 종결 승인 대기
--   closed        : 종결
create table public.findings (
  id                    uuid primary key default gen_random_uuid(),
  inspection_id         uuid not null references public.inspections(id) on delete cascade,
  site_id               uuid not null references public.sites(id),
  module_code           text not null references public.modules(code),
  seq                   int  not null,
  location_id           uuid references public.locations(id),
  sub_location_id       uuid references public.sub_locations(id),
  sub_location_text     text,
  finding_type_id       uuid references public.finding_types(id),
  problem               text not null,
  request_department_id uuid not null references public.departments(id),
  status                text not null default 'assign_wait'
                        check (status in ('assign_wait','plan_wait','in_progress','approval_wait','closed')),
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz,     -- 완료 보고 시각
  closed_at             timestamptz,
  closed_by             uuid references public.profiles(id) on delete set null,
  unique (inspection_id, seq)
);
create index on public.findings (module_code, status);
create index on public.findings (request_department_id, status);

create table public.finding_assignees (
  finding_id  uuid not null references public.findings(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (finding_id, user_id)
);
create index on public.finding_assignees (user_id);

-- 조치계획 : 즉시조치 / 단기대책(한달 이내) / 장기대책(한달 초과) — 각각 목표일 별도
create table public.finding_measures (
  id                   uuid primary key default gen_random_uuid(),
  finding_id           uuid not null references public.findings(id) on delete cascade,
  kind                 text not null check (kind in ('immediate','short','long')),
  content              text not null,
  target_date          date not null,
  original_target_date date not null,
  reschedule_count     int  not null default 0,
  is_done              boolean not null default false,
  done_at              date,
  unique (finding_id, kind)
);

-- 목표일 변경 이력
create table public.measure_date_history (
  id          uuid primary key default gen_random_uuid(),
  measure_id  uuid not null references public.finding_measures(id) on delete cascade,
  old_date    date not null,
  new_date    date not null,
  reason      text,
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now()
);

-- 미완료 보고 (미완료 이유 / 진행현황)
create table public.finding_progress (
  id          uuid primary key default gen_random_uuid(),
  finding_id  uuid not null references public.findings(id) on delete cascade,
  reason      text not null,
  progress    text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.finding_photos (
  id          uuid primary key default gen_random_uuid(),
  finding_id  uuid not null references public.findings(id) on delete cascade,
  kind        text not null check (kind in ('before','after')),
  path        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 지시사항 / 코멘트 (예: 사장님 지시 → 답변)
create table public.finding_comments (
  id           uuid primary key default gen_random_uuid(),
  finding_id   uuid not null references public.findings(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  is_directive boolean not null default false,
  body         text not null,
  created_at   timestamptz not null default now()
);

-- 처리 이력 (감사 추적)
create table public.finding_events (
  id          uuid primary key default gen_random_uuid(),
  finding_id  uuid not null references public.findings(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);
create index on public.finding_events (finding_id, created_at);

-- ---------------------------------------------------------------------
-- 5. 권한 판단 함수
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid() and is_active), false)
$$;

-- 관리자가 등록한 활성 사용자인지 (직접 회원가입한 계정 차단)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active)
$$;

-- 0 = 없음, 1 = 열람, 2 = 작성
create or replace function public.perm_level(p_module text) returns int
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null or not p.is_active then 0
    when p.is_admin then 2
    when up.level = 'write' then 2
    when up.level = 'read'  then 1
    when up.level = 'none'  then 0
    when p.user_type = 'employee' then 2
    else 0
  end
  from (select auth.uid() as uid) u
  left join profiles p on p.id = u.uid
  left join user_permissions up on up.user_id = u.uid and up.module_code = p_module
$$;

create or replace function public.can_view_finding(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from findings f
    left join departments d on d.id = f.request_department_id
    where f.id = p_finding and (
      perm_level(f.module_code) >= 1
      or f.created_by = auth.uid()
      or auth.uid() in (d.assigner_id, d.approver_id)
      or exists (select 1 from finding_assignees a where a.finding_id = f.id and a.user_id = auth.uid())
    )
  )
$$;

create or replace function public.can_view_photo_path(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      then can_view_finding(substring(p_path from 1 for 36)::uuid)
    else false
  end
$$;

create or replace function public.can_assign(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from findings f join departments d on d.id = f.request_department_id
    where f.id = p_finding and auth.uid() in (d.assigner_id, d.approver_id)
  )
$$;

create or replace function public.can_approve(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from findings f join departments d on d.id = f.request_department_id
    where f.id = p_finding and d.approver_id = auth.uid()
  )
$$;

create or replace function public.is_assignee(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from finding_assignees where finding_id = p_finding and user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 6. RLS : 조회는 정책으로, 처리(쓰기)는 아래 RPC 함수로만
-- ---------------------------------------------------------------------
alter table public.sites                enable row level security;
alter table public.profiles             enable row level security;
alter table public.departments          enable row level security;
alter table public.modules              enable row level security;
alter table public.user_permissions     enable row level security;
alter table public.locations            enable row level security;
alter table public.sub_locations        enable row level security;
alter table public.finding_types        enable row level security;
alter table public.inspections          enable row level security;
alter table public.findings             enable row level security;
alter table public.finding_assignees    enable row level security;
alter table public.finding_measures     enable row level security;
alter table public.measure_date_history enable row level security;
alter table public.finding_progress     enable row level security;
alter table public.finding_photos       enable row level security;
alter table public.finding_comments     enable row level security;
alter table public.finding_events       enable row level security;

-- 기준정보 : 등록 사용자 조회, 관리자 수정
create policy read_all on public.sites         for select to authenticated using (is_member());
create policy read_all on public.departments   for select to authenticated using (is_member());
create policy read_all on public.modules       for select to authenticated using (is_member());
create policy read_all on public.locations     for select to authenticated using (is_member());
create policy read_all on public.sub_locations for select to authenticated using (is_member());
create policy read_all on public.finding_types for select to authenticated using (is_member());
create policy read_all on public.profiles      for select to authenticated using (is_member());

create policy admin_all on public.sites         for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on public.departments   for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on public.modules       for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on public.locations     for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on public.sub_locations for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on public.finding_types for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on public.profiles      for all to authenticated using (is_admin()) with check (is_admin());

create policy read_own on public.user_permissions for select to authenticated using (user_id = auth.uid() or is_admin());
create policy admin_all on public.user_permissions for all to authenticated using (is_admin()) with check (is_admin());

create policy read_perm on public.inspections for select to authenticated
  using (perm_level(module_code) >= 1 or exists (select 1 from findings f where f.inspection_id = inspections.id and can_view_finding(f.id)));

create policy read_visible on public.findings          for select to authenticated using (can_view_finding(id));
create policy read_visible on public.finding_assignees for select to authenticated using (can_view_finding(finding_id));
create policy read_visible on public.finding_measures  for select to authenticated using (can_view_finding(finding_id));
create policy read_visible on public.finding_progress  for select to authenticated using (can_view_finding(finding_id));
create policy read_visible on public.finding_photos    for select to authenticated using (can_view_finding(finding_id));
create policy read_visible on public.finding_comments  for select to authenticated using (can_view_finding(finding_id));
create policy read_visible on public.finding_events    for select to authenticated using (can_view_finding(finding_id));
create policy read_visible on public.measure_date_history for select to authenticated
  using (exists (select 1 from finding_measures m where m.id = measure_id and can_view_finding(m.finding_id)));

-- ---------------------------------------------------------------------
-- 7. 목록/보고서용 뷰
-- ---------------------------------------------------------------------
create or replace view public.finding_overview with (security_invoker = on) as
select
  f.*,
  i.inspection_date,
  i.title            as inspection_title,
  m.name             as module_name,
  m.slug             as module_slug,
  s.name             as site_name,
  l.name             as location_name,
  coalesce(sl.name, f.sub_location_text) as sub_location_name,
  ft.name            as type_name,
  d.name             as department_name,
  (select string_agg(p.name, ', ' order by p.name)
     from finding_assignees a join profiles p on p.id = a.user_id
    where a.finding_id = f.id)                                     as assignee_names,
  (select min(fm.target_date) from finding_measures fm
    where fm.finding_id = f.id and not fm.is_done)                 as next_due,
  (f.status <> 'closed' and exists (
     select 1 from finding_measures fm
      where fm.finding_id = f.id and not fm.is_done and fm.target_date < kst_today())) as is_overdue,
  (select coalesce(sum(fm.reschedule_count), 0)::int from finding_measures fm
    where fm.finding_id = f.id)                                    as reschedule_total
from findings f
join inspections i      on i.id = f.inspection_id
join modules m          on m.code = f.module_code
join sites s            on s.id = f.site_id
join departments d      on d.id = f.request_department_id
left join locations l   on l.id = f.location_id
left join sub_locations sl on sl.id = f.sub_location_id
left join finding_types ft on ft.id = f.finding_type_id;

-- ---------------------------------------------------------------------
-- 8. 처리 함수 (RPC)
-- ---------------------------------------------------------------------
create or replace function public.log_event(p_finding uuid, p_action text, p_detail text)
returns void language sql security definer set search_path = public as $$
  insert into finding_events (finding_id, actor_id, action, detail) values (p_finding, auth.uid(), p_action, p_detail)
$$;
revoke execute on function public.log_event(uuid, text, text) from public, anon, authenticated;

-- 점검(회차) 등록
create or replace function public.create_inspection(
  p_module text, p_site uuid, p_date date, p_title text, p_inspectors text, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if perm_level(p_module) < 2 then raise exception '이 점검을 등록할 권한이 없습니다.'; end if;
  insert into inspections (site_id, module_code, inspection_date, title, inspectors, note, created_by)
  values (p_site, p_module, p_date, p_title, nullif(trim(p_inspectors), ''), nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- 지적사항 등록 (점검자)
create or replace function public.create_finding(
  p_id uuid, p_inspection uuid, p_location uuid, p_sub_location uuid, p_sub_location_text text,
  p_type uuid, p_problem text, p_department uuid, p_photos text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_insp inspections%rowtype;
  v_seq int;
  v_path text;
begin
  select * into v_insp from inspections where id = p_inspection for update;
  if not found then raise exception '점검 정보를 찾을 수 없습니다.'; end if;
  if perm_level(v_insp.module_code) < 2 then raise exception '지적사항을 등록할 권한이 없습니다.'; end if;
  if coalesce(trim(p_problem), '') = '' then raise exception '문제점을 입력해 주세요.'; end if;
  if not exists (select 1 from departments where id = p_department and site_id = v_insp.site_id) then
    raise exception '조치 요청 부서가 올바르지 않습니다.';
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq from findings where inspection_id = p_inspection;

  insert into findings (id, inspection_id, site_id, module_code, seq, location_id, sub_location_id,
                        sub_location_text, finding_type_id, problem, request_department_id, created_by)
  values (coalesce(p_id, gen_random_uuid()), p_inspection, v_insp.site_id, v_insp.module_code, v_seq,
          p_location, p_sub_location, nullif(trim(p_sub_location_text), ''), p_type, trim(p_problem),
          p_department, auth.uid())
  returning id into p_id;

  foreach v_path in array coalesce(p_photos, '{}') loop
    if v_path not like p_id::text || '/%' then raise exception '사진 경로가 올바르지 않습니다.'; end if;
    insert into finding_photos (finding_id, kind, path, created_by) values (p_id, 'before', v_path, auth.uid());
  end loop;

  perform log_event(p_id, '등록', null);
  return p_id;
end $$;

-- 지적사항 삭제 (등록자: 담당자 지정 전까지 / 관리자: 언제든)
create or replace function public.delete_finding(p_finding uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_f findings%rowtype; v_paths text[];
begin
  select * into v_f from findings where id = p_finding;
  if not found then raise exception '지적사항을 찾을 수 없습니다.'; end if;
  if not (is_admin() or (v_f.created_by = auth.uid() and v_f.status = 'assign_wait')) then
    raise exception '삭제할 수 없습니다. (등록자는 담당자 지정 전까지만 삭제 가능)';
  end if;
  select coalesce(array_agg(path), '{}') into v_paths from finding_photos where finding_id = p_finding;
  delete from findings where id = p_finding;
  return v_paths;
end $$;

-- 조치담당자 지정/변경 (부서 지정자·승인자·관리자)
create or replace function public.assign_finding(p_finding uuid, p_users uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_before text; v_after text;
begin
  select * into v_f from findings where id = p_finding for update;
  if not found then raise exception '지적사항을 찾을 수 없습니다.'; end if;
  if not can_assign(p_finding) then raise exception '조치담당자를 지정할 권한이 없습니다.'; end if;
  if v_f.status = 'closed' then raise exception '종결된 건은 담당자를 변경할 수 없습니다.'; end if;
  if coalesce(array_length(p_users, 1), 0) = 0 then raise exception '조치담당자를 1명 이상 선택해 주세요.'; end if;
  if exists (select 1 from unnest(p_users) u(id)
             left join profiles p on p.id = u.id
             where p.id is null or not p.is_active or p.department_id is distinct from v_f.request_department_id) then
    raise exception '조치담당자는 조치 요청 부서 소속 사용자만 지정할 수 있습니다.';
  end if;

  select string_agg(p.name, ', ' order by p.name) into v_before
    from finding_assignees a join profiles p on p.id = a.user_id where a.finding_id = p_finding;

  delete from finding_assignees where finding_id = p_finding and user_id <> all (p_users);
  insert into finding_assignees (finding_id, user_id, assigned_by)
    select p_finding, u, auth.uid() from unnest(p_users) u
    on conflict do nothing;

  select string_agg(p.name, ', ' order by p.name) into v_after
    from finding_assignees a join profiles p on p.id = a.user_id where a.finding_id = p_finding;

  if v_f.status = 'assign_wait' then
    update findings set status = 'plan_wait' where id = p_finding;
    perform log_event(p_finding, '담당자 지정', v_after);
  elsif v_before is distinct from v_after then
    perform log_event(p_finding, '담당자 변경', coalesce(v_before, '-') || ' → ' || v_after);
  end if;
end $$;

-- 조치계획 등록/수정 (조치담당자)
-- p_measures : [{"kind":"immediate|short|long","content":"...","target_date":"YYYY-MM-DD"}]
create or replace function public.save_plan(p_finding uuid, p_measures jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_item jsonb;
  v_kind text; v_content text; v_date date;
  v_old finding_measures%rowtype;
  v_kinds text[] := '{}';
begin
  select * into v_f from findings where id = p_finding for update;
  if not found then raise exception '지적사항을 찾을 수 없습니다.'; end if;
  if not (is_assignee(p_finding) or is_admin()) then raise exception '조치담당자만 계획을 등록할 수 있습니다.'; end if;
  if v_f.status not in ('plan_wait', 'in_progress') then raise exception '현재 단계에서는 계획을 수정할 수 없습니다.'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) loop
    v_kind    := v_item->>'kind';
    v_content := nullif(trim(v_item->>'content'), '');
    v_date    := nullif(v_item->>'target_date', '')::date;
    if v_content is null then continue; end if;
    if v_kind not in ('immediate', 'short', 'long') then raise exception '조치 구분이 올바르지 않습니다.'; end if;
    if v_date is null then raise exception '각 조치의 목표일을 입력해 주세요.'; end if;
    v_kinds := v_kinds || v_kind;

    select * into v_old from finding_measures where finding_id = p_finding and kind = v_kind;
    if found then
      if v_old.target_date <> v_date then
        insert into measure_date_history (measure_id, old_date, new_date, reason, changed_by)
        values (v_old.id, v_old.target_date, v_date, '계획 수정', auth.uid());
        update finding_measures set content = v_content, target_date = v_date,
               reschedule_count = reschedule_count + 1 where id = v_old.id;
      else
        update finding_measures set content = v_content where id = v_old.id;
      end if;
    else
      insert into finding_measures (finding_id, kind, content, target_date, original_target_date)
      values (p_finding, v_kind, v_content, v_date, v_date);
    end if;
  end loop;

  if coalesce(array_length(v_kinds, 1), 0) = 0 then
    raise exception '즉시조치 / 단기대책 / 장기대책 중 1개 이상 입력해 주세요.';
  end if;

  -- 입력에서 빠진 미완료 조치는 삭제 (완료된 조치는 보존)
  delete from finding_measures where finding_id = p_finding and not is_done and kind <> all (v_kinds);

  perform log_event(p_finding, case when v_f.status = 'plan_wait' then '조치계획 등록' else '조치계획 수정' end, null);
  if v_f.status = 'plan_wait' then
    update findings set status = 'in_progress' where id = p_finding;
  end if;
end $$;

-- 조치결과 보고 (조치담당자)
-- p_items : [{"measure_id":"...","done":true|false,"new_target_date":"YYYY-MM-DD"|null}]
-- 모든 조치 완료 → 개선 후 사진 필수 → 승인 대기
-- 미완료 조치 존재 → 미완료 이유·진행현황 필수, 목표일 지난 조치는 새 목표일 필수
create or replace function public.report_progress(
  p_finding uuid, p_items jsonb, p_reason text, p_progress text, p_after_photos text[]
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_item jsonb;
  v_m finding_measures%rowtype;
  v_done boolean; v_new date;
  v_path text;
  v_all_done boolean;
begin
  select * into v_f from findings where id = p_finding for update;
  if not found then raise exception '지적사항을 찾을 수 없습니다.'; end if;
  if not (is_assignee(p_finding) or is_admin()) then raise exception '조치담당자만 결과를 보고할 수 있습니다.'; end if;
  if v_f.status <> 'in_progress' then raise exception '조치 중 단계에서만 결과를 보고할 수 있습니다.'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_m from finding_measures
     where id = (v_item->>'measure_id')::uuid and finding_id = p_finding for update;
    if not found then raise exception '조치 항목이 올바르지 않습니다.'; end if;
    v_done := coalesce((v_item->>'done')::boolean, false);
    v_new  := nullif(v_item->>'new_target_date', '')::date;

    if v_done then
      if not v_m.is_done then
        update finding_measures set is_done = true, done_at = kst_today() where id = v_m.id;
      end if;
    else
      if v_m.is_done then
        update finding_measures set is_done = false, done_at = null where id = v_m.id;
      end if;
      if v_new is not null and v_new < kst_today() then
        raise exception '새 목표일은 오늘 이후 날짜여야 합니다.';
      end if;
      if v_new is not null and v_new <> v_m.target_date then
        insert into measure_date_history (measure_id, old_date, new_date, reason, changed_by)
        values (v_m.id, v_m.target_date, v_new, nullif(trim(p_reason), ''), auth.uid());
        update finding_measures set target_date = v_new, reschedule_count = reschedule_count + 1 where id = v_m.id;
      elsif v_m.target_date < kst_today() then
        raise exception '목표일이 지난 미완료 조치는 목표일을 다시 정해야 합니다.';
      end if;
    end if;
  end loop;

  foreach v_path in array coalesce(p_after_photos, '{}') loop
    if v_path not like p_finding::text || '/%' then raise exception '사진 경로가 올바르지 않습니다.'; end if;
    insert into finding_photos (finding_id, kind, path, created_by) values (p_finding, 'after', v_path, auth.uid());
  end loop;

  select not exists (select 1 from finding_measures where finding_id = p_finding and not is_done) into v_all_done;

  if v_all_done then
    if not exists (select 1 from finding_photos where finding_id = p_finding and kind = 'after') then
      raise exception '완료 처리하려면 개선 후 사진을 1장 이상 등록해야 합니다.';
    end if;
    update findings set status = 'approval_wait', completed_at = now() where id = p_finding;
    perform log_event(p_finding, '완료 보고', nullif(trim(p_progress), ''));
    return 'approval_wait';
  else
    if coalesce(trim(p_reason), '') = '' or coalesce(trim(p_progress), '') = '' then
      raise exception '미완료 이유와 진행현황을 입력해 주세요.';
    end if;
    insert into finding_progress (finding_id, reason, progress, created_by)
    values (p_finding, trim(p_reason), trim(p_progress), auth.uid());
    perform log_event(p_finding, '미완료 보고', trim(p_reason));
    return 'in_progress';
  end if;
end $$;

-- 종결 승인 / 반려 (부서장)
create or replace function public.approve_finding(p_finding uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_approve(p_finding) then raise exception '종결 승인 권한이 없습니다.'; end if;
  update findings set status = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_finding and status = 'approval_wait';
  if not found then raise exception '승인 대기 상태가 아닙니다.'; end if;
  perform log_event(p_finding, '종결 승인', nullif(trim(p_comment), ''));
end $$;

create or replace function public.reject_finding(p_finding uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_approve(p_finding) then raise exception '반려 권한이 없습니다.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '반려 사유를 입력해 주세요.'; end if;
  update findings set status = 'in_progress', completed_at = null
   where id = p_finding and status = 'approval_wait';
  if not found then raise exception '승인 대기 상태가 아닙니다.'; end if;
  perform log_event(p_finding, '반려', trim(p_reason));
end $$;

-- 지시사항 / 코멘트
create or replace function public.add_comment(p_finding uuid, p_body text, p_directive boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_view_finding(p_finding) then raise exception '권한이 없습니다.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception '내용을 입력해 주세요.'; end if;
  insert into finding_comments (finding_id, user_id, is_directive, body)
  values (p_finding, auth.uid(), coalesce(p_directive, false), trim(p_body));
end $$;

-- 첫 로그인 비밀번호 변경 완료 표시
create or replace function public.mark_password_changed()
returns void language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 9. 사진 저장소 (비공개 버킷, 경로 = {지적사항ID}/{파일})
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('findings', 'findings', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy findings_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'findings' and (owner_id = auth.uid()::text or public.can_view_photo_path(name)));
create policy findings_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'findings');
create policy findings_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'findings' and (owner_id = auth.uid()::text or public.is_admin()));
