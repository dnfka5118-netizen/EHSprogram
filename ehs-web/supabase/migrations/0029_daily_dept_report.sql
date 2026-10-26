-- 0029 : 관리감독자 일일점검 월간 일지 → 부서장 일괄 승인 (부서 월간 레포트)
--   관리감독자 : 월이 끝나면 일지를 [부서장에게 제출] (마감 = 다음 달 첫째 주 금요일)
--   부서장     : 부서 레포트(구역별 실시율·발굴·완료·개선조치율·기한 초과·반복 부적합)에서 제출된 일지를 한 번에 승인 · 일지별 반려(사유)
--   부서       : 구역의 부서 → 팀(최상위 부서), 부서장 = _dept_heads(팀) (부서 결재자 · 부서 역할 '승인자')
--   알림       : 제출 → 부서장, 승인·반려 → 제출자, 마감 2일 전·당일 미제출 → 구역 관리감독자 (queue_daily_log_reminders, 매일 아침 cron)
--   예전 방식(일지마다 전자결재)으로 이미 상신된 일지는 그대로 둠 (새 제출 불가)

alter table public.daily_logs
  add column if not exists status        text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  add column if not exists submitted_at  timestamptz,
  add column if not exists submitted_by  uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at   timestamptz,
  add column if not exists approved_by   uuid references public.profiles(id) on delete set null,
  add column if not exists reject_reason text;

