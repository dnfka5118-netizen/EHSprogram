-- =====================================================================
-- 관리감독자 일일점검 (안전보건 관리감독자 일일업무일지 A·B·C·D형)
--   · 점검 구역(My AREA)마다 양식(A~D)·담당 관리감독자·QR 코드
--   · 현장 QR 을 찍으면 그 구역 양식의 오늘 할 항목(매일 D · 주 1회 W · 월 1회 M)이 나옴
--   · 판정 O 적합 / X 부적합 / △ 이벤트 / - 해당 없음
--   · X : 즉시 조치(개선 전·후 사진 → 부서장 확인만) 또는 개선 요청(기존 점검과 같은 처리 흐름)
--   · 한 달 기록 = 일일업무일지 → 공통 전자결재로 상신
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 모듈 : 지적사항형으로 사용 (현황·내 할 일·알림·점검 지표에 함께 잡힘)
-- ---------------------------------------------------------------------
update public.modules set form = 'finding', is_enabled = true, name = '관리감독자 일일점검' where code = 'insp_daily';

-- ---------------------------------------------------------------------
-- 2. 양식 · 점검 항목 (환경설정에서 수정)
-- ---------------------------------------------------------------------
create table if not exists public.daily_forms (
  code        text primary key,                 -- A · B · C · D
  name        text not null,
  form_no     text,                             -- 양식 CE310-11, R01
  writer_note text,                             -- 작성자 (예 : 생산, 지원 부서원)
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

create table if not exists public.daily_form_items (
  id         uuid primary key default gen_random_uuid(),
  form_code  text not null references public.daily_forms(code) on update cascade on delete cascade,
  sort_order int  not null default 0,
  category   text not null default '',          -- 활동 항목 (예방점검, 보호구/방호장치 …)
  code       text not null default '',          -- 항목 구분 (1-1)
  content    text not null,                     -- 세부 항목
  cycle      text not null default 'D' check (cycle in ('D', 'W', 'M')),
  cycle_note text,                              -- 해당 시 / 작업 시 / 발견 시
  is_active  boolean not null default true
);
create index if not exists daily_form_items_form on public.daily_form_items (form_code, sort_order);

alter table public.daily_forms      enable row level security;
alter table public.daily_form_items enable row level security;
create policy read_all on public.daily_forms      for select to authenticated using (is_member());
create policy admin_all on public.daily_forms     for all to authenticated using (is_admin()) with check (is_admin());
create policy read_all on public.daily_form_items for select to authenticated using (is_member());
create policy admin_all on public.daily_form_items for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 3. 점검 구역 (My AREA) · 담당 관리감독자 · QR
-- ---------------------------------------------------------------------
create table if not exists public.daily_areas (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites(id),
  name            text not null,
  form_code       text not null references public.daily_forms(code) on update cascade,
  department_id   uuid references public.departments(id) on delete set null,  -- 개선 요청 기본 부서 · 일지 결재 부서
  location_id     uuid references public.locations(id) on delete set null,
  sub_location_id uuid references public.sub_locations(id) on delete set null,
  qr_token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.daily_area_members (
  area_id uuid not null references public.daily_areas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (area_id, user_id)
);
create index if not exists daily_area_members_user on public.daily_area_members (user_id);

alter table public.daily_areas        enable row level security;
alter table public.daily_area_members enable row level security;
create policy read_all on public.daily_areas        for select to authenticated using (is_member());
create policy admin_all on public.daily_areas       for all to authenticated using (is_admin()) with check (is_admin());
create policy read_all on public.daily_area_members for select to authenticated using (is_member());
create policy admin_all on public.daily_area_members for all to authenticated using (is_admin()) with check (is_admin());

-- QR 노출 시 관리자 재발급 : 이전 QR 은 바로 무효
create or replace function public.reissue_daily_qr(p_area uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not is_admin() then raise exception '관리자만 재발급할 수 있습니다.'; end if;
  update daily_areas set qr_token = replace(gen_random_uuid()::text, '-', '') where id = p_area returning qr_token into v;
  if v is null then raise exception '구역을 찾을 수 없습니다.'; end if;
  return v;
end $$;

-- 구역 담당 관리감독자 저장 (관리자)
create or replace function public.set_daily_area_members(p_area uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 지정할 수 있습니다.'; end if;
  delete from daily_area_members where area_id = p_area and user_id <> all (coalesce(p_users, '{}'));
  insert into daily_area_members (area_id, user_id) select p_area, u from unnest(coalesce(p_users, '{}')) u on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 4. 하루 점검 기록 (구역 · 날짜마다 1건, 같은 날 다시 저장하면 갱신)
-- ---------------------------------------------------------------------
create table if not exists public.daily_checks (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references public.daily_areas(id) on delete cascade,
  check_date   date not null default kst_today(),
  form_code    text not null,
  user_id      uuid references public.profiles(id) on delete set null,   -- 마지막으로 저장한 점검자
  scanned_at   timestamptz,                                              -- QR 을 찍은 시각
  submitted_at timestamptz not null default now(),
  unique (area_id, check_date)
);

create table if not exists public.daily_results (
  check_id   uuid not null references public.daily_checks(id) on delete cascade,
  item_id    uuid not null references public.daily_form_items(id) on delete cascade,
  result     text not null check (result in ('O', 'X', '△', '-')),
  note       text,
  action     text check (action in ('immediate', 'request')),   -- X 일 때 : 즉시 조치 / 개선 요청
  finding_id uuid references public.findings(id) on delete set null,
  user_id    uuid references public.profiles(id) on delete set null,
  primary key (check_id, item_id)
);
create index if not exists daily_results_finding on public.daily_results (finding_id);

alter table public.daily_checks  enable row level security;
alter table public.daily_results enable row level security;
create policy read_daily on public.daily_checks for select to authenticated
  using (perm_level('insp_daily') >= 1 or user_id = auth.uid()
         or exists (select 1 from daily_area_members m where m.area_id = daily_checks.area_id and m.user_id = auth.uid()));
create policy read_daily on public.daily_results for select to authenticated
  using (exists (select 1 from daily_checks c where c.id = daily_results.check_id));

-- 오늘(기준일) 이 구역에서 할 항목 : 매일 · 이번 주(월~일) 아직 안 한 주간 · 이번 달 아직 안 한 월간
--   done_on = 주간·월간 항목을 이번 기간에 이미 한 날 (오늘 한 것은 제외 → 오늘 다시 고칠 수 있음)
create or replace function public.daily_due_items(p_area uuid, p_day date)
returns table (item_id uuid, done_on date)
language sql stable security definer set search_path = public as $$
  select i.id,
         (select max(c.check_date) from daily_checks c join daily_results r on r.check_id = c.id
           where c.area_id = p_area and r.item_id = i.id and c.check_date < p_day
             and c.check_date >= case i.cycle when 'W' then date_trunc('week', p_day)::date
                                              when 'M' then date_trunc('month', p_day)::date else p_day end)
    from daily_areas a join daily_form_items i on i.form_code = a.form_code and i.is_active
   where a.id = p_area
$$;

-- QR 로 연 화면에 필요한 것 한 번에 : 구역 · 양식 · 항목(오늘 할 것 / 이번 기간 이미 함) · 오늘 저장한 판정
create or replace function public.daily_open(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_area daily_areas%rowtype;
  v_today date := kst_today();
  v_check daily_checks%rowtype;
begin
  if not is_member() then raise exception '로그인이 필요합니다.'; end if;
  select * into v_area from daily_areas where qr_token = p_token and is_active;
  if not found then raise exception '등록되지 않았거나 재발급되어 사용할 수 없는 QR 코드입니다. EHS부서에 문의해 주세요.'; end if;
  select * into v_check from daily_checks where area_id = v_area.id and check_date = v_today;

  return jsonb_build_object(
    'today', v_today,
    'biz_day', is_biz_day(v_today),
    'area', jsonb_build_object(
      'id', v_area.id, 'name', v_area.name, 'form_code', v_area.form_code, 'department_id', v_area.department_id,
      'location_id', v_area.location_id, 'sub_location_id', v_area.sub_location_id,
      'department', (select name from departments where id = v_area.department_id),
      'location', (select name from locations where id = v_area.location_id),
      'sub_location', (select name from sub_locations where id = v_area.sub_location_id),
      'site', (select name from sites where id = v_area.site_id)),
    'form', (select to_jsonb(f) from daily_forms f where f.code = v_area.form_code),
    'is_member', exists (select 1 from daily_area_members where area_id = v_area.id and user_id = auth.uid()) or is_admin(),
    'members', coalesce((select jsonb_agg(p.name || coalesce(' ' || p.position, '') order by p.name)
                           from daily_area_members m join profiles p on p.id = m.user_id where m.area_id = v_area.id), '[]'),
    'checked_by', (select name from profiles where id = v_check.user_id),
    'checked_at', v_check.submitted_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'category', i.category, 'code', i.code, 'content', i.content, 'cycle', i.cycle, 'cycle_note', i.cycle_note,
               'done_on', d.done_on, 'result', r.result, 'note', r.note, 'action', r.action, 'finding_id', r.finding_id)
             order by i.sort_order)
        from daily_due_items(v_area.id, v_today) d
        join daily_form_items i on i.id = d.item_id
        left join daily_results r on r.check_id = v_check.id and r.item_id = i.id), '[]')
  );
end $$;

-- 이 구역 점검 회차 (일일점검 · 사업장 · 날짜 · 점검자) 찾기/만들기
create or replace function public._daily_inspection(p_site uuid, p_day date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inspector text := inspector_for('insp_daily');
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('insp_daily' || p_site::text || p_day::text || coalesce(v_inspector, '')));
  select id into v_id from inspections
   where module_code = 'insp_daily' and site_id = p_site and inspection_date = p_day and inspector is not distinct from v_inspector
   order by created_at limit 1;
  if v_id is null then
    insert into inspections (site_id, module_code, inspection_date, title, inspector, created_by)
    values (p_site, 'insp_daily', p_day,
            extract(year from p_day)::int || '년 ' || extract(month from p_day)::int || '월 ' || extract(day from p_day)::int || '일 관리감독자 일일점검',
            v_inspector, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public._daily_inspection(uuid, date) from public, anon, authenticated;

-- 점검 저장
--   p_results : [{ item_id, result: O|X|△|-, note,
--                  action: immediate|request (X 일 때),
--                  finding: { id, department_id, type_id, photos[], after_photos[], fix } (X 이고 아직 지적사항이 없을 때) }]
--   · 오늘 할 항목은 모두 판정해야 저장 (해당 없으면 '-')
--   · X · △ 는 내용 필수, X 는 개선 전 사진 필수, 즉시 조치는 조치 내용 · 개선 후 사진 필수
--   · 즉시 조치 : 점검자가 조치담당자 · 즉시조치 완료 → 바로 '승인 대기' (부서장 확인만)
--   · 개선 요청 : 기존 점검과 같이 '담당자 지정 대기' 로 시작
create or replace function public.submit_daily_check(p_token text, p_results jsonb, p_scanned_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_area daily_areas%rowtype;
  v_today date := kst_today();
  v_check uuid;
  v_item jsonb;
  v_it daily_form_items%rowtype;
  v_res text; v_note text; v_action text;
  v_old daily_results%rowtype;
  v_f jsonb;
  v_fid uuid;
  v_dept uuid;
  v_insp uuid;
  v_seq int;
  v_path text;
  v_problem text;
  v_missing text;
  v_new_findings int := 0;
begin
  if perm_level('insp_daily') < 2 then raise exception '관리감독자 일일점검을 등록할 권한이 없습니다.'; end if;
  select * into v_area from daily_areas where qr_token = p_token and is_active;
  if not found then raise exception '등록되지 않았거나 재발급되어 사용할 수 없는 QR 코드입니다.'; end if;
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = v_area.id and user_id = auth.uid())) then
    raise exception '이 구역(%)의 담당 관리감독자만 점검할 수 있습니다. EHS부서에 담당 지정을 요청해 주세요.', v_area.name;
  end if;

  -- 오늘 할 항목이 모두 들어왔는지
  select string_agg(i.code, ', ' order by i.sort_order) into v_missing
    from daily_due_items(v_area.id, v_today) d join daily_form_items i on i.id = d.item_id
   where d.done_on is null
     and not exists (select 1 from jsonb_array_elements(coalesce(p_results, '[]')) x
                      where (x->>'item_id')::uuid = i.id and x->>'result' in ('O', 'X', '△', '-'));
  if v_missing is not null then raise exception '판정하지 않은 항목이 있습니다 : %', v_missing; end if;

  insert into daily_checks (area_id, check_date, form_code, user_id, scanned_at)
  values (v_area.id, v_today, v_area.form_code, auth.uid(), p_scanned_at)
  on conflict (area_id, check_date) do update
    set user_id = excluded.user_id, submitted_at = now(), form_code = excluded.form_code,
        scanned_at = coalesce(excluded.scanned_at, daily_checks.scanned_at)
  returning id into v_check;

  for v_item in select * from jsonb_array_elements(coalesce(p_results, '[]')) loop
    select * into v_it from daily_form_items where id = (v_item->>'item_id')::uuid and form_code = v_area.form_code;
    if not found then raise exception '이 구역 양식에 없는 항목이 포함되어 있습니다.'; end if;
    v_res := v_item->>'result';
    v_note := nullif(trim(v_item->>'note'), '');
    v_action := case when v_res = 'X' then nullif(v_item->>'action', '') end;
    if v_res not in ('O', 'X', '△', '-') then raise exception '%의 판정이 올바르지 않습니다.', v_it.code; end if;
    if v_res in ('X', '△') and v_note is null then raise exception '%(%)의 내용을 적어 주세요.', v_it.code, case v_res when 'X' then '부적합' else '이벤트' end; end if;

    select * into v_old from daily_results where check_id = v_check and item_id = v_it.id;
    v_fid := v_old.finding_id;
    if v_fid is not null and v_res <> 'X' then
      raise exception '%은(는) 이미 지적사항으로 등록되어 부적합(X)에서 바꿀 수 없습니다.', v_it.code;
    end if;

    if v_res = 'X' and v_fid is null then
      if v_action is null or v_action not in ('immediate', 'request') then raise exception '%의 처리 방법(즉시 조치 / 개선 요청)을 골라 주세요.', v_it.code; end if;
      v_f := coalesce(v_item->'finding', '{}');
      if jsonb_array_length(coalesce(v_f->'photos', '[]')) = 0 then raise exception '%의 개선 전 사진을 찍어 주세요.', v_it.code; end if;
      v_dept := coalesce(nullif(v_f->>'department_id', '')::uuid, v_area.department_id);
      if v_dept is null or not exists (select 1 from departments where id = v_dept and site_id = v_area.site_id) then
        raise exception '%의 개선 부서를 골라 주세요.', v_it.code;
      end if;
      if v_action = 'immediate' then
        if coalesce(trim(v_f->>'fix'), '') = '' then raise exception '%의 즉시 조치 내용을 적어 주세요.', v_it.code; end if;
        if jsonb_array_length(coalesce(v_f->'after_photos', '[]')) = 0 then raise exception '%의 개선 후 사진을 찍어 주세요.', v_it.code; end if;
      end if;

      v_fid := coalesce(nullif(v_f->>'id', '')::uuid, gen_random_uuid());
      v_insp := _daily_inspection(v_area.site_id, v_today);
      select coalesce(max(seq), 0) + 1 into v_seq from findings where inspection_id = v_insp;
      v_problem := format('[%s %s] %s', v_it.code, left(regexp_replace(v_it.content, '\s+', ' ', 'g'), 40), v_note);
      insert into findings (id, inspection_id, site_id, module_code, seq, location_id, sub_location_id, sub_location_text,
                            finding_type_id, problem, request_department_id, created_by)
      values (v_fid, v_insp, v_area.site_id, 'insp_daily', v_seq, v_area.location_id, v_area.sub_location_id,
              case when v_area.sub_location_id is null then v_area.name end,
              nullif(v_f->>'type_id', '')::uuid, v_problem, v_dept, auth.uid());
      for v_path in select jsonb_array_elements_text(v_f->'photos') loop
        if v_path not like v_fid::text || '/%' then raise exception '사진 경로가 올바르지 않습니다.'; end if;
        insert into finding_photos (finding_id, kind, path, created_by) values (v_fid, 'before', v_path, auth.uid());
      end loop;

      if v_action = 'immediate' then
        insert into finding_assignees (finding_id, user_id, assigned_by) values (v_fid, auth.uid(), auth.uid());
        insert into finding_measures (finding_id, kind, content, target_date, original_target_date, is_done, done_at)
        values (v_fid, 'immediate', trim(v_f->>'fix'), v_today, v_today, true, v_today);
        for v_path in select jsonb_array_elements_text(v_f->'after_photos') loop
          if v_path not like v_fid::text || '/%' then raise exception '사진 경로가 올바르지 않습니다.'; end if;
          insert into finding_photos (finding_id, kind, path, created_by) values (v_fid, 'after', v_path, auth.uid());
        end loop;
        perform log_event(v_fid, '등록(즉시 조치)', v_area.name);   -- '등록' 이 아니므로 담당자 지정 요청 메일 없음
        update findings set status = 'approval_wait', completed_at = now() where id = v_fid;
        perform log_event(v_fid, '완료 보고', '즉시 조치 : ' || trim(v_f->>'fix'));  -- 부서장에게 종결 승인 요청
      else
        perform log_event(v_fid, '등록', v_area.name);              -- 개선 부서 지정자에게 조치 요청
      end if;
      v_new_findings := v_new_findings + 1;
    end if;

    insert into daily_results (check_id, item_id, result, note, action, finding_id, user_id)
    values (v_check, v_it.id, v_res, v_note, case when v_fid is not null then coalesce(v_old.action, v_action) end, v_fid, auth.uid())
    on conflict (check_id, item_id) do update
      set result = excluded.result, note = excluded.note, action = excluded.action,
          finding_id = excluded.finding_id, user_id = excluded.user_id;
  end loop;

  -- 점검 지표 : 오늘 점검 실시 (점검 주기 '미진행' 에서 빠짐)
  if not exists (select 1 from inspection_checks where module_code = 'insp_daily' and user_id = auth.uid() and done_on = v_today) then
    insert into inspection_checks (module_code, user_id, done_on, note) values ('insp_daily', auth.uid(), v_today, v_area.name);
  end if;

  return jsonb_build_object('check_id', v_check, 'findings', v_new_findings);
end $$;

-- ---------------------------------------------------------------------
-- 5. 월간 일지 · 전자결재
-- ---------------------------------------------------------------------
create table if not exists public.daily_logs (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references public.daily_areas(id) on delete cascade,
  ym         date not null check (extract(day from ym) = 1),   -- 그 달 1일
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (area_id, ym)
);
alter table public.daily_logs enable row level security;
create policy read_daily on public.daily_logs for select to authenticated
  using (perm_level('insp_daily') >= 1
         or exists (select 1 from daily_area_members m where m.area_id = daily_logs.area_id and m.user_id = auth.uid()));

-- 일지 열기 (없으면 만들기) : 구역 담당자 · 관리자
create or replace function public.open_daily_log(p_area uuid, p_ym date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ym date := date_trunc('month', p_ym)::date;
begin
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = p_area and user_id = auth.uid())) then
    raise exception '이 구역 담당 관리감독자만 일지를 만들 수 있습니다.';
  end if;
  if v_ym > date_trunc('month', kst_today())::date then raise exception '다음 달 일지는 만들 수 없습니다.'; end if;
  insert into daily_logs (area_id, ym, created_by) values (p_area, v_ym, auth.uid())
  on conflict (area_id, ym) do nothing;
  select id into v_id from daily_logs where area_id = p_area and ym = v_ym;
  return v_id;
