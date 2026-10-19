-- =====================================================================
-- 관리감독자 일일점검 : 대체 점검 · 소급 입력 · 미점검 지표
--   · 대체 점검 : 담당자가 휴가·외근 등으로 없을 때 다른 임직원이 QR 을 찍고 '누구 대신 · 사유' 를 적어 저장
--                (대신한 담당자는 그날 점검 지표 '미진행' 에서 빠짐)
--   · 소급 입력 : 빠진 날을 월간 일지(컴퓨터)에서 입력 — 사유 필수, 그 달 일지 상신 전까지 (반려되면 다시 가능)
--                법적 기록은 채우되 점검 지표에서는 그날을 '미진행' 으로 셈
--   · 담당 관리감독자로 지정되면 점검 주기(관리감독자 일일점검 · 매일)에 자동 등록 → 미점검일이 지표에 자동 반영
-- =====================================================================

alter table public.daily_checks
  add column if not exists substitute_for  uuid references public.profiles(id) on delete set null, -- 대신한 담당자
  add column if not exists sub_reason      text,                                                    -- 휴가 · 외근 · 교육 · 기타
  add column if not exists is_backfill     boolean not null default false,
  add column if not exists backfill_reason text;

-- ---------------------------------------------------------------------
-- 1. 화면에 줄 내용 (QR · 소급 공통) : 구역 · 양식 · 그날 할 항목 · 그날 저장한 판정
-- ---------------------------------------------------------------------
create or replace function public._daily_payload(p_area uuid, p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', p_day,
    'biz_day', is_biz_day(p_day),
    'area', jsonb_build_object(
      'id', a.id, 'name', a.name, 'form_code', a.form_code, 'department_id', a.department_id,
      'location_id', a.location_id, 'sub_location_id', a.sub_location_id,
      'department', (select name from departments where id = a.department_id),
      'location', (select name from locations where id = a.location_id),
      'sub_location', (select name from sub_locations where id = a.sub_location_id),
      'site', (select name from sites where id = a.site_id)),
    'form', (select to_jsonb(f) from daily_forms f where f.code = a.form_code),
    'is_member', exists (select 1 from daily_area_members where area_id = a.id and user_id = auth.uid()) or is_admin(),
    'can_substitute', perm_level('insp_daily') >= 2,
    'members', coalesce((select jsonb_agg(p.name || coalesce(' ' || p.position, '') order by p.name)
                           from daily_area_members m join profiles p on p.id = m.user_id where m.area_id = a.id), '[]'),
    'member_list', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'position', p.position) order by p.name)
                           from daily_area_members m join profiles p on p.id = m.user_id where m.area_id = a.id and p.id <> auth.uid()), '[]'),
    'checked_by', (select name from profiles where id = c.user_id),
    'checked_at', c.submitted_at,
    'is_backfill', coalesce(c.is_backfill, false),
    'substitute_for', (select name from profiles where id = c.substitute_for),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'category', i.category, 'code', i.code, 'content', i.content, 'cycle', i.cycle, 'cycle_note', i.cycle_note,
               'done_on', d.done_on, 'result', r.result, 'note', r.note, 'action', r.action, 'finding_id', r.finding_id)
             order by i.sort_order)
        from daily_due_items(a.id, p_day) d
        join daily_form_items i on i.id = d.item_id
        left join daily_results r on r.check_id = c.id and r.item_id = i.id), '[]')
  )
  from daily_areas a
  left join daily_checks c on c.area_id = a.id and c.check_date = p_day
  where a.id = p_area
$$;
revoke execute on function public._daily_payload(uuid, date) from public, anon, authenticated;

