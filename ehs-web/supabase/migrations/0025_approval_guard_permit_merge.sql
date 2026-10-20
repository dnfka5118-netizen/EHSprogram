-- =====================================================================
-- 오픈 전 보안 · 안정성
--   1. 결재선 검사 (모든 결재 양식 공통 · DB 가 강제)
--      A. 상신한 사람 본인은 '담당' 외 결재자가 될 수 없음 (본인 승인 차단)
--      B. 양식별 결재선의 '필수' 결재자(EHS부서장 · 해당부서장 · 지정 사용자)가 결재선에 있어야 함
--         (상신한 사람이 바로 그 결재자면 예외 — 상위자가 결재)
--      C. 협력업체 사용자 · 사용 중지 사용자는 결재자가 될 수 없음
--   2. 결재자 퇴사 · 부재 : 관리자가 진행 중 결재의 결재자 변경 · 관리자 반려
--   3. 안전작업허가서 현장 기록 : 여러 기기에서 동시에 저장해도 서명 · 확인 · 기록이 사라지지 않게 합쳐서 저장
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 결재선 검사
-- ---------------------------------------------------------------------
create or replace function public._dept_heads(p_dept uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select approver_id u from departments where id = p_dept and approver_id is not null
    union select unnest(dept_role_users(p_dept, 'approver'))
  ) x where u is not null
$$;

create or replace function public._check_approval_line(p_module text, p_department uuid, p_steps jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb;
  v_kind text;
  v_user uuid;
  v_n int := 0;
  t record;
  v_need uuid[];
  v_names text;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_steps, '[]')) loop
    v_kind := coalesce(nullif(v_item->>'step_kind', ''), '검토');
    if v_kind in ('참조', '시행') then continue; end if;
    v_n := v_n + 1;
    v_user := nullif(v_item->>'approver_id', '')::uuid;
    if v_user is null then continue; end if;   -- 빈 칸은 _submit_approval 이 안내
    if v_kind <> '담당' and v_user = auth.uid() then
      raise exception '%단계(%) : 상신한 본인은 결재자가 될 수 없습니다. 상위 결재자를 지정해 주세요.', v_n, coalesce(v_item->>'label', v_kind);
    end if;
    if exists (select 1 from profiles where id = v_user and (user_type <> 'employee' or not is_active)) then
      raise exception '%단계(%) : 협력업체 · 사용 중지 사용자는 결재자가 될 수 없습니다.', v_n, coalesce(v_item->>'label', v_kind);
    end if;
  end loop;

  for t in select * from approval_template_steps where module_code = p_module and required and resolver in ('dept_head', 'doc_dept_head', 'user') order by step_order loop
    v_need := case t.resolver
                when 'user' then case when t.user_id is null then '{}'::uuid[] else array[t.user_id] end
                when 'dept_head' then _dept_heads(t.department_id)
                else _dept_heads(p_department)
              end;
    if cardinality(v_need) = 0 or auth.uid() = any (v_need) then continue; end if;   -- 지정된 사람이 없거나 본인이 그 결재자
    if not exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]')) x
                    where x->>'step_kind' not in ('참조', '시행') and nullif(x->>'approver_id', '')::uuid = any (v_need)) then
      select string_agg(name, ', ' order by name) into v_names from profiles where id = any (v_need);
      raise exception '필수 결재자가 빠졌습니다 : % (%) — 양식별 결재선에서 필수로 정한 단계입니다.', t.label, v_names;
    end if;
  end loop;
end $$;
revoke execute on function public._check_approval_line(text, uuid, jsonb) from public, anon, authenticated;

