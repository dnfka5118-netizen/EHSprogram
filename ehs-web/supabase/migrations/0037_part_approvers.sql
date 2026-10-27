-- =====================================================================
-- 파트 종결 승인자 (0036 의 "승인자별 담당 파트"를 "파트 줄에 승인자 지정"으로 바꿈)
--   환경설정 → 부서·결재자 : 파트 줄에 종결 승인자(파트 리더)를 둠 (지정자는 부서에만)
--   파트 소속 = 환경설정 → 사용자·권한의 부서(파트)
--   이 건의 승인자 = 부서 승인자 + 조치담당자·완료 보고자 소속 파트의 승인자
--     → 종결 승인 요청 메일 · 아침 승인 대기 알림 · 지시사항 메일 · 내 할 일 (0036 함수 그대로 사용)
--   파트 승인자는 자기 파트 건을 승인할 수 있음 (can_approve 확장)
--   결재선 "해당 부서장"(departments.approver_id)은 부서 줄 첫 번째 승인자 그대로 (파트는 비움, 0013)
-- =====================================================================

-- 0036 방식으로 정해 둔 담당 파트 → 파트 줄 승인자로 옮김
insert into public.department_roles (department_id, user_id, role, sort_order)
  select p, r.user_id, 'approver', r.sort_order
    from public.department_roles r, unnest(r.part_ids) p
   where r.role = 'approver' and cardinality(r.part_ids) > 0
     and exists (select 1 from public.departments d where d.id = p and d.parent_id = r.department_id)
on conflict do nothing;
delete from public.department_roles where cardinality(part_ids) > 0;

drop function if exists public.set_department_roles(uuid, uuid[], uuid[], jsonb);

-- 부서 : 지정자·승인자 / 파트 : 승인자만
create or replace function public.set_department_roles(p_dept uuid, p_assigners uuid[], p_approvers uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_part boolean := exists (select 1 from departments where id = p_dept and parent_id is not null);
begin
  if not is_admin() then raise exception '관리자만 변경할 수 있습니다.'; end if;
  if v_part and cardinality(coalesce(p_assigners, '{}')) > 0 then
    raise exception '파트에는 종결 승인자만 둘 수 있습니다 (조치담당자 지정자는 상위 부서가 맡음).';
  end if;
  delete from department_roles where department_id = p_dept;
  insert into department_roles (department_id, user_id, role, sort_order)
    select p_dept, u, 'assigner', o from unnest(coalesce(p_assigners, '{}')) with ordinality t(u, o)
    union all
    select p_dept, u, 'approver', o from unnest(coalesce(p_approvers, '{}')) with ordinality t(u, o)
  on conflict do nothing;
  -- 목록이 비었을 때도 departments 쪽을 비움 (파트는 0013 트리거가 비워 둠)
  update departments set
    assigner_id = (select user_id from department_roles where department_id = p_dept and role = 'assigner' order by sort_order limit 1),
    approver_id = (select user_id from department_roles where department_id = p_dept and role = 'approver' order by sort_order limit 1)
  where id = p_dept;
end $$;

-- 이 건의 종결 승인자 : 부서 승인자 먼저, 그다음 해당 파트 승인자
create or replace function public.finding_approvers(p_finding uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  with f as (select request_department_id dept, finding_parts(id) parts from findings where id = p_finding),
  r as (
    select r.user_id, 0 grp, r.sort_order from department_roles r, f where r.department_id = f.dept and r.role = 'approver'
    union all
    select r.user_id, 1, r.sort_order from department_roles r, f where r.department_id = any(f.parts) and r.role = 'approver'
  )
  select coalesce(array(select user_id from r group by user_id order by min(grp), min(sort_order), user_id), '{}')
$$;

create or replace function public.my_approval_findings() returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.id from findings f where f.status = 'approval_wait' and auth.uid() = any(finding_approvers(f.id))
$$;

create or replace function public.can_approve(p_finding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from findings f where f.id = p_finding and has_dept_role(f.request_department_id, 'approver'))
      or auth.uid() = any(finding_approvers(p_finding))
$$;

alter table public.department_roles drop column if exists part_ids;
