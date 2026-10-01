-- =====================================================================
-- 자진 담당 : 조치 요청 부서 직원이 스스로 조치담당자가 된다
--   - 조치 요청 부서 소속 · 활성 사용자만
--   - 종결 승인 대기 / 종결 전까지 (이미 담당자가 있어도 함께 담당으로 추가)
--   - finding_assignees.assigned_by = 본인 → 화면에 "자진 담당" 표시
--   - 처리 이력에 '자진 담당' 기록
-- =====================================================================

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
  if v_me.department_id is distinct from v_f.request_department_id then
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