create or replace function public._submit_approval(
  p_module text, p_doc uuid, p_title text, p_site uuid, p_department uuid, p_steps jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ap approvals%rowtype;
  v_item jsonb;
  v_order int := 0;
  v_approver uuid;
  v_kind text;
  v_first_pending boolean := true;
  v_status text;
  v_non_drafter int := 0;
  v_cc uuid[] := '{}';
  v_exec uuid[] := '{}';
begin
  if jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) = 0 then raise exception '결재선을 지정해 주세요.'; end if;

  -- 수신참조 · 시행자 : 결재 단계가 아닌 목록
  for v_item in select * from jsonb_array_elements(p_steps) loop
    v_kind := v_item->>'step_kind';
    if v_kind in ('참조', '시행') then
      v_approver := nullif(v_item->>'approver_id', '')::uuid;
      if v_approver is null or not exists (select 1 from profiles where id = v_approver and is_active) then
        raise exception '사용할 수 없는 수신참조·시행자가 포함되어 있습니다.';
      end if;
      if v_kind = '참조' and not v_approver = any (v_cc) then v_cc := v_cc || v_approver; end if;
      if v_kind = '시행' and not v_approver = any (v_exec) then v_exec := v_exec || v_approver; end if;
    end if;
  end loop;

  select * into v_ap from approvals where module_code = p_module and doc_id = p_doc for update;
  if found then
    if v_ap.status in ('in_review', 'approved') then raise exception '이미 결재가 진행 중이거나 완료된 문서입니다.'; end if;
    update approvals set status = 'in_review', round = round + 1, title = p_title, site_id = p_site,
           department_id = p_department, submitted_at = now(), completed_at = null, cc_ids = v_cc, exec_ids = v_exec
     where id = v_ap.id returning * into v_ap;
  else
    insert into approvals (module_code, doc_id, title, site_id, department_id, drafter_id, cc_ids, exec_ids)
    values (p_module, p_doc, p_title, p_site, p_department, auth.uid(), v_cc, v_exec)
    returning * into v_ap;
  end if;

  for v_item in select * from jsonb_array_elements(p_steps) loop
    v_kind := coalesce(nullif(v_item->>'step_kind', ''), '검토');
    if v_kind in ('참조', '시행') then continue; end if;
    v_order := v_order + 1;
    v_approver := nullif(v_item->>'approver_id', '')::uuid;
    if v_kind not in ('담당', '검토', '협조', '승인', '확인') then raise exception '결재 구분이 올바르지 않습니다.'; end if;
    if v_approver is null then raise exception '%단계(%)의 결재자를 지정해 주세요.', v_order, coalesce(v_item->>'label', v_kind); end if;
    if not exists (select 1 from profiles where id = v_approver and is_active) then raise exception '사용할 수 없는 결재자가 포함되어 있습니다.'; end if;

    if v_kind = '담당' and v_approver = auth.uid() then
      v_status := 'approved';
    else
      v_non_drafter := v_non_drafter + 1;
      v_status := case when v_first_pending then 'pending' else 'waiting' end;
      v_first_pending := false;
    end if;

    insert into approval_steps (approval_id, round, step_order, step_kind, label, approver_id, status, acted_at)
    values (v_ap.id, v_ap.round, v_order, v_kind, coalesce(nullif(trim(v_item->>'label'), ''), v_kind), v_approver, v_status,
            case when v_status = 'approved' then now() end);
  end loop;

  if v_non_drafter = 0 then raise exception '작성자 외 결재자를 1명 이상 지정해 주세요.'; end if;
  perform _check_approval_line(p_module, p_department, p_steps);  -- 0025 : 본인 결재 · 필수 결재자 · 협력업체 결재자 검사
  return v_ap.id;
end $$;

