-- =====================================================================
-- 지적사항 수정 : 현장에서 잘못 등록한 장소 · 세부장소 · 유형 · 문제점 · 조치 요청 부서를 컴퓨터에서 고침
--   · 등록자 : 종결 전까지 · 관리자 : 언제든
--   · 조치 요청 부서 : 담당자 지정 전에는 자유롭게 (새 부서 지정자에게 조치 요청 알림)
--                     담당자 지정 후에는 관리자만 → 담당자·미완료 조치계획을 비우고 '담당자 지정 대기' 로 되돌림
--   · 바뀐 내용은 처리 이력(finding_events '수정')에 남김
-- =====================================================================

create or replace function public.update_finding(p_finding uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_sub uuid := nullif(p->>'sub_location_id', '')::uuid;
  v_sub_text text := nullif(trim(p->>'sub_location_text'), '');
  v_type uuid := nullif(p->>'type_id', '')::uuid;
  v_problem text := trim(coalesce(p->>'problem', ''));
  v_dept uuid := nullif(p->>'department_id', '')::uuid;
  v_changes text[] := '{}';
  v_to uuid[];
  nm text;
begin
  select * into v_f from findings where id = p_finding for update;
  if not found then raise exception '지적사항을 찾을 수 없습니다.'; end if;
  if not (is_admin() or (v_f.created_by = auth.uid() and v_f.status <> 'closed')) then
    raise exception '수정할 수 없습니다. (등록자는 종결 전까지, 관리자는 언제든 수정할 수 있습니다)';
  end if;
  if v_problem = '' then raise exception '문제점을 입력해 주세요.'; end if;
  if v_dept is null then raise exception '조치 요청 부서를 선택해 주세요.'; end if;
  if v_loc is not null and not exists (select 1 from locations where id = v_loc and site_id = v_f.site_id) then
    raise exception '장소가 올바르지 않습니다.';
  end if;
  if v_sub is not null and not exists (select 1 from sub_locations where id = v_sub and location_id = v_loc) then
    raise exception '세부장소가 선택한 장소에 속하지 않습니다.';
  end if;
  if not exists (select 1 from departments where id = v_dept and site_id = v_f.site_id) then
    raise exception '조치 요청 부서가 올바르지 않습니다.';
  end if;

  if v_loc is distinct from v_f.location_id or v_sub is distinct from v_f.sub_location_id or v_sub_text is distinct from v_f.sub_location_text then
    v_changes := v_changes || format('장소 : %s → %s',
      coalesce((select l.name from locations l where l.id = v_f.location_id), '-') || coalesce(' / ' || (select s.name from sub_locations s where s.id = v_f.sub_location_id), ' / ' || v_f.sub_location_text, ''),
      coalesce((select l.name from locations l where l.id = v_loc), '-') || coalesce(' / ' || (select s.name from sub_locations s where s.id = v_sub), ' / ' || v_sub_text, ''));
  end if;
  if v_type is distinct from v_f.finding_type_id then
    v_changes := v_changes || format('유형 : %s → %s',
      coalesce((select name from finding_types where id = v_f.finding_type_id), '-'), coalesce((select name from finding_types where id = v_type), '-'));
  end if;
  if v_problem <> v_f.problem then
    v_changes := v_changes || format('문제점 : %s → %s', left(v_f.problem, 60), left(v_problem, 60));
  end if;

  if v_dept <> v_f.request_department_id then
    if v_f.status = 'closed' then raise exception '종결된 건은 조치 요청 부서를 바꿀 수 없습니다.'; end if;
    if v_f.status <> 'assign_wait' and not is_admin() then
      raise exception '조치담당자가 지정된 뒤에는 조치 요청 부서를 바꿀 수 없습니다. 관리자(EHS부서)에게 요청해 주세요.';
    end if;
    select name into nm from departments where id = v_f.request_department_id;
    v_changes := v_changes || format('조치 요청 부서 : %s → %s', nm, (select name from departments where id = v_dept));
    if v_f.status <> 'assign_wait' then
      -- 관리자 : 새 부서에서 다시 지정하도록 되돌림 (완료된 조치는 기록으로 남김)
      delete from finding_assignees where finding_id = p_finding;
      delete from finding_measures where finding_id = p_finding and not is_done;
      update findings set status = 'assign_wait', completed_at = null where id = p_finding;
      v_changes := v_changes || '담당자·미완료 조치계획 초기화 → 담당자 지정 대기'::text;
    end if;
  end if;

  if cardinality(v_changes) = 0 then return; end if;

  update findings
     set location_id = v_loc, sub_location_id = v_sub, sub_location_text = case when v_sub is null then v_sub_text end,
         finding_type_id = v_type, problem = v_problem, request_department_id = v_dept
   where id = p_finding;
  perform log_event(p_finding, '수정', array_to_string(v_changes, E'\n'));

  -- 부서가 바뀌면 새 부서 지정자에게 조치 요청
  if v_dept <> v_f.request_department_id then
    select coalesce(array_agg(distinct u), '{}') into v_to
      from unnest(dept_role_users(v_dept, 'assigner') || dept_role_users(v_dept, 'approver')) u;
    if cardinality(v_to) = 0 then v_to := admin_ids(); end if;
    perform queue_mail(v_to, p_finding, 'request',
      format('[EHS] 조치 요청 - 조치담당자를 지정해 주세요 : %s', finding_label(p_finding)),
      E'조치 요청 부서가 귀 부서로 변경되었습니다.\n부서 내 조치담당자를 지정해 주세요.\n\n' || finding_summary(p_finding));
  end if;
end $$;
