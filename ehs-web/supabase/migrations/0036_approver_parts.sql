-- =====================================================================
-- 종결 승인자 담당 파트
--   department_roles.part_ids : 승인자가 맡는 파트 (비어 있으면 부서 전체 = 부서장)
--   지적사항의 파트 = 조치담당자 · 완료 보고한 사람의 소속 파트
--   종결 승인 요청 메일 · 아침 '승인 대기' 알림 · 지시사항 메일 · 내 할 일 '종결 승인 필요'
--     → 부서 전체 승인자 + 그 파트를 맡은 승인자만
--     (파트를 알 수 없거나 맞는 사람이 없으면 승인자 전원, 승인자가 없으면 관리자)
--   승인 권한(can_approve)은 그대로 : 파트 리더도 다른 파트 건을 열면 승인할 수 있음
-- =====================================================================

alter table public.department_roles add column if not exists part_ids uuid[] not null default '{}';

-- 지적사항이 속한 파트 : 조치담당자 + 마지막 완료 보고자의 소속이 조치 요청 부서의 파트인 것
create or replace function public.finding_parts(p_finding uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d.id), '{}')
    from findings f
    join profiles p on p.id in (
           select a.user_id from finding_assignees a where a.finding_id = f.id
           union
           select (select e.actor_id from finding_events e where e.finding_id = f.id and e.action = '완료 보고' order by e.created_at desc limit 1))
    join departments d on d.id = p.department_id and d.parent_id = f.request_department_id
   where f.id = p_finding
$$;

-- 이 건의 종결 승인자 (알림·할 일 기준)
create or replace function public.finding_approvers(p_finding uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  with f as (select request_department_id dept, finding_parts(id) parts from findings where id = p_finding),
  r as (select r.user_id, r.part_ids, r.sort_order from department_roles r, f where r.department_id = f.dept and r.role = 'approver'),
  pick as (select r.* from r, f where cardinality(r.part_ids) = 0 or r.part_ids && f.parts)
  select coalesce((select array_agg(user_id order by sort_order, user_id) from pick),
                  (select array_agg(user_id order by sort_order, user_id) from r),
                  '{}')
$$;

-- 내 할 일 : 내가 승인할 승인 대기 건
create or replace function public.my_approval_findings() returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.id from findings f
   where f.status = 'approval_wait'
     and exists (select 1 from department_roles r where r.department_id = f.request_department_id and r.role = 'approver' and r.user_id = auth.uid())
     and auth.uid() = any(finding_approvers(f.id))
$$;

-- 환경설정 저장 : 승인자별 담당 파트 (p_approver_parts = {"사용자ID": ["파트ID", ...]})
create or replace function public.set_department_roles(p_dept uuid, p_assigners uuid[], p_approvers uuid[], p_approver_parts jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_first uuid := (coalesce(p_approvers, '{}'))[1];
begin
  perform set_department_roles(p_dept, p_assigners, p_approvers);
  update department_roles r
     set part_ids = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_approver_parts -> r.user_id::text) x
                               join departments d on d.id = x::uuid and d.parent_id = p_dept), '{}')
   where r.department_id = p_dept and r.role = 'approver' and p_approver_parts ? r.user_id::text;
  if exists (select 1 from department_roles where department_id = p_dept and role = 'approver' and user_id = v_first and cardinality(part_ids) > 0) then
    raise exception '첫 번째 승인자는 결재선 부서장이므로 담당 파트를 정할 수 없습니다 (부서 전체).';
  end if;
end $$;

-- ---- 알림 : 0014 와 같고 '완료 보고' 받는 사람만 파트 기준
create or replace function public.on_finding_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_label text;
  v_summary text;
  v_to uuid[];
  v_assignees uuid[];
begin
  select * into v_f from findings where id = new.finding_id;
  v_label := finding_label(new.finding_id);
  v_summary := finding_summary(new.finding_id);
  select coalesce(array_agg(user_id), '{}') into v_assignees from finding_assignees where finding_id = new.finding_id;

  if new.action = '등록' then
    select coalesce(array_agg(distinct u), '{}') into v_to
      from unnest(dept_role_users(v_f.request_department_id, 'assigner') || dept_role_users(v_f.request_department_id, 'approver')) u;
    if cardinality(v_to) = 0 then v_to := admin_ids(); end if;
    perform queue_mail(v_to, new.finding_id, 'request',
      format('[EHS] 조치 요청 - 조치담당자를 지정해 주세요 : %s', v_label),
      E'귀 부서로 점검 지적사항 조치가 요청되었습니다.\n부서 내 조치담당자를 지정해 주세요.\n\n' || v_summary);

  elsif new.action in ('담당자 지정', '담당자 변경') then
    select coalesce(array_agg(user_id), '{}') into v_to
      from finding_assignees where finding_id = new.finding_id and assigned_at = now();
    perform queue_mail(v_to, new.finding_id, 'assigned',
      format('[EHS] 조치담당자로 지정되었습니다 : %s', v_label),
      E'점검 지적사항의 조치담당자로 지정되었습니다.\n조치계획(즉시조치 / 단기대책 / 장기대책)과 목표일을 등록해 주세요.\n\n' || v_summary);

  elsif new.action = '완료 보고' then
    v_to := finding_approvers(new.finding_id);
    if cardinality(v_to) = 0 then v_to := admin_ids(); end if;
    perform queue_mail(v_to, new.finding_id, 'approval',
      format('[EHS] 종결 승인 요청 : %s', v_label),
      E'조치담당자가 조치 완료를 보고했습니다.\n개선 후 사진을 확인하고 승인 또는 반려해 주세요.\n\n' || v_summary);

  elsif new.action = '반려' then
    perform queue_mail(v_assignees, new.finding_id, 'rejected',
      format('[EHS] 조치 완료가 반려되었습니다 : %s', v_label),
      format(E'부서장이 조치 완료 보고를 반려했습니다.\n반려 사유: %s\n\n', coalesce(new.detail, '-')) || v_summary);

  elsif new.action = '종결 승인' then
    perform queue_mail(v_assignees || v_f.created_by, new.finding_id, 'closed',
      format('[EHS] 지적사항이 종결되었습니다 : %s', v_label),
      E'부서장 승인으로 지적사항이 종결되었습니다.\n\n' || v_summary);
  end if;
  return new;
end $$;

create or replace function public.on_finding_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to uuid[];
begin
  if not new.is_directive then return new; end if;
  select coalesce(array_agg(user_id), '{}') into v_to from finding_assignees where finding_id = new.finding_id;
  v_to := v_to || finding_approvers(new.finding_id);
  perform queue_mail(v_to, new.finding_id, 'directive',
    format('[EHS] 지시사항이 등록되었습니다 : %s', finding_label(new.finding_id)),
    format(E'지시사항: %s\n\n', new.body) || finding_summary(new.finding_id));
  return new;
end $$;

-- ---- 아침 알림 : 0017 과 같고 '승인 대기'만 파트 기준 (0034 의 _reminder_targets 가 이 함수를 부름)
create or replace function public._reminder_targets_all(p_today date)
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
    -- 종결 승인 (파트 기준)
    select 'approve', u, f.id, null, null
      from findings f, cfg,
           lateral unnest(coalesce(nullif(finding_approvers(f.id), '{}'), admin_ids())) u
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
revoke execute on function public._reminder_targets_all(date) from public, anon, authenticated;