-- 구역 → 부서(팀)
create or replace function public.daily_area_team(p_area uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(d.parent_id, d.id) from daily_areas a join departments d on d.id = a.department_id where a.id = p_area
$$;

-- 제출 마감 : 다음 달 첫째 주 금요일
create or replace function public.daily_log_deadline(p_ym date) returns date
language sql immutable as $$
  select n + ((5 - extract(isodow from n)::int + 7) % 7)
    from (select (date_trunc('month', p_ym) + interval '1 month')::date n) x
$$;

create or replace function public.is_daily_team_head(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or auth.uid() = any(_dept_heads(p_team))
$$;

create or replace function public._daily_log_notify(p_user uuid, p_subject text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() or not exists (select 1 from profiles where id = p_user and is_active) then return; end if;
  insert into notifications (user_id, kind, subject, body, link) values (p_user, 'daily_log', p_subject, p_body, p_link);
end $$;
revoke execute on function public._daily_log_notify(uuid, text, text, text) from public, anon, authenticated;

-- 제출 : 구역 담당 관리감독자(또는 관리자) · 그 달이 끝난 뒤(말일 포함) · 작성 중/반려 상태
create or replace function public.submit_daily_log_to_head(p_log uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v daily_logs%rowtype; a daily_areas%rowtype; v_team uuid; v_u uuid; v_n int;
begin
  select * into v from daily_logs where id = p_log for update;
  if not found then raise exception '일지를 찾을 수 없습니다.'; end if;
  select * into a from daily_areas where id = v.area_id;
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = a.id and user_id = auth.uid())) then
    raise exception '이 구역 담당 관리감독자만 제출할 수 있습니다.';
  end if;
  if exists (select 1 from approvals where module_code = 'insp_daily' and doc_id = p_log and status in ('in_review', 'approved')) then
    raise exception '이 일지는 이전 방식(전자결재)으로 이미 상신되었습니다.';
  end if;
  if v.status not in ('draft', 'rejected') then raise exception '이미 제출된 일지입니다.'; end if;
  if (v.ym + interval '1 month' - interval '1 day')::date > kst_today() then
    raise exception '%월 점검이 끝난 뒤(말일부터) 제출할 수 있습니다.', extract(month from v.ym)::int;
  end if;
  v_team := daily_area_team(a.id);
  if v_team is null or coalesce(array_length(_dept_heads(v_team), 1), 0) = 0 then
    raise exception '구역의 부서장이 지정되지 않았습니다. 관리자에게 환경설정 → 부서·결재자에서 부서장 지정을 요청해 주세요.';
  end if;
  update daily_logs set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(), reject_reason = null where id = p_log;
  select count(*) into v_n from daily_logs l join daily_areas x on x.id = l.area_id
   where l.ym = v.ym and l.status = 'submitted' and daily_area_team(x.id) = v_team;
  foreach v_u in array _dept_heads(v_team) loop
    perform _daily_log_notify(v_u,
      format('[EHS] 관리감독자 일지 제출 : %s (%s월) — 승인 대기 %s건', a.name, extract(month from v.ym)::int, v_n),
      format('%s 님이 %s월 관리감독자 일일업무일지를 제출했습니다. 부서 레포트에서 한 번에 승인할 수 있습니다.',
             (select name from profiles where id = auth.uid()), extract(month from v.ym)::int),
      format('/insp/daily/reports/%s?ym=%s', v_team, to_char(v.ym, 'YYYY-MM')));
  end loop;
end $$;

-- 제출 취소 : 승인 전, 제출한 사람(또는 관리자)
create or replace function public.cancel_daily_log_submit(p_log uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v daily_logs%rowtype;
begin
  select * into v from daily_logs where id = p_log for update;
  if not found then raise exception '일지를 찾을 수 없습니다.'; end if;
  if v.status <> 'submitted' then raise exception '승인 대기 중인 일지만 제출을 취소할 수 있습니다.'; end if;
  if not (is_admin() or v.submitted_by = auth.uid()) then raise exception '제출한 사람만 취소할 수 있습니다.'; end if;
  update daily_logs set status = 'draft', submitted_at = null, submitted_by = null where id = p_log;
end $$;

-- 부서장 일괄 승인 : 제출된 일지만 · 부서장(팀) 또는 관리자
create or replace function public.approve_daily_logs(p_logs uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare v record; v_n int := 0;
begin
  if coalesce(array_length(p_logs, 1), 0) = 0 then raise exception '승인할 일지를 선택해 주세요.'; end if;
  for v in select l.*, a.name area_name, daily_area_team(a.id) team from daily_logs l join daily_areas a on a.id = l.area_id where l.id = any(p_logs) for update of l loop
    if not is_daily_team_head(v.team) then raise exception '% 일지는 승인 권한이 없습니다 (해당 부서장만).', v.area_name; end if;
    if v.status <> 'submitted' then raise exception '% 일지는 제출 상태가 아닙니다.', v.area_name; end if;
    update daily_logs set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = v.id;
    perform _daily_log_notify(v.submitted_by,
      format('[EHS] 관리감독자 일지 승인 : %s (%s월)', v.area_name, extract(month from v.ym)::int),
      format('%s월 관리감독자 일일업무일지가 승인되었습니다.', extract(month from v.ym)::int),
      '/insp/daily/logs/' || v.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 반려 : 일지별 · 사유 필수 → 관리감독자가 고쳐 다시 제출
create or replace function public.reject_daily_log(p_log uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception '반려 사유를 입력해 주세요.'; end if;
  select l.*, a.name area_name, daily_area_team(a.id) team into v from daily_logs l join daily_areas a on a.id = l.area_id where l.id = p_log;
  if not found then raise exception '일지를 찾을 수 없습니다.'; end if;
  if not is_daily_team_head(v.team) then raise exception '해당 부서장만 반려할 수 있습니다.'; end if;
  if v.status <> 'submitted' then raise exception '제출된 일지만 반려할 수 있습니다.'; end if;
  update daily_logs set status = 'rejected', reject_reason = trim(p_reason) where id = p_log;
  perform _daily_log_notify(v.submitted_by,
    format('[EHS] 관리감독자 일지 반려 : %s (%s월)', v.area_name, extract(month from v.ym)::int),
    format(E'%s월 관리감독자 일일업무일지가 반려되었습니다. 고쳐서 다시 제출해 주세요.\n\n사유 : %s', extract(month from v.ym)::int, trim(p_reason)),
    '/insp/daily/logs/' || v.id);
end $$;

-- 소급 입력 : 제출·승인된 달도 막음 (반려되면 다시 가능)
create or replace function public._daily_backfill_check(p_area uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text; v_log text;
begin
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = p_area and user_id = auth.uid())) then
    raise exception '이 구역 담당 관리감독자만 소급 입력할 수 있습니다.';
  end if;
  if p_day >= kst_today() then raise exception '소급 입력은 지난 날짜만 가능합니다. 오늘 점검은 QR 또는 [점검하기] 로 해 주세요.'; end if;
  if exists (select 1 from daily_checks where area_id = p_area and check_date = p_day) then
    raise exception '%은(는) 이미 점검 기록이 있는 날입니다.', to_char(p_day, 'YYYY.MM.DD');
  end if;
  select ap.status into v_status
    from daily_logs l join approvals ap on ap.module_code = 'insp_daily' and ap.doc_id = l.id
   where l.area_id = p_area and l.ym = date_trunc('month', p_day)::date;
  select l.status into v_log from daily_logs l where l.area_id = p_area and l.ym = date_trunc('month', p_day)::date;
  if v_status in ('in_review', 'approved') or v_log in ('submitted', 'approved') then
    raise exception '%월 일지가 이미 상신(제출)되어 소급 입력할 수 없습니다. 제출을 취소하거나 반려된 뒤 입력해 주세요.', extract(month from p_day)::int;
  end if;
end $$;
revoke execute on function public._daily_backfill_check(uuid, date) from public, anon, authenticated;

-- 마감 알림 : 지난달 일지 마감 2일 전 · 당일, 아직 제출하지 않은 구역의 관리감독자에게 (사람마다 한 통, 하루 한 번)
create or replace function public.queue_daily_log_reminders(p_today date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, kst_today());
  v_ym date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_due date := daily_log_deadline(v_ym);
  v_user uuid; v_areas text; v_n int := 0;
begin
  if v_today not in (v_due - 2, v_due) then return 0; end if;
  for v_user, v_areas in
    select m.user_id, string_agg(a.name, ', ' order by a.name)
      from daily_area_members m join daily_areas a on a.id = m.area_id and a.is_active
      left join daily_logs l on l.area_id = a.id and l.ym = v_ym
     where a.created_at::date <= (v_ym + interval '1 month' - interval '1 day')::date
       and coalesce(l.status, 'draft') in ('draft', 'rejected')
       and not exists (select 1 from approvals ap where ap.module_code = 'insp_daily' and ap.doc_id = l.id and ap.status in ('in_review', 'approved'))
       and exists (select 1 from profiles p where p.id = m.user_id and p.is_active)
       and not exists (select 1 from reminder_log r where r.user_id = m.user_id and r.stage = 'daily_log' and r.sent_on = v_today)
     group by m.user_id
  loop
    insert into notifications (user_id, kind, subject, body, link)
    values (v_user, 'reminder',
      format('[EHS] %s월 관리감독자 일지 제출 마감 %s', extract(month from v_ym)::int, case when v_today = v_due then '오늘' else to_char(v_due, 'MM.DD(Dy)') end),
      format(E'%s월 관리감독자 일일업무일지를 %s 까지 부서장에게 제출해 주세요.\n\n미제출 구역 : %s\n\n관리감독자 일일점검 → 나의 점검 현황 → [일지 열기 · 제출]',
             extract(month from v_ym)::int, to_char(v_due, 'YYYY.MM.DD'), v_areas),
      '/insp/daily?view=mine&ym=' || to_char(v_ym, 'YYYY-MM'));
    insert into reminder_log (sent_on, user_id, stage, target_date) values (v_today, v_user, 'daily_log', v_due);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.queue_daily_log_reminders(date) from public, anon, authenticated;

grant execute on function public.daily_area_team(uuid) to authenticated;
grant execute on function public.daily_log_deadline(date) to authenticated;
grant execute on function public.is_daily_team_head(uuid) to authenticated;
grant execute on function public.submit_daily_log_to_head(uuid) to authenticated;
grant execute on function public.cancel_daily_log_submit(uuid) to authenticated;
grant execute on function public.approve_daily_logs(uuid[]) to authenticated;
grant execute on function public.reject_daily_log(uuid, text) to authenticated;