revoke execute on function public._submit_approval(text, uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 결재자 퇴사 · 부재 : 관리자 결재자 변경 · 관리자 반려
-- ---------------------------------------------------------------------
create or replace function public.admin_change_approver(p_step uuid, p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s approval_steps%rowtype; a approvals%rowtype; v_old text; v_new text;
begin
  if not is_admin() then raise exception '관리자만 결재자를 바꿀 수 있습니다.'; end if;
  select * into s from approval_steps where id = p_step for update;
  if not found then raise exception '결재 단계를 찾을 수 없습니다.'; end if;
  select * into a from approvals where id = s.approval_id for update;
  if a.status <> 'in_review' or s.round <> a.round or s.status not in ('pending', 'waiting') then
    raise exception '진행 중이고 아직 결재하지 않은 단계만 바꿀 수 있습니다.';
  end if;
  if not exists (select 1 from profiles where id = p_user and is_active and user_type = 'employee') then raise exception '사용할 수 있는 임직원을 골라 주세요.'; end if;
  if p_user = a.drafter_id then raise exception '상신한 사람은 결재자가 될 수 없습니다.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '변경 사유를 적어 주세요. (퇴사, 장기 부재 등)'; end if;
  select name into v_old from profiles where id = s.approver_id;
  select name into v_new from profiles where id = p_user;
  if s.status = 'pending' then
    -- 대기 → 차례 로 다시 바꿔 새 결재자에게 결재 요청 메일
    update approval_steps set status = 'waiting', approver_id = p_user where id = s.id;
    update approval_steps set status = 'pending', comment = format('결재자 변경 %s → %s (%s)', coalesce(v_old, '-'), v_new, trim(p_reason)) where id = s.id;
  else
    update approval_steps set approver_id = p_user, comment = format('결재자 변경 %s → %s (%s)', coalesce(v_old, '-'), v_new, trim(p_reason)) where id = s.id;
  end if;
end $$;

create or replace function public.admin_reject_approval(p_approval uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a approvals%rowtype; s approval_steps%rowtype;
begin
  if not is_admin() then raise exception '관리자만 반려할 수 있습니다.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '반려 사유를 적어 주세요.'; end if;
  select * into a from approvals where id = p_approval for update;
  if not found or a.status <> 'in_review' then raise exception '결재 진행 중인 문서가 아닙니다.'; end if;
  select * into s from approval_steps where approval_id = a.id and round = a.round and status = 'pending' order by step_order limit 1;
  update approval_steps set status = 'rejected', acted_at = now(), comment = '관리자 반려 : ' || trim(p_reason) where id = s.id;
  update approval_steps set status = 'skipped' where approval_id = a.id and round = a.round and status = 'waiting';
  update approvals set status = 'rejected', completed_at = now() where id = a.id;
  perform _on_approval_result(a.module_code, a.doc_id, 'rejected');
end $$;

-- 결재자가 사용 중지(퇴사 등)인데 아직 결재 차례가 남은 문서 (관리자 화면 경고)
create or replace function public.stuck_approvals()
returns table (approval_id uuid, title text, module_name text, doc_path text, step_id uuid, step_label text, approver_name text)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, m.name, approval_doc_path(a.module_code, a.doc_id), s.id, s.label, p.name
    from approvals a
    join approval_steps s on s.approval_id = a.id and s.round = a.round and s.status in ('pending', 'waiting')
    join profiles p on p.id = s.approver_id
    join modules m on m.code = a.module_code
   where a.status = 'in_review' and not p.is_active and is_admin()
   order by a.submitted_at
$$;

-- ---------------------------------------------------------------------
-- 3. 허가서 현장 기록 : 동시 저장 합치기
--   p_base = 화면을 연(또는 마지막으로 저장한) 때의 field_saved_at
--   그 뒤에 다른 사람이 저장했으면 : 서명 · 확인 · 입력칸은 칸별로 합치고(빈 값은 덮어쓰지 않음),
--   연장 · 중단 · 가스측정 · 출입 · 확인서명 기록은 양쪽 기록을 모두 남김 (같은 id 는 새 값)
-- ---------------------------------------------------------------------
create or replace function public._jsonb_union(p_old jsonb, p_new jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(e order by o), '[]') from (
    select e, o from (
      select n.e, 1000000 + n.o o from jsonb_array_elements(coalesce(p_new, '[]')) with ordinality n(e, o)
      union all
      select x.e, x.o from jsonb_array_elements(coalesce(p_old, '[]')) with ordinality x(e, o)
       where not exists (select 1 from jsonb_array_elements(coalesce(p_new, '[]')) y(e)
                          where y.e = x.e or (x.e ? 'id' and y.e->>'id' = x.e->>'id'))
    ) u
  ) z
$$;

create or replace function public._jsonb_nonempty(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each(coalesce(p, '{}')) t(k, v) where v not in ('null'::jsonb, '""'::jsonb)
$$;

drop function if exists public.save_permit_field(uuid, jsonb);
create or replace function public.save_permit_field(p_id uuid, p_field jsonb, p_base timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v permits%rowtype;
  o jsonb;
  n jsonb;
  v_merge boolean;
begin
  if not permit_writer() then raise exception '현장 기록 권한이 없습니다.'; end if;
  select * into v from permits where id = p_id for update;
  if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
  if v.phase <> 'issued' then raise exception '발급된(작업 중인) 허가서만 현장 기록을 입력할 수 있습니다.'; end if;
  o := coalesce(v.field, '{}');
  v_merge := v.field_saved_at is not null and (p_base is null or p_base < v.field_saved_at);
  if v_merge then
    n := jsonb_build_object(
      'checks_ok',     coalesce(o->'checks_ok', '{}') || coalesce(p_field->'checks_ok', '{}'),
      'sigs',          coalesce(o->'sigs', '{}') || _jsonb_nonempty(p_field->'sigs'),
      'extends',       _jsonb_union(o->'extends', p_field->'extends'),
      'suspends',      _jsonb_union(o->'suspends', p_field->'suspends'),
      'fire_logs',     _jsonb_union(o->'fire_logs', p_field->'fire_logs'),
      'confined_logs', _jsonb_union(o->'confined_logs', p_field->'confined_logs'),
      'acks',          _jsonb_union(o->'acks', p_field->'acks'),
      'fields',        coalesce(o->'fields', '{}') || _jsonb_nonempty(p_field->'fields'));
  else
    n := jsonb_build_object(
      'checks_ok',     coalesce(p_field->'checks_ok', '{}'::jsonb),
      'sigs',          coalesce(p_field->'sigs', '{}'::jsonb),
      'extends',       coalesce(p_field->'extends', '[]'::jsonb),
      'suspends',      coalesce(p_field->'suspends', '[]'::jsonb),
      'fire_logs',     coalesce(p_field->'fire_logs', '[]'::jsonb),
      'confined_logs', coalesce(p_field->'confined_logs', '[]'::jsonb),
      'acks',          coalesce(p_field->'acks', '[]'::jsonb),
      'fields',        coalesce(p_field->'fields', '{}'::jsonb));
  end if;
  update permits set field = n, field_saved_at = now(), field_saved_by = auth.uid(), updated_at = now() where id = p_id;
  return jsonb_build_object('field', n, 'saved_at', now(), 'merged', v_merge);
end $$;
