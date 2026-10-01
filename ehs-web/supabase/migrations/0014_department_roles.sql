-- =====================================================================
-- 부서별 조치담당자 지정자 · 종결 승인자 여러 명
--   department_roles(department, user, role, sort_order)
--   departments.assigner_id / approver_id 는 목록의 첫 번째 사람으로 자동 유지
--     (전자결재 결재선의 "해당 부서장"은 첫 번째 승인자)
--   권한 판단·알림은 목록 전체 기준
-- =====================================================================

create table public.department_roles (
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null check (role in ('assigner', 'approver')),
  sort_order    int  not null default 0,
  primary key (department_id, role, user_id)
);
create index on public.department_roles (user_id);

alter table public.department_roles enable row level security;
create policy read_all on public.department_roles for select to authenticated using (is_member());
create policy admin_all on public.department_roles for all to authenticated using (is_admin()) with check (is_admin());

-- 기존 1명씩 → 목록으로
insert into public.department_roles (department_id, user_id, role)
  select id, assigner_id, 'assigner' from public.departments where assigner_id is not null
  union all
  select id, approver_id, 'approver' from public.departments where approver_id is not null
on conflict do nothing;

create or replace function public.dept_role_users(p_dept uuid, p_role text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id order by sort_order, user_id), '{}') from department_roles where department_id = p_dept and role = p_role
$$;

create or replace function public.has_dept_role(p_dept uuid, p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from department_roles where department_id = p_dept and user_id = auth.uid() and (p_role is null or role = p_role))
$$;

-- 첫 번째 사람을 departments 에 유지
create or replace function public.sync_department_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dept uuid := coalesce(new.department_id, old.department_id);
begin
  update departments set
    assigner_id = (select user_id from department_roles where department_id = v_dept and role = 'assigner' order by sort_order, user_id limit 1),
    approver_id = (select user_id from department_roles where department_id = v_dept and role = 'approver' order by sort_order, user_id limit 1)
  where id = v_dept;
  return null;
end $$;
create trigger department_roles_sync after insert or update or delete on public.department_roles
  for each row execute function public.sync_department_roles();

-- 화면(환경설정)에서 목록 한 번에 저장
create or replace function public.set_department_roles(p_dept uuid, p_assigners uuid[], p_approvers uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 변경할 수 있습니다.'; end if;
  if exists (select 1 from departments where id = p_dept and parent_id is not null) then
    raise exception '파트에는 지정자·승인자를 두지 않습니다 (상위 부서가 맡음).';
  end if;
  delete from department_roles where department_id = p_dept;
  insert into department_roles (department_id, user_id, role, sort_order)
    select p_dept, u, 'assigner', o from unnest(coalesce(p_assigners, '{}')) with ordinality t(u, o)
    union all
    select p_dept, u, 'approver', o from unnest(coalesce(p_approvers, '{}')) with ordinality t(u, o)
  on conflict do nothing;
  -- 목록이 비었을 때도 departments 쪽을 비움
  update departments set
    assigner_id = (select user_id from department_roles where department_id = p_dept and role = 'assigner' order by sort_order limit 1),
    approver_id = (select user_id from department_roles where department_id = p_dept and role = 'approver' order by sort_order limit 1)
  where id = p_dept;
end $$;

-- ---- 권한 판단 : 목록 전체 기준
create or replace function public.can_view_finding(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from findings f
    where f.id = p_finding and (
      perm_level(f.module_code) >= 1
      or f.created_by = auth.uid()
      or has_dept_role(f.request_department_id, null)
      or exists (select 1 from finding_assignees a where a.finding_id = f.id and a.user_id = auth.uid())
    )
  )
$$;

create or replace function public.can_assign(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from findings f where f.id = p_finding and has_dept_role(f.request_department_id, null))
$$;

create or replace function public.can_approve(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from findings f where f.id = p_finding and has_dept_role(f.request_department_id, 'approver'))
$$;

-- ---- 알림 : 지정자·승인자 전원에게
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
    v_to := dept_role_users(v_f.request_department_id, 'approver');
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
  select v_to || dept_role_users(f.request_department_id, 'approver') into v_to from findings f where f.id = new.finding_id;
  perform queue_mail(v_to, new.finding_id, 'directive',
    format('[EHS] 지시사항이 등록되었습니다 : %s', finding_label(new.finding_id)),
    format(E'지시사항: %s\n\n', new.body) || finding_summary(new.finding_id));
  return new;
end $$;
