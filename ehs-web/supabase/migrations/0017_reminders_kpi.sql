-- =====================================================================
-- 단계별 알림 (영업일) · 점검 지표 (연 누적, 인사평가용) · 점검 주기
--
--  1. 기본값이 '없음'인 프로세스 (modules.restricted) : '점검 지표' 는 권한을 준 사람만
--  2. 그때의 부서 기록 : 등록자 부서(findings.created_dept_id) · 조치담당자 부서(finding_assignees.dept_id)
--  3. 영업일 : 주말 + 공휴일(holidays) 제외 · 기한 숫자는 app_settings('reminder')
--  4. 점검 주기 (점검별·사람별) + '지적사항 없이 점검 완료' 기록 → 점검 미진행 판단
--  5. 단계별 알림 : 하루 한 번(영업일), 사람마다 한 통으로 모아 notifications 에 적재 + reminder_log 기록
--  6. 점검 지표 : 발굴 · 조치 · 지연 · 미진행 (팀별 · 개인별 · 월별), 지난해는 1월 1일에 확정 저장
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 권한
-- ---------------------------------------------------------------------
alter table public.modules add column if not exists restricted boolean not null default false;

insert into public.modules (code, slug, name, category, form, sort_order, is_enabled, restricted)
values ('insp_kpi', 'kpi', '점검 지표', '사내점검', null, 90, true, true)
on conflict (code) do update set restricted = true, is_enabled = true;

-- 0 = 없음, 1 = 열람, 2 = 작성 · restricted 프로세스는 개별 권한이 없으면 '없음' (관리자 제외)
create or replace function public.perm_level(p_module text) returns int
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null or not p.is_active then 0
    when p.is_admin then 2
    when up.level = 'write' then 2
    when up.level = 'read'  then 1
    when up.level = 'none'  then 0
    when coalesce(m.restricted, false) then 0
    when p.user_type = 'employee' then 2
    else 0
  end
  from (select auth.uid() as uid) u
  left join profiles p on p.id = u.uid
  left join user_permissions up on up.user_id = u.uid and up.module_code = p_module
  left join modules m on m.code = p_module
$$;

-- ---------------------------------------------------------------------
-- 2. 그때의 부서 (팀 지표는 일이 있었던 때의 부서로)
-- ---------------------------------------------------------------------
alter table public.findings          add column if not exists created_dept_id uuid references public.departments(id) on delete set null;
alter table public.finding_assignees add column if not exists dept_id         uuid references public.departments(id) on delete set null;

create or replace function public.stamp_finding_dept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_dept_id is null then
    select dept_team(department_id) into new.created_dept_id from profiles where id = new.created_by;
  end if;
  return new;
end $$;
drop trigger if exists finding_dept_stamp on public.findings;
create trigger finding_dept_stamp before insert on public.findings for each row execute function public.stamp_finding_dept();

create or replace function public.stamp_assignee_dept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dept_id is null then
    select dept_team(department_id) into new.dept_id from profiles where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists assignee_dept_stamp on public.finding_assignees;
create trigger assignee_dept_stamp before insert on public.finding_assignees for each row execute function public.stamp_assignee_dept();

update public.findings f set created_dept_id = dept_team(p.department_id) from public.profiles p where p.id = f.created_by and f.created_dept_id is null;
update public.finding_assignees a set dept_id = dept_team(p.department_id) from public.profiles p where p.id = a.user_id and a.dept_id is null;

-- ---------------------------------------------------------------------
-- 3. 영업일 · 설정
-- ---------------------------------------------------------------------
create table if not exists public.holidays (
  day  date primary key,
  name text not null default ''
);
alter table public.holidays enable row level security;
create policy read_all on public.holidays for select to authenticated using (is_member());
create policy admin_all on public.holidays for all to authenticated using (is_admin()) with check (is_admin());

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy read_all on public.app_settings for select to authenticated using (is_member());
create policy admin_all on public.app_settings for all to authenticated using (is_admin()) with check (is_admin());

insert into public.app_settings (key, value) values
  ('reminder', '{"assign_days": 2, "plan_days": 2, "due_before_days": 1, "approve_days": 2, "repeat_days": 2}')
on conflict (key) do nothing;

create or replace function public.reminder_setting(p_key text, p_default int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>p_key)::int from app_settings where key = 'reminder'), p_default)
$$;

create or replace function public.is_biz_day(p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_day) < 6 and not exists (select 1 from holidays where day = p_day)
$$;

