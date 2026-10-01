-- =====================================================================
-- 조직 : 사업장 › 부문 › 부서 › 파트
--   departments.division  = 부문 이름 (예: 천안공장, 경영지원실)
--   departments.parent_id = 파트의 상위 부서 (예: 생산팀 › HBC-C2). 부서는 null
--   조치 요청·지정자·승인자는 부서(팀) 단위만. 파트 소속 직원은 상위 부서 소속으로 본다.
-- =====================================================================

alter table public.departments add column if not exists division text;
alter table public.departments add column if not exists parent_id uuid references public.departments(id) on delete restrict;

-- 파트는 한 단계만 · 상위 부서와 같은 사업장 · 지정자/승인자 없음(상위 부서 사람이 맡음)
create or replace function public.check_department() returns trigger
language plpgsql set search_path = public as $$
declare v_p departments%rowtype;
begin
  if new.parent_id is null then return new; end if;
  select * into v_p from departments where id = new.parent_id;
  if v_p.parent_id is not null then raise exception '파트 아래에는 파트를 둘 수 없습니다.'; end if;
  if v_p.site_id <> new.site_id then raise exception '상위 부서와 같은 사업장이어야 합니다.'; end if;
  if new.id = new.parent_id then raise exception '자기 자신을 상위 부서로 둘 수 없습니다.'; end if;
  if exists (select 1 from departments where parent_id = new.id) then raise exception '파트가 있는 부서는 다른 부서의 파트가 될 수 없습니다.'; end if;
  new.division := v_p.division;
  new.assigner_id := null;
  new.approver_id := null;
  return new;
end $$;
drop trigger if exists department_check on public.departments;
create trigger department_check before insert or update on public.departments
  for each row execute function public.check_department();

-- 소속 부서(팀) : 파트면 상위 부서
create or replace function public.dept_team(p_dept uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(d.parent_id, d.id) from departments d where d.id = p_dept
$$;

-- 조치 요청은 부서(팀) 단위로만
create or replace function public.check_request_department() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from departments where id = new.request_department_id and parent_id is not null) then
    raise exception '조치 요청은 부서(팀) 단위로만 할 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists finding_request_department_check on public.findings;
create trigger finding_request_department_check before insert or update of request_department_id on public.findings
  for each row execute function public.check_request_department();

-- 조치담당자 지정 : 요청 부서 소속(파트 포함) 사용자만
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
             where p.id is null or not p.is_active or dept_team(p.department_id) is distinct from v_f.request_department_id) then
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

-- 자진 담당 : 요청 부서 소속(파트 포함) 직원
create or replace function public.self_assign_finding(p_finding uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_me profiles%rowtype;
begin
  select * into v_f from findings where id = p_finding for update;
  if not found then raise exception '지적사항을 찾을 수 없습니다.'; end if;
  select * into v_me from profiles where id = auth.uid();
  if not found or not v_me.is_active then raise exception '권한이 없습니다.'; end if;
  if dept_team(v_me.department_id) is distinct from v_f.request_department_id then
    raise exception '조치 요청 부서 소속 직원만 자진 담당할 수 있습니다.';
  end if;
  if v_f.status not in ('assign_wait', 'plan_wait', 'in_progress') then
    raise exception '승인 대기 또는 종결된 건은 담당할 수 없습니다.';
  end if;
  if exists (select 1 from finding_assignees where finding_id = p_finding and user_id = auth.uid()) then
    raise exception '이미 조치담당자입니다.';
  end if;

  insert into finding_assignees (finding_id, user_id, assigned_by) values (p_finding, auth.uid(), auth.uid());
  if v_f.status = 'assign_wait' then
    update findings set status = 'plan_wait' where id = p_finding;
  end if;
  perform log_event(p_finding, '자진 담당', v_me.name);
end $$;