end $$;

-- 상신 : 작성 = 상신자, 결재선은 양식별 결재선(환경설정)을 상신할 때 수정
create or replace function public.submit_daily_log(p_id uuid, p_steps jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v daily_logs%rowtype; a daily_areas%rowtype;
begin
  select * into v from daily_logs where id = p_id for update;
  if not found then raise exception '일지를 찾을 수 없습니다.'; end if;
  select * into a from daily_areas where id = v.area_id;
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = a.id and user_id = auth.uid())) then
    raise exception '이 구역 담당 관리감독자만 상신할 수 있습니다.';
  end if;
  if not exists (select 1 from daily_checks where area_id = a.id and check_date >= v.ym and check_date < (v.ym + interval '1 month')::date) then
    raise exception '이 달에 저장된 점검 기록이 없습니다.';
  end if;
  return _submit_approval('insp_daily', v.id,
    format('%s년 %s월 관리감독자 일일업무일지(%s형) · %s', extract(year from v.ym)::int, extract(month from v.ym)::int, a.form_code, a.name),
    a.site_id, a.department_id, p_steps);
end $$;

-- 결재 문서 주소
create or replace function public.approval_doc_path(p_module text, p_doc uuid) returns text
language sql immutable as $$
  select case p_module
    when 'permit'     then '/permit/' || p_doc
    when 'risk_adhoc' then '/risk/adhoc/' || p_doc
    when 'insp_daily' then '/insp/daily/logs/' || p_doc
    else '/approvals'
  end