-- a 다음 날부터 b 까지의 영업일 수 (a 가 금요일, b 가 다음 주 월요일이면 1)
create or replace function public.biz_days_between(p_from date, p_to date) returns int
language sql stable security definer set search_path = public as $$
  select case when p_to <= p_from then 0 else
    (select count(*)::int from generate_series(p_from + 1, p_to, interval '1 day') g(d) where is_biz_day(g.d::date)) end
$$;

-- ---------------------------------------------------------------------
-- 4. 점검 주기 · 이상 없음 기록
-- ---------------------------------------------------------------------
create table if not exists public.inspection_schedules (
  id          uuid primary key default gen_random_uuid(),
  module_code text not null references public.modules(code) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  period      text not null check (period in ('daily', 'weekly', 'monthly')),
  start_date  date not null default kst_today(),
  end_date    date,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  unique (module_code, user_id)
);
alter table public.inspection_schedules enable row level security;
create policy read_kpi on public.inspection_schedules for select to authenticated using (perm_level('insp_kpi') >= 1 or user_id = auth.uid());
create policy admin_all on public.inspection_schedules for all to authenticated using (is_admin()) with check (is_admin());

-- 점검은 했지만 지적사항이 없을 때 (점검 미진행으로 세지 않도록)
create table if not exists public.inspection_checks (
  id          uuid primary key default gen_random_uuid(),
  module_code text not null references public.modules(code) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  done_on     date not null default kst_today(),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists inspection_checks_user on public.inspection_checks (user_id, module_code, done_on);
alter table public.inspection_checks enable row level security;
create policy read_own on public.inspection_checks for select to authenticated using (user_id = auth.uid() or perm_level('insp_kpi') >= 1);

create or replace function public.record_no_finding(p_module text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if perm_level(p_module) < 2 then raise exception '이 점검을 등록할 권한이 없습니다.'; end if;
  insert into inspection_checks (module_code, user_id, note) values (p_module, auth.uid(), nullif(trim(p_note), ''));
end $$;

-- ---------------------------------------------------------------------
-- 5. 단계별 알림
-- ---------------------------------------------------------------------
create table if not exists public.reminder_log (
  id              bigserial primary key,
  sent_on         date not null default kst_today(),
  user_id         uuid references public.profiles(id) on delete cascade,
  finding_id      uuid references public.findings(id) on delete cascade,
  measure_id      uuid,
  target_date     date,
  stage           text not null,
  notification_id uuid,
  created_at      timestamptz not null default now()
);
create index if not exists reminder_log_key on public.reminder_log (finding_id, stage, user_id, sent_on);
alter table public.reminder_log enable row level security;
create policy read_admin on public.reminder_log for select to authenticated using (is_admin());

-- 오늘 알릴 대상 (보내지는 않음) : 단계 · 받는 사람 · 지적사항 · 조치
--   assign   : 담당자 지정 대기 N영업일 → 부서 조치담당자 지정자 (없으면 승인자 → 관리자)
--   plan     : 계획 수립 대기 N영업일 (지정 시점부터) → 조치담당자
--   due_soon : 미완료 조치의 목표일 N영업일 전 ~ 당일 → 조치담당자 (같은 목표일에 한 번)
--   overdue  : 목표일 지남 → 조치담당자
--   approve  : 종결 승인 대기 N영업일 → 부서 승인자 (없으면 관리자)
--   같은 건 · 같은 단계 · 같은 사람에게는 repeat_days 영업일마다만 다시 알림
create or replace function public._reminder_targets(p_today date)
returns table (stage text, user_id uuid, finding_id uuid, measure_id uuid, target_date date)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select reminder_setting('assign_days', 2) assign_days, reminder_setting('plan_days', 2) plan_days,
           reminder_setting('due_before_days', 1) due_before, reminder_setting('approve_days', 2) approve_days,
           greatest(reminder_setting('repeat_days', 2), 1) repeat_days
  ),
  raw as (
    -- 담당자 지정
    select 'assign'::text stage, u user_id, f.id finding_id, null::uuid measure_id, null::date target_date
      from findings f, cfg,
           lateral unnest(coalesce(nullif(dept_role_users(f.request_department_id, 'assigner'), '{}'),
                                   nullif(dept_role_users(f.request_department_id, 'approver'), '{}'),
                                   admin_ids())) u
     where f.status = 'assign_wait'
       and biz_days_between((f.created_at at time zone 'Asia/Seoul')::date, p_today) >= cfg.assign_days
    union all
    -- 개선계획 수립
    select 'plan', a.user_id, f.id, null, null
      from findings f join finding_assignees a on a.finding_id = f.id, cfg
     where f.status = 'plan_wait'
       and biz_days_between((select (max(x.assigned_at) at time zone 'Asia/Seoul')::date from finding_assignees x where x.finding_id = f.id), p_today) >= cfg.plan_days
    union all
    -- 목표일 임박
    select 'due_soon', a.user_id, f.id, m.id, m.target_date
      from finding_measures m join findings f on f.id = m.finding_id join finding_assignees a on a.finding_id = f.id, cfg
     where f.status = 'in_progress' and not m.is_done
       and m.target_date >= p_today and biz_days_between(p_today, m.target_date) <= cfg.due_before
    union all
    -- 목표일 지남
    select 'overdue', a.user_id, f.id, m.id, m.target_date
      from finding_measures m join findings f on f.id = m.finding_id join finding_assignees a on a.finding_id = f.id
     where f.status = 'in_progress' and not m.is_done and m.target_date < p_today
    union all
    -- 종결 승인
    select 'approve', u, f.id, null, null
      from findings f, cfg,
           lateral unnest(coalesce(nullif(dept_role_users(f.request_department_id, 'approver'), '{}'), admin_ids())) u
     where f.status = 'approval_wait'
       and biz_days_between((coalesce(f.completed_at, f.created_at) at time zone 'Asia/Seoul')::date, p_today) >= cfg.approve_days
  )
  select distinct r.stage, r.user_id, r.finding_id, r.measure_id, r.target_date
    from raw r, cfg
   where exists (select 1 from profiles p where p.id = r.user_id and p.is_active)
     and not exists (
       select 1 from reminder_log l
        where l.finding_id = r.finding_id and l.stage = r.stage and l.user_id = r.user_id
          and (case when r.stage = 'due_soon'
                    then l.measure_id is not distinct from r.measure_id and l.target_date is not distinct from r.target_date
                    else biz_days_between(l.sent_on, p_today) < cfg.repeat_days end))
$$;
revoke execute on function public._reminder_targets(date) from public, anon, authenticated;

-- 알림 한 줄 : 점검 #번호 · 장소 · 문제점 앞부분
create or replace function public.finding_brief(p_finding uuid) returns text
language sql stable security definer set search_path = public as $$
  select format('%s · %s%s · %s', finding_label(f.id), coalesce(l.name, '-'), coalesce(' / ' || coalesce(sl.name, f.sub_location_text), ''),
                left(regexp_replace(f.problem, '\s+', ' ', 'g'), 40))
    from findings f left join locations l on l.id = f.location_id left join sub_locations sl on sl.id = f.sub_location_id
   where f.id = p_finding
$$;

-- 관리자 미리보기 : 오늘 알림이 나간다면 누구에게 무엇이
create or replace function public.preview_reminders()
returns table (stage text, user_id uuid, user_name text, finding_id uuid, label text, target_date date)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 볼 수 있습니다.'; end if;
  return query
    select t.stage, t.user_id, p.name, t.finding_id, finding_brief(t.finding_id), t.target_date
      from _reminder_targets(kst_today()) t join profiles p on p.id = t.user_id
     order by p.name, t.stage;
end $$;

-- 매일 아침(영업일) 한 번 : 사람마다 한 통으로 모아 알림 대기열에 넣고 기록 — 발송기(서버)가 보냄
create or replace function public.queue_reminders(p_today date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, kst_today());
  v_user uuid;
  v_body text;
  v_nid uuid;
  v_n int := 0;
  v_titles constant jsonb := '{"assign":"조치담당자 지정이 필요한 건","plan":"개선계획 수립이 필요한 건","due_soon":"개선 목표일이 다가온 조치","overdue":"개선 목표일이 지난 조치","approve":"종결 승인(완료 확인)이 필요한 건"}';
  v_order constant text[] := array['overdue', 'due_soon', 'assign', 'plan', 'approve'];
begin
  if not is_biz_day(v_today) then return 0; end if;
  drop table if exists _t;
  create temp table _t on commit drop as select * from _reminder_targets(v_today);
  for v_user in select distinct user_id from _t loop
    select string_agg(sec, E'\n' order by ord) into v_body
      from (
        select array_position(v_order, t.stage) ord,
               format(E'■ %s (%s건)\n%s\n', v_titles->>t.stage, count(*),
                      string_agg('- ' || finding_brief(t.finding_id) || coalesce(' [목표 ' || to_char(t.target_date, 'YY.MM.DD') || ']', ''), E'\n')) sec
          from _t t where t.user_id = v_user group by t.stage
      ) s;
    insert into notifications (user_id, kind, subject, body, link)
    values (v_user, 'reminder',
            format('[EHS] 처리가 필요한 점검 조치가 있습니다 (%s건)', (select count(distinct finding_id) from _t where user_id = v_user)),
            format(E'%s 기준, 아래 항목의 처리가 늦어지고 있습니다.\n\n', to_char(v_today, 'YYYY.MM.DD')) || v_body
              || E'\n프로그램에 로그인해 "내 할 일" 에서 처리해 주세요.',
            '/')
    returning id into v_nid;
    insert into reminder_log (sent_on, user_id, finding_id, measure_id, target_date, stage, notification_id)
      select v_today, t.user_id, t.finding_id, t.measure_id, t.target_date, t.stage, v_nid from _t t where t.user_id = v_user;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.queue_reminders(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. 점검 지표
-- ---------------------------------------------------------------------
create table if not exists public.kpi_snapshots (
  id           uuid primary key default gen_random_uuid(),
  year         int  not null,
  data         jsonb not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null, -- null = 자동 확정
  note         text
);
create index if not exists kpi_snapshots_year on public.kpi_snapshots (year, confirmed_at desc);
alter table public.kpi_snapshots enable row level security;
create policy read_kpi on public.kpi_snapshots for select to authenticated using (perm_level('insp_kpi') >= 1);

-- 한 해 지표 (p_module 이 null 이면 모든 지적사항형 점검)
--   발굴 : 등록한 사람 · 등록일 기준 (기존 엑셀 이관 건 제외 — 등록자가 실제 발굴자가 아님)
--   조치 : 종결된 건 × 조치담당자 각자 1건 · 종결일 기준 (팀은 1건)
--   지연 : 원래 목표일이 올해 · 이미 지난 조치 중 원래 목표일 안에 완료하지 못한 것 (분모 = 그 조치 수)
--   미진행 : 점검 주기 (점검별·사람별) 중 끝난 주기에 등록·이상없음 기록이 없는 것
create or replace function public._kpi_compute(p_year int, p_module text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with y as (
    select make_date(p_year, 1, 1) d0, least(make_date(p_year, 12, 31), kst_today()) d1
  ),
  fm as (select code from modules where form = 'finding' and (p_module is null or code = p_module)),
  found as (
    select f.created_by uid, f.created_dept_id team, extract(month from f.created_at at time zone 'Asia/Seoul')::int mo
      from findings f, y
     where f.module_code in (select code from fm)
       and (f.created_at at time zone 'Asia/Seoul')::date between y.d0 and y.d1
       and coalesce(f.legacy_ref, '') not like 'xlsx:%'
  ),
  closed as (
    select a.user_id uid, a.dept_id team, f.id fid, extract(month from f.closed_at at time zone 'Asia/Seoul')::int mo
      from findings f join finding_assignees a on a.finding_id = f.id, y
     where f.status = 'closed' and f.module_code in (select code from fm)
       and (f.closed_at at time zone 'Asia/Seoul')::date between y.d0 and y.d1
  ),
  due as (
    select m.id mid, a.user_id uid, a.dept_id team, extract(month from m.original_target_date)::int mo,
           (case when m.is_done then coalesce(m.done_at, kst_today()) > m.original_target_date else true end) late
      from finding_measures m join findings f on f.id = m.finding_id join finding_assignees a on a.finding_id = f.id, y
     where f.module_code in (select code from fm)
       and m.original_target_date between y.d0 and y.d1
       and (m.is_done or m.original_target_date < kst_today())
  ),
  periods as (
    select s.user_id uid, s.module_code, g.ps::date ps,
           (case s.period when 'daily' then g.ps::date when 'weekly' then g.ps::date + 6
                          else (g.ps + interval '1 month' - interval '1 day')::date end) pe,
           s.period
      from inspection_schedules s, y,
           lateral generate_series(
             case s.period when 'weekly' then date_trunc('week', greatest(s.start_date, y.d0))::date
                           when 'monthly' then date_trunc('month', greatest(s.start_date, y.d0))::date
                           else greatest(s.start_date, y.d0) end,
             least(y.d1, coalesce(s.end_date, y.d1)),
             case s.period when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end) g(ps)
     where s.is_active and s.module_code in (select code from modules where p_module is null or code = p_module)
  ),
  sched as (
    select p.uid, extract(month from p.pe)::int mo,
           not (exists (select 1 from findings f where f.created_by = p.uid and f.module_code = p.module_code
                          and (f.created_at at time zone 'Asia/Seoul')::date between p.ps and p.pe)
             or exists (select 1 from inspection_checks c where c.user_id = p.uid and c.module_code = p.module_code
                          and c.done_on between p.ps and p.pe)) missed
      from periods p
     where p.pe < kst_today() and (p.period <> 'daily' or is_biz_day(p.ps))
  ),
  people as (
    select uid from found union select uid from closed union select uid from due union select uid from sched
  ),
  per_person as (
    select pr.id uid, pr.name, pr.position, dept_team(pr.department_id) team,
           (select count(*) from found x where x.uid = pr.id) found,
           (select count(*) from closed x where x.uid = pr.id) closed,
           (select count(*) from due x where x.uid = pr.id) due,
           (select count(*) from due x where x.uid = pr.id and x.late) late,
           (select count(*) from sched x where x.uid = pr.id) expected,
           (select count(*) from sched x where x.uid = pr.id and x.missed) missed
      from profiles pr where pr.id in (select uid from people where uid is not null)
  ),
  teams as (
    select team from found union select team from closed union select team from due
    union select team from per_person where expected > 0
  ),
  per_team as (
    select d.id team, d.name, d.division,
           (select count(*) from found x where x.team = d.id) found,
           (select count(distinct fid) from closed x where x.team = d.id) closed,
           (select count(distinct mid) from due x where x.team = d.id) due,
           (select count(distinct mid) from due x where x.team = d.id and x.late) late,
           (select coalesce(sum(expected), 0) from per_person x where x.team = d.id) expected,
           (select coalesce(sum(missed), 0) from per_person x where x.team = d.id) missed
      from departments d where d.id in (select team from teams where team is not null)
  ),
  per_month as (
    select g.mo,
           (select count(*) from found x where x.mo = g.mo) found,
           (select count(distinct fid) from closed x where x.mo = g.mo) closed,
           (select count(distinct mid) from due x where x.mo = g.mo) due,
           (select count(distinct mid) from due x where x.mo = g.mo and x.late) late,
           (select count(*) from sched x where x.mo = g.mo and x.missed) missed
      from generate_series(1, 12) g(mo)
  )
  select jsonb_build_object(
    'year', p_year, 'module', p_module, 'as_of', (select d1 from y),
    'people', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from per_person x), '[]'),
    'teams', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from per_team x), '[]'),
    'months', (select jsonb_agg(to_jsonb(x) order by x.mo) from per_month x)
  )