create or replace function public.daily_open(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_member() then raise exception '로그인이 필요합니다.'; end if;
  select id into v_id from daily_areas where qr_token = p_token and is_active;
  if v_id is null then raise exception '등록되지 않았거나 재발급되어 사용할 수 없는 QR 코드입니다. EHS부서에 문의해 주세요.'; end if;
  return _daily_payload(v_id, kst_today());
end $$;

-- 소급 입력 화면 (월간 일지 → 빠진 날)
create or replace function public.daily_backfill_open(p_area uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _daily_backfill_check(p_area, p_day);
  return _daily_payload(p_area, p_day);
end $$;

-- 소급 가능 여부 : 담당자·관리자 · 지난 날 · 기록 없는 날 · 그 달 일지가 상신(결재 중/완료)되지 않음
create or replace function public._daily_backfill_check(p_area uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = p_area and user_id = auth.uid())) then
    raise exception '이 구역 담당 관리감독자만 소급 입력할 수 있습니다.';
  end if;
  if p_day >= kst_today() then raise exception '소급 입력은 지난 날짜만 가능합니다. 오늘 점검은 현장 QR 로 해 주세요.'; end if;
  if exists (select 1 from daily_checks where area_id = p_area and check_date = p_day) then
    raise exception '%은(는) 이미 점검 기록이 있는 날입니다.', to_char(p_day, 'YYYY.MM.DD');
  end if;
  select ap.status into v_status
    from daily_logs l join approvals ap on ap.module_code = 'insp_daily' and ap.doc_id = l.id
   where l.area_id = p_area and l.ym = date_trunc('month', p_day)::date;
  if v_status in ('in_review', 'approved') then
    raise exception '%월 일지가 이미 상신(결재 중 또는 완료)되어 소급 입력할 수 없습니다.', extract(month from p_day)::int;
  end if;
end $$;
revoke execute on function public._daily_backfill_check(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 저장 공통 (QR · 대체 · 소급)
--   p_mode : 'qr' (현장) · 'backfill' (소급, 사진 선택)
-- ---------------------------------------------------------------------
create or replace function public._daily_save(p_area uuid, p_day date, p_results jsonb, p_mode text, p_scanned_at timestamptz,
                                              p_sub_for uuid, p_sub_reason text, p_backfill_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_area daily_areas%rowtype;
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
  v_photo_req boolean := p_mode = 'qr';
begin
  select * into v_area from daily_areas where id = p_area;

  -- 그날 할 항목이 모두 들어왔는지
  select string_agg(i.code, ', ' order by i.sort_order) into v_missing
    from daily_due_items(v_area.id, p_day) d join daily_form_items i on i.id = d.item_id
   where d.done_on is null
     and not exists (select 1 from jsonb_array_elements(coalesce(p_results, '[]')) x
                      where (x->>'item_id')::uuid = i.id and x->>'result' in ('O', 'X', '△', '-'));
  if v_missing is not null then raise exception '판정하지 않은 항목이 있습니다 : %', v_missing; end if;

  insert into daily_checks (area_id, check_date, form_code, user_id, scanned_at, substitute_for, sub_reason, is_backfill, backfill_reason)
  values (v_area.id, p_day, v_area.form_code, auth.uid(), p_scanned_at, p_sub_for, nullif(trim(p_sub_reason), ''),
          p_mode = 'backfill', nullif(trim(p_backfill_reason), ''))
  on conflict (area_id, check_date) do update
    set user_id = excluded.user_id, submitted_at = now(), form_code = excluded.form_code,
        scanned_at = coalesce(excluded.scanned_at, daily_checks.scanned_at),
        substitute_for = excluded.substitute_for, sub_reason = excluded.sub_reason
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
      if v_photo_req and jsonb_array_length(coalesce(v_f->'photos', '[]')) = 0 then raise exception '%의 개선 전 사진을 찍어 주세요.', v_it.code; end if;
      v_dept := coalesce(nullif(v_f->>'department_id', '')::uuid, v_area.department_id);
      if v_dept is null or not exists (select 1 from departments where id = v_dept and site_id = v_area.site_id) then
        raise exception '%의 개선 부서를 골라 주세요.', v_it.code;
      end if;
      if v_action = 'immediate' then
        if coalesce(trim(v_f->>'fix'), '') = '' then raise exception '%의 즉시 조치 내용을 적어 주세요.', v_it.code; end if;
        if v_photo_req and jsonb_array_length(coalesce(v_f->'after_photos', '[]')) = 0 then raise exception '%의 개선 후 사진을 찍어 주세요.', v_it.code; end if;
      end if;

      v_fid := coalesce(nullif(v_f->>'id', '')::uuid, gen_random_uuid());
      v_insp := _daily_inspection(v_area.site_id, p_day);
      select coalesce(max(seq), 0) + 1 into v_seq from findings where inspection_id = v_insp;
      v_problem := format('[%s %s] %s', v_it.code, left(regexp_replace(v_it.content, '\s+', ' ', 'g'), 40), v_note);
      insert into findings (id, inspection_id, site_id, module_code, seq, location_id, sub_location_id, sub_location_text,
                            finding_type_id, problem, request_department_id, created_by)
      values (v_fid, v_insp, v_area.site_id, 'insp_daily', v_seq, v_area.location_id, v_area.sub_location_id,
              case when v_area.sub_location_id is null then v_area.name end,
              nullif(v_f->>'type_id', '')::uuid, v_problem, v_dept, auth.uid());
      for v_path in select jsonb_array_elements_text(coalesce(v_f->'photos', '[]')) loop
        if v_path not like v_fid::text || '/%' then raise exception '사진 경로가 올바르지 않습니다.'; end if;
        insert into finding_photos (finding_id, kind, path, created_by) values (v_fid, 'before', v_path, auth.uid());
      end loop;

      if v_action = 'immediate' then
        insert into finding_assignees (finding_id, user_id, assigned_by) values (v_fid, auth.uid(), auth.uid());
        insert into finding_measures (finding_id, kind, content, target_date, original_target_date, is_done, done_at)
        values (v_fid, 'immediate', trim(v_f->>'fix'), p_day, p_day, true, p_day);
        for v_path in select jsonb_array_elements_text(coalesce(v_f->'after_photos', '[]')) loop
          if v_path not like v_fid::text || '/%' then raise exception '사진 경로가 올바르지 않습니다.'; end if;
          insert into finding_photos (finding_id, kind, path, created_by) values (v_fid, 'after', v_path, auth.uid());
        end loop;
        perform log_event(v_fid, '등록(즉시 조치)', v_area.name || case when p_mode = 'backfill' then ' · 소급 입력' else '' end);
        update findings set status = 'approval_wait', completed_at = now() where id = v_fid;
        perform log_event(v_fid, '완료 보고', '즉시 조치 : ' || trim(v_f->>'fix'));
      else
        perform log_event(v_fid, '등록', v_area.name || case when p_mode = 'backfill' then ' · 소급 입력' else '' end);
      end if;
      v_new_findings := v_new_findings + 1;
    end if;

    insert into daily_results (check_id, item_id, result, note, action, finding_id, user_id)
    values (v_check, v_it.id, v_res, v_note, case when v_fid is not null then coalesce(v_old.action, v_action) end, v_fid, auth.uid())
    on conflict (check_id, item_id) do update
      set result = excluded.result, note = excluded.note, action = excluded.action,
          finding_id = excluded.finding_id, user_id = excluded.user_id;
  end loop;

  return jsonb_build_object('check_id', v_check, 'findings', v_new_findings);
end $$;
revoke execute on function public._daily_save(uuid, date, jsonb, text, timestamptz, uuid, text, text) from public, anon, authenticated;

-- 현장 QR 저장 (담당자 · 또는 대체 점검)
drop function if exists public.submit_daily_check(text, jsonb, timestamptz);
create or replace function public.submit_daily_check(p_token text, p_results jsonb, p_scanned_at timestamptz default null,
                                                     p_sub_for uuid default null, p_sub_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_area daily_areas%rowtype;
  v_today date := kst_today();
  v_member boolean;
  v_r jsonb;
  v_prev daily_checks%rowtype;
begin
  if perm_level('insp_daily') < 2 then raise exception '관리감독자 일일점검을 등록할 권한이 없습니다.'; end if;
  select * into v_area from daily_areas where qr_token = p_token and is_active;
  if not found then raise exception '등록되지 않았거나 재발급되어 사용할 수 없는 QR 코드입니다.'; end if;
  v_member := is_admin() or exists (select 1 from daily_area_members where area_id = v_area.id and user_id = auth.uid());

  if p_sub_for is not null or not v_member then
    if p_sub_for is null then raise exception '이 구역(%) 담당자가 아닙니다. 대체 점검이면 누구 대신인지 골라 주세요.', v_area.name; end if;
    if not exists (select 1 from daily_area_members where area_id = v_area.id and user_id = p_sub_for) then
      raise exception '대신하는 사람이 이 구역 담당 관리감독자가 아닙니다.';
    end if;
    if p_sub_for = auth.uid() then raise exception '본인을 대신할 수는 없습니다.'; end if;
    if coalesce(trim(p_sub_reason), '') = '' then raise exception '대체 점검 사유를 적어 주세요. (휴가, 외근 등)'; end if;
  end if;
  select * into v_prev from daily_checks where area_id = v_area.id and check_date = v_today;
  if v_prev.is_backfill then raise exception '오늘 기록이 소급 입력으로 되어 있습니다.'; end if;

  v_r := _daily_save(v_area.id, v_today, p_results, 'qr', p_scanned_at, p_sub_for, p_sub_reason, null);

  -- 점검 지표 : 오늘 점검 실시 (대체 점검이면 대신한 담당자도 미진행에서 빠짐)
  insert into inspection_checks (module_code, user_id, done_on, note)
  select 'insp_daily', u, v_today, v_area.name || case when u = p_sub_for then ' · 대체 점검(' || (select name from profiles where id = auth.uid()) || ')' else '' end
    from unnest(array[auth.uid(), p_sub_for]) u
   where u is not null
     and not exists (select 1 from inspection_checks where module_code = 'insp_daily' and user_id = u and done_on = v_today);
  return v_r;
end $$;

-- 소급 입력 (월간 일지 · 컴퓨터) — 지표 '실시' 기록은 남기지 않음 (그날은 미진행)
create or replace function public.submit_daily_backfill(p_area uuid, p_day date, p_results jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if perm_level('insp_daily') < 2 then raise exception '관리감독자 일일점검을 등록할 권한이 없습니다.'; end if;
  perform _daily_backfill_check(p_area, p_day);
  if coalesce(trim(p_reason), '') = '' then raise exception '소급 입력 사유를 적어 주세요.'; end if;
  return _daily_save(p_area, p_day, p_results, 'backfill', null, null, null, p_reason);
end $$;

-- ---------------------------------------------------------------------
-- 3. 담당 지정 = 점검 주기(매일) 자동 등록 → 미점검일이 점검 지표에 반영
-- ---------------------------------------------------------------------
create or replace function public.set_daily_area_members(p_area uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_removed uuid[];
begin
  if not is_admin() then raise exception '관리자만 지정할 수 있습니다.'; end if;
  select coalesce(array_agg(user_id), '{}') into v_removed
    from daily_area_members where area_id = p_area and user_id <> all (coalesce(p_users, '{}'));
  delete from daily_area_members where area_id = p_area and user_id = any (v_removed);
  insert into daily_area_members (area_id, user_id) select p_area, u from unnest(coalesce(p_users, '{}')) u on conflict do nothing;

  insert into inspection_schedules (module_code, user_id, period, start_date, note)
  select 'insp_daily', u, 'daily', kst_today(), '일일점검 구역 담당 (자동)' from unnest(coalesce(p_users, '{}')) u
  on conflict (module_code, user_id) do update
    set is_active = true, end_date = null,
        start_date = case when inspection_schedules.is_active and inspection_schedules.end_date is null then inspection_schedules.start_date else kst_today() end;

  -- 어느 구역에도 담당이 아니게 된 사람은 어제까지로 종료
  update inspection_schedules s
     set end_date = greatest(s.start_date, kst_today() - 1),
         is_active = s.start_date < kst_today()
   where s.module_code = 'insp_daily' and s.user_id = any (v_removed) and s.end_date is null
     and not exists (select 1 from daily_area_members m where m.user_id = s.user_id);
end $$;

-- 이미 지정된 담당자 : 오늘부터 점검 주기 등록
insert into public.inspection_schedules (module_code, user_id, period, start_date, note)
select distinct 'insp_daily', m.user_id, 'daily', public.kst_today(), '일일점검 구역 담당 (자동)' from public.daily_area_members m
on conflict (module_code, user_id) do nothing;