$$;

-- 기본 결재선 : 작성(본인) → 검토(상신할 때 지정, 선택) → 승인(구역 부서장)
insert into public.approval_template_steps (module_code, step_order, step_kind, label, resolver, required)
values ('insp_daily', 1, '담당', '작성',             'drafter',       true),
       ('insp_daily', 2, '검토', '검토',             'pick',          false),
       ('insp_daily', 3, '승인', '승인(해당부서장)', 'doc_dept_head', true)
on conflict (module_code, step_order) do nothing;

-- ---------------------------------------------------------------------
-- 6. 초기 양식 · 항목 (원본 엑셀 CE310-11~14 그대로)
-- ---------------------------------------------------------------------
insert into public.daily_forms (code, name, form_no, writer_note, sort_order) values
  ('A', '안전보건 관리감독자 일일업무일지 (A형)', '양식 CE310-11, R01', '생산, 지원 부서원', 10),
  ('B', '안전보건 관리감독자 일일업무일지 (B형)', '양식 CE310-12, R01', '연구, 품질 부서원', 20),
  ('C', '안전보건 관리감독자 일일업무일지 (C형)', '양식 CE310-14, R00', '그 외 부서원', 30),
  ('D', '안전보건 관리감독자 일일업무일지 (D형)', '양식 CE310-13, R00', '해당 부서장', 40)
