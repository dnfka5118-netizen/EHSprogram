-- =====================================================================
-- 퇴사·사용 중지 전 확인 : 이 사람이 맡고 있는 역할 · 진행 중인 건
--   user_responsibilities(p_user) : 관리자 조회 (분류 · 내용 · 이동 주소 · 한 번에 빼기 가능 여부)
--   release_user_roles(p_user)   : 역할 지정만 한 번에 빼기
--     부서 지정자·승인자(파트 포함) · 일일점검 구역 담당 · 유해화학물질 점검자/대체 점검자 · 점검 주기(끔)
--   진행 중인 지적사항 · 결재 대기 · 양식별 결재선 지정은 건마다 다른 사람으로 바꿔야 하므로 목록만 보여 줌
-- =====================================================================

create or replace function public.user_responsibilities(p_user uuid)
returns table (kind text, label text, link text, releasable boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 볼 수 있습니다.'; end if;
  return query
    -- 부서 지정자·승인자 (파트 = 파트 종결 승인자)
    select '부서·결재자'::text,
           coalesce(pd.name || ' › ', '') || d.name || ' · ' ||
             case r.role when 'assigner' then '조치담당자 지정자'
                         else case when d.approver_id = p_user then '종결 승인자 (결재선 부서장)' else '종결 승인자' end end,
           '/settings/departments'::text, true
      from department_roles r join departments d on d.id = r.department_id left join departments pd on pd.id = d.parent_id
     where r.user_id = p_user
    union all
    -- 일일점검 구역 담당
    select '일일점검 구역', a.name, '/settings/daily', true
      from daily_area_members m join daily_areas a on a.id = m.area_id
     where m.user_id = p_user and a.is_active
    union all
    -- 유해화학물질 점검자 · 대체 점검자
    select '유해화학물질 점검', g.name || ' · 점검자', '/settings/chem', true
      from chem_group_members m join chem_groups g on g.id = m.group_id
     where m.user_id = p_user and g.is_active
    union all
    select '유해화학물질 점검', '대체 점검자', '/settings/chem', true
      from chem_substitutes where user_id = p_user
    union all
    -- 점검 주기
    select '점검 주기', coalesce(md.name, s.module_code), '/settings/schedules', true
      from inspection_schedules s left join modules md on md.code = s.module_code
     where s.user_id = p_user and s.is_active and (s.end_date is null or s.end_date >= kst_today())
    union all
    -- 양식별 결재선에 고정된 결재자
    select '양식별 결재선', coalesce(md.name, t.module_code) || ' · ' || t.label, '/settings/approvals', false
      from approval_template_steps t left join modules md on md.code = t.module_code
     where t.user_id = p_user and t.resolver = 'user'
    union all
    -- 진행 중인 지적사항 (조치담당자)
    select '진행 중인 지적사항', finding_brief(f.id), '/findings/' || f.id, false
      from finding_assignees a join findings f on f.id = a.finding_id
     where a.user_id = p_user and f.status <> 'closed'
    union all
    -- 이 사람 결재를 기다리는 문서 (전자결재함에서 관리자가 결재자 변경)
    select '결재 대기', ap.title || ' · ' || s.label, coalesce(approval_doc_path(ap.module_code, ap.doc_id), '/approvals'), false
      from approval_steps s join approvals ap on ap.id = s.approval_id and s.round = ap.round
     where s.approver_id = p_user and ap.status = 'in_review' and s.status in ('pending', 'waiting');
end $$;

create or replace function public.release_user_roles(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_c int;
begin
  if not is_admin() then raise exception '관리자만 변경할 수 있습니다.'; end if;
  delete from department_roles where user_id = p_user;          get diagnostics v_c = row_count; v_n := v_n + v_c;
  delete from daily_area_members where user_id = p_user;        get diagnostics v_c = row_count; v_n := v_n + v_c;
  delete from chem_group_members where user_id = p_user;        get diagnostics v_c = row_count; v_n := v_n + v_c;
  delete from chem_substitutes where user_id = p_user;          get diagnostics v_c = row_count; v_n := v_n + v_c;
  update inspection_schedules set is_active = false where user_id = p_user and is_active;
  get diagnostics v_c = row_count; v_n := v_n + v_c;
  return v_n;
end $$;