$$;
revoke execute on function public._kpi_compute(int, text) from public, anon, authenticated;

-- 확정 저장 형식 : 전체 + 점검별
create or replace function public._kpi_bundle(p_year int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'all', _kpi_compute(p_year, null),
    'modules', coalesce((select jsonb_object_agg(code, _kpi_compute(p_year, code)) from modules where form = 'finding'), '{}'))
$$;
revoke execute on function public._kpi_bundle(int) from public, anon, authenticated;

-- 화면 조회 : 올해는 실시간, 지난해는 가장 최근 확정본 (없으면 실시간)
create or replace function public.kpi_year(p_year int, p_module text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v kpi_snapshots%rowtype;
begin
  if perm_level('insp_kpi') < 1 then raise exception '점검 지표를 볼 권한이 없습니다.'; end if;
  if p_year < extract(year from kst_today())::int then
    select * into v from kpi_snapshots where year = p_year order by confirmed_at desc limit 1;
    if found then
      return (case when p_module is null then v.data->'all' else v.data->'modules'->p_module end)
             || jsonb_build_object('confirmed_at', v.confirmed_at, 'confirmed_by', (select name from profiles where id = v.confirmed_by));
    end if;
  end if;
  return _kpi_compute(p_year, p_module) || jsonb_build_object('confirmed_at', null);
end $$;

-- 관리자 : 지난해 지표 다시 확정 (이력은 모두 남김)
create or replace function public.confirm_kpi(p_year int, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 확정할 수 있습니다.'; end if;
  if p_year >= extract(year from kst_today())::int then raise exception '올해 지표는 해가 바뀐 뒤에 확정합니다.'; end if;
  insert into kpi_snapshots (year, data, confirmed_by, note) values (p_year, _kpi_bundle(p_year), auth.uid(), nullif(trim(p_note), ''));
end $$;

-- 매일 한 번(서버) : 지난해 확정본이 없으면 자동 확정
create or replace function public._kpi_auto_confirm() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from kst_today())::int - 1;
begin
  if exists (select 1 from kpi_snapshots where year = v_year) then return false; end if;
  insert into kpi_snapshots (year, data, note) values (v_year, _kpi_bundle(v_year), '1월 1일 자동 확정');
  return true;
end $$;
revoke execute on function public._kpi_auto_confirm() from public, anon, authenticated;