on conflict (code) do nothing; 
insert into public.daily_form_items (form_code, sort_order, category, code, content, cycle, cycle_note)
select * from (values
  ('A', 10, '예방점검', '1-1', 'PM/BM 등 정기점검 계획 대비 이행 여부 및 점검표(이력) 확인', 'M', null),
  ('A', 20, '예방점검', '1-2', '설비 연결부분 누출, 누기 여부 확인', 'D', null),
  ('A', 30, '예방점검', '1-3', '설비 본체 균열, 손상, 부식, 노후화 유무 확인', 'D', null),
  ('A', 40, '예방점검', '1-4', '볼트 풀림(I-Marking) 여부 확인', 'D', null),
  ('A', 50, '예방점검', '1-5', '보온재 손상 및 탈락 여부 확인', 'D', null),
  ('A', 60, '예방점검', '1-6', '설비 지지대 내화 페인트 손상 및 볼트 풀림 여부 확인', 'D', null),
  ('A', 70, '예방점검', '1-7', '설비의 소음, 진동 이상 여부 확인', 'D', null),
  ('A', 80, '보호구/방호장치', '2-1', '작업/공정별 필수 보호구(안전모, 안전화 등)를 작업자가 올바르게 착용했는지 확인 및 지도', 'D', null),
  ('A', 90, '보호구/방호장치', '2-2', '가스/누액 감지기의 전원 및 작동 상태(감지 여부) 육안 확인', 'D', null),
  ('A', 100, '보호구/방호장치', '2-3', '안전밸브(PSV)의 봉인(Seal) 탈락 여부 및 밸브 개방 상태 확인', 'D', null),
  ('A', 110, '보호구/방호장치', '2-4', '안전밸브(PSV) 및 파열판의 후단 잔여물 유무 확인', 'D', null),
  ('A', 120, '보호구/방호장치', '2-5', '안전밸브(PSV) 및 파열판의 도장 박리, 부식 및 손상 여부 확인', 'D', null),
  ('A', 130, '보호구/방호장치', '2-6', '접지선 단선, 부식 여부 확인', 'D', null),
  ('A', 140, '사고/응급조치', '3-1', '작업 중 발생한 인적/물적 아차사고 및 재해 즉시 보고 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('A', 150, '사고/응급조치', '3-2', '담당 구역 내 비상연락망 비치 및 최신화 여부 확인', 'M', null),
  ('A', 160, '사고/응급조치', '3-3', '현장 취급, 보관하는 화학물질 종류와 MSDS 일치 여부 확인', 'M', null),
  ('A', 170, '사고/응급조치', '3-4', 'MSDS 제출번호 유무 및 최신화(2년 이내) 여부 확인', 'M', null),
  ('A', 180, '작업장 환경', '4-1', '지정된 구역에 자재/공구 배치, 바닥 청결 및 유분/물기 제거 여부 확인', 'D', null),
  ('A', 190, '작업장 환경', '4-2', '통로/적재구역 등에 표시된 안전 구획 여부 확인', 'M', null),
  ('A', 200, '작업장 환경', '4-3', '통로/적재구역 등에 표시된 안전 구획선 이탈 자재/제품 확인 및 지도', 'D', null),
  ('A', 210, '작업장 환경', '4-4', '화학물질/위험물 지정 장소 보관 여부 확인', 'D', null),
  ('A', 220, '작업장 환경', '4-5', '화학물질/위험물 경고표지/MSDS 부착/비치 여부 확인', 'D', null),
  ('A', 230, '작업장 환경', '4-6', '비상대피로 포함, 작업장/계단/통로의 이동 방해 및 걸려 넘어질 위험(케이블, 자재 등) 확인', 'D', null),
  ('A', 240, '공통/협조', '5-1', '고객사/관공서 등 내/외부 점검 수검 및 지적사항 파악 (수검 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('A', 250, '위험성평가', '6-1', '작업 전 TBM(Tool Box Meeting)을 통한 금일 작업위험요인 및 안전수칙 전파/교육', 'D', '해당 시'),
  ('A', 260, '위험성평가', '6-2', '순회 점검 중 불안전한 상태/행동 등 신규 위험 요인 발굴 (발굴 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('A', 270, '위험성평가', '6-3', '위험성평가 또는 지적사항 개선대책(SOP 변경, 시설 개선 등)의 현장 이행 여부 확인', 'W', null),
  ('A', 280, '유해위험 방지', '7-1', '지게차, 크레인, 컨베이어 등 위험 기계/설비의 작업시작 전 점검표에 따른 점검 실시', 'D', null),
  ('A', 290, '유해위험 방지', '7-2', '환기설비의 점검
1. 후드, 덕트의 마모, 부식 등 그 밖의 손상 여부 확인
2. 송풍기와 배풍기의 주유 및 청결상태 확인
3. 덕트 접속부가 헐거워졌는지 여부 확인
4. 전동기와 배풍기를 연결하는 벨트의 작동 상태 확인', 'D', null),
  ('A', 300, '유해위험 방지', '7-3', '후드 개구면 제어풍속 측정 및 풍속값 기록 (상방형 기준 가스, 증기 1m/s 이상 / 분진, 흄 1.2m/s 이상 충족 여부 확인)', 'M', null),
  ('A', 310, '유해위험 방지', '7-4', '위험물 제조, 취급 설비 및 그 설비의 부속설비가 있는 장소의 온도, 습도, 차광 및 환기상태 확인', 'D', null),
  ('A', 320, '유해위험 방지', '7-5', '작업장 온/습도계 확인, 혹서기/한랭기, 작업자 관리기준 이행 및 ''온도값'' 기록(기준치 31℃이상)', 'D', '작업 시'),
  ('A', 330, '사용제한', '8-1', '누출, 방호장치 결함 등 중대 위험 발견 시, ''사용금지'' 표지 부착 및 작업 중지', 'D', '발견 시'),
  ('A', 340, '작업절차(SOP)', '9-1', '작업자의 해당 공정 표준작업절차서(SOP) 및 안전수칙 준수 여부 확인/지도', 'D', '작업 시'),
  ('A', 350, '도급/협력사', '10-1', '도급/협력업체 작업자의 보호구 착용, SOP 준수 여부 점검 및 정기 합동점검 실시', 'D', '작업 시'),
  ('A', 360, '미흡사항(기타)', '11-1', '순회/점검 시 발견 미흡사항 일지 기록 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', '발견 시'),
  ('B', 10, '예방점검', '1-1', '1. 후드나 덕트의 마모, 부식 등 그 밖의 손상 여부 확인
2. 송풍기와 배풍기의 주유 및 청결상태 확인
3. 덕트 접속부가 헐거워졌는지 여부 확인
4. 전동기와 배풍기를 연결하는 벨트의 작동 상태 확인', 'D', null),
  ('B', 20, '예방점검', '1-2', '가스/누액 감지기의 전원 및 작동 상태(감지 여부) 육안 확인', 'D', null),
  ('B', 30, '예방점검', '1-3', '고압가스 용기 체인·벨트 등 2점 이상 전도방지 조치 상태 및 부식, 변형, 누설 여부 확인', 'D', null),
  ('B', 40, '예방점검', '1-4', '고압가스 용기 주위 2m 이내 화기·인화성물질·발화성물질 존재 여부', 'D', null),
  ('B', 50, '예방점검', '1-5', '고압가스 용기 압력조정기, 역화방지기, 압력방출장치 등 이상 여부 확인', 'D', null),
  ('B', 60, '예방점검', '1-6', '고압가스 용기 충전기한, 배관 표시 확인', 'W', null),
  ('B', 70, '예방점검', '1-7', '문어발식 금지, 미사용 기구 전원 차단, 접지형 콘센트, 배선 피복 손상 및 외함 접지 상태', 'D', null),
  ('B', 80, '보호구/방호장치', '2-1', '실험실 입실 시 실험복, 보안경, 내화학장갑 등 필수 보호구 착용 확인 및 지도', 'D', null),
  ('B', 90, '보호구/방호장치', '2-2', '흄후드 및 국소배기장치 제어풍속 측정 및 풍속값 기록 (상방형 기준 가스, 증기 1m/s 이상 / 분진, 흄 1.2m/s 이상 충족 여부 확인)', 'M', null),
  ('B', 100, '보호구/방호장치', '2-3', '기계 및 공구의 조임부/연결부 이상 및 위험설비 방호장치 설치 상태 확인', 'D', null),
  ('B', 110, '보호구/방호장치', '2-4', '기계기구 회전반경, 작동반경 위험지역 출입금지 방호설비 설치 상태', 'D', null),
  ('B', 120, '사고/응급조치', '3-1', '실험 중 발생한 인적/물적 아차사고 및 재해 즉시 보고 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('B', 130, '사고/응급조치', '3-2', '담당 구역 내 비상연락망 비치 및 최신화 여부 확인', 'M', null),
  ('B', 140, '사고/응급조치', '3-3', '현장 취급, 보관하는 화학물질 종류와 MSDS 일치 여부 확인', 'M', null),
  ('B', 150, '사고/응급조치', '3-4', 'MSDS 제출번호 유무 및 최신화(2년 이내) 여부 확인', 'M', null),
  ('B', 160, '사고/응급조치', '3-5', '실험실 내 유해인자 취급·관리대장 비치 및 보유량 등 최신화 확인', 'W', null),
  ('B', 170, '사고/응급조치', '3-6', '실험실 내 중화제 비치 및 상태 확인', 'W', null),
  ('B', 180, '작업장 환경', '4-1', '연구실 내 정리정돈 및 청결상태, 안전표지 부착 및 훼손, 흡연 및 음식물 섭취 금지 준수 여부', 'D', null),
  ('B', 190, '작업장 환경', '4-2', '지정된 시약 덮개 체결상태 및 용기 분리 배출, 폐액분류 표시 등 준수 여부 확인', 'D', null),
  ('B', 200, '작업장 환경', '4-3', '비상구, 소화전, 밸브, 비상샤워기, 전기 분전반 앞으로의 접근 통로 확보 여부 확인', 'D', null),
  ('B', 210, '공통/협조', '5-1', '고객사/관공서 등 내/외부 점검 수검 및 지적사항 파악 (수검 시 ''△'' 표기)', 'D', null),
  ('B', 220, '위험성평가 (사전유해인자 위험분석)', '6-1', '신규/변경 실험 전, 해당 실험의 위험요인(발열, 폭발, 누출 등) 및 비상조치 절차 게시/교육', 'D', '해당 시'),
  ('B', 230, '위험성평가 (사전유해인자 위험분석)', '6-2', '실험 중 이상 반응, 절차 미준수 등 신규/잠재 위험요인 발굴 (발굴 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('B', 240, '위험성평가 (사전유해인자 위험분석)', '6-3', '위험성평가 개선대책(SOP 변경, 비상조치절차 등) 현장 이행 여부 확인', 'D', null),
  ('B', 250, '유해위험 방지', '7-1', '사용 중인 소분 용기의 경고표시 부착 및 MSDS 내용 숙지 확인', 'D', null),
  ('B', 260, '유해위험 방지', '7-2', '발암물질, 독성물질 등 유해화학물질의 성상별 분류 및 격리보관, 시건장치 사용여부 확인', 'D', null),
  ('B', 270, '유해위험 방지', '7-3', '위험물 제조, 취급 설비 및 그 설비의 부속설비가 있는 장소의 온도, 습도, 차광 및 환기상태 확인', 'D', null),
  ('B', 280, '사용제한', '8-1', '이상 반응, 흄후드 고장 등 중대 위험 발견 시, ''사용금지'' 표지 부착 및 실험 중지', 'D', null),
  ('B', 290, '작업절차(SOP)', '9-1', '실험자가 해당 실험절차(SOP) 및 안전수칙을 준수하며 작업하는지 확인/지도', 'D', null),
  ('B', 300, '미흡사항(기타)', '11-1', '순회/점검 시 발견 미흡사항 일지 기록 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', '해당 시'),
  ('B', 310, '미흡사항(기타)', '11-2', '생물체의 적정 보관 및 멸균·세척 장비 관리, 운영 대장 현행화, 의료폐기물의 분리배출 및 밀폐상태', 'D', null),
  ('C', 10, '예방점검', '1-1', '멀티탭/전열기구 과열, 과부하(문어발식 사용) 여부 확인', 'D', null),
  ('C', 20, '예방점검', '1-2', '사무실 위험요인(바닥 케이블 걸림, 캐비닛 전도 위험 등) 발견 시 즉시 조치/수리 요청', 'D', null),
  ('C', 30, '보호구/방호장치', '2-1', '현장 출입자(방문객 등) 대상 필수 보호구 (안전화 등) 지급 및 착용 지도', 'D', null),
  ('C', 40, '보호구/방호장치', '2-2', '파쇄기, 복사기 등 사무기기의 안전커버(덮개) 및 인터락 상태 점검', 'D', null),
  ('C', 50, '사고/응급조치', '3-1', '사무실 내 넘어짐, 끼임, 베임 등 아차사고 발생 시 즉시 보고 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('C', 60, '사고/응급조치', '3-2', '사무실 내 구급용품, AED(자동제세동기) 위치 및 비상연락망 확인', 'D', null),
  ('C', 70, '작업장 환경', '4-1', '사무실 정리정돈 (케이블 걸림, 상부 보관함 낙하 위험, 문서 과다 적재 등) 상태 확인', 'D', null),
  ('C', 80, '작업장 환경', '4-2', '비상구, 피난 계단, 복도 등 비상 통로에 장애물 (적재물)이 없는지 확인 및 지도', 'D', null),
  ('C', 90, '공통/협조', '5-1', '고객사/관공서 등 내/외부 점검 수검 및 지적사항 파악 (수검 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('C', 100, '위험성평가', '6-1', '사무실 내 위험요인(근골격계 부담, 화재 등) 전파/교육', 'D', null),
  ('C', 110, '위험성평가', '6-2', '사무실 내 불안전한 상태(걸림, 낙하 위험 등)신규 위험요인 발굴 (발굴 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('C', 120, '위험성평가', '6-3', '사무실 위험성평가 개선대책(VODT 휴식, 정리정돈 등) 이행 여부 확인', 'D', null),
  ('C', 130, '유해위험 방지', '7-1', '사무실의 적정 조도, 환기 상태 및 소음 점검', 'D', null),
  ('C', 140, '유해위험 방지', '7-2', '사무동/복지동(휴게실) 냉난방기 작동 상태 및 적정 온/습도 관리', 'D', null),
  ('C', 150, '사용제한', '8-1', '파손되거나 과열되는 전기 기구 (전열기, 멀티탭 등) 즉시 ''사용금지'' 조치', 'D', null),
  ('C', 160, '작업절차(SOP)', '9-1', '담당 임직원의 비상연락망, 재해발생 시 대피/보고 절차 숙지 여부 확인', 'D', null),
  ('C', 170, '작업절차(SOP)', '9-2', '사무실 내 외부업체 공사 시, 안전작업허가 절차 준수 여부 확인', 'D', null),
  ('C', 180, '도급/협력사', '10-1', '사무실 내 도급/협력사(미화, 시설관리 등)의 작업 시 안전조치(경고 표지판 등) 여부 확인', 'D', null),
  ('C', 190, '미흡사항(기타)', '11-1', '점검 시 미흡사항 일지 기록 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('D', 10, '예방점검', '1-1', 'Area 내 현장 관리감독자가 작성한 일일/일상 점검표의 이행 실태 확인', 'D', null),
  ('D', 20, '예방점검', '1-2', '장 점검 지적사항(미흡사항)의 개선 진행 여부 및 결과 추적 관리', 'D', null),
  ('D', 30, '보호구/방호장치', '2-1', '현장 순회 시, 작업자의 필수 보호구 착용 실태 불시 점검', 'D', null),
  ('D', 40, '보호구/방호장치', '2-2', '중요 설비의 안전 인터락(Interlock)이 임의 해제(Bypass)되었는지 여부 확인', 'D', null),
  ('D', 50, '사고/응급조치', '3-1', 'Area 내 발생한 재해/아차사고 접수 및 즉시 상위 보고 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('D', 60, '사고/응급조치', '3-2', '현장 비상연락망, MSDS, 구급용품 등의 관리상태 점검', 'D', null),
  ('D', 70, '작업장 환경', '4-1', '5S 활동 주관 및 우수/불량 구역 점검을 통한 현장 정리정돈 상태 점검/지도', 'D', null),
  ('D', 80, '작업장 환경', '4-2', '현장 내 비상대피로 및 밸브/제어반 접근 통로 확보 상태 점검', 'D', null),
  ('D', 90, '공통/협조', '5-1', '고객사/관공서 등 내/외부 점검주관 및 지적사항 조치/협조 (수검 시 ''△'' 표기 후 2.항목 기록)', 'D', null),
  ('D', 100, '위험성평가', '6-1', 'TBM 참관을 통한 위험성평가 결과 전파 및 작업자 숙지 상태 점검', 'D', null),
  ('D', 110, '위험성평가', '6-2', '현장 관리감독자의 위험요인 발굴 실적 및 내용의 적정성 점검', 'D', null),
  ('D', 120, '위험성평가', '6-3', '위험성평가 감소대책의 이행 상태 점검 및 관련 교육 실태 확인', 'D', null),
  ('D', 130, '유해위험 방지', '7-1', '현장의 유해위험물질 보관, 취급, 표지 부착 등 관리 실태 확인 점검', 'D', null),
  ('D', 140, '유해위험 방지', '7-2', '지게차, 국소배기장치, 위험기계 등 법적 점검이 주기적으로 이행되고 있는지 확인', 'D', null),
  ('D', 150, '유해위험 방지', '7-3', '현장의 혹서기/한랭기 관리 기준(온도 측정, 휴식 부여 등) 이행 여부 점검', 'D', null),
  ('D', 160, '사용제한', '8-1', '순회 중 누출, 화재 등 중대 위험 발견 시 ''작업중지권'' 행사', 'D', null),
  ('D', 170, '작업절차(SOP)', '9-1', '작업자의 SOP 준수 여부 현장 불시 점검', 'D', null),
  ('D', 180, '작업절차(SOP)', '9-2', '안전작업허가서 승인 및 허가서 상의 안전조치가 현장에서 이행되었는지 최종 확인', 'D', null),
  ('D', 190, '도급/협력사', '10-1', '도급/협력사 작업장 순회 점검 및 정기 합동점검 주관/실시', 'D', null),
  ('D', 200, '미흡사항(기타)', '11-1', '관리감독자 일지 ''미흡사항'' 기록 확인 및 조율 (발생 시 ''△'' 표기 후 2.항목 기록)', 'D', null)
) v(form_code, sort_order, category, code, content, cycle, cycle_note)
where not exists (select 1 from public.daily_form_items);
