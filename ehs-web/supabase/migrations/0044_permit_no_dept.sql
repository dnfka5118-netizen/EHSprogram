-- =====================================================================
-- 안전작업허가서 허가번호 : 년도-신청자 부서/파트-순번 (예: 2026-생산1파트-001)
--   신청자(작성자)가 파트 소속이면 파트명, 아니면 부서명 · 년도·부서/파트마다 001 부터
--   번호는 처음 결재 상신할 때 붙임 (임시 저장만 하고 버린 허가서 때문에 번호가 비지 않도록)
--   이미 번호가 있는 허가서(예전 CF430-YYYYMMDD-NNN)는 그대로
-- =====================================================================

alter table public.permits alter column permit_no drop not null;

create or replace function public._next_permit_no(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_prefix text;
  v_n int;
begin
  select d.name into v_label from profiles p join departments d on d.id = p.department_id where p.id = p_user;
  v_prefix := to_char(kst_today(), 'YYYY') || '-' || coalesce(nullif(trim(v_label), ''), '부서없음') || '-';
  perform pg_advisory_xact_lock(hashtext('permit_no:' || v_prefix));
  select coalesce(max(substr(permit_no, length(v_prefix) + 1)::int), 0) + 1 into v_n
    from permits
   where left(permit_no, length(v_prefix)) = v_prefix and substr(permit_no, length(v_prefix) + 1) ~ '^[0-9]+$';
  return v_prefix || lpad(v_n::text, 3, '0');
end $$;
revoke execute on function public._next_permit_no(uuid) from public, anon, authenticated;

-- 신청 내용 저장 : 새 허가서는 번호 없이 (0006 과 같고 permit_no 만 null)
create or replace function public.save_permit(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v permits%rowtype;
  v_site uuid;
  v_checks jsonb;
begin
  if not permit_writer() then raise exception '안전작업허가서를 작성할 권한이 없습니다.'; end if;
  if p_id is not null then
    select * into v from permits where id = p_id for update;
    if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
    if v.created_by is distinct from auth.uid() and not is_admin() then raise exception '작성자만 수정할 수 있습니다.'; end if;
    if not permit_editable(p_id) then raise exception '결재 중이거나 발급된 허가서는 신청 내용을 수정할 수 없습니다.'; end if;
  end if;

  v_site := coalesce(v.site_id, (select site_id from profiles where id = auth.uid()), (select id from sites where is_active order by sort_order limit 1));
  if p_id is null then
    insert into permits (permit_no, site_id, created_by) values (null, v_site, auth.uid()) returning * into v;  -- 번호는 상신할 때
  end if;

  -- 필요 체크만 (○ 확인 _ok 키는 현장 기록에서)
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_checks
    from jsonb_each(coalesce(p_data->'checks', '{}'::jsonb))
   where key !~ '_ok$' and jsonb_typeof(value) = 'boolean';

  update permits set
    department_id = nullif(p_data->>'department_id', '')::uuid,
    psm           = case when p_data->>'psm' = '해당' then '해당' else '미해당' end,
    preop         = case when p_data->>'preop' = '해당' then '해당' else '미해당' end,
    work_type     = nullif(p_data->>'work_type', ''),
    supp          = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'supp', '[]'::jsonb)) x
                              where x in ('confined', 'power', 'excavation', 'radiation', 'height', 'heavy')), '{}'),
    grade         = nullif(p_data->>'grade', ''),
    work_name     = coalesce(trim(p_data->>'work_name'), ''),
    work_place    = nullif(trim(p_data->>'work_place'), ''),
    company_name  = nullif(trim(p_data->>'company_name'), ''),
    start_dt      = nullif(p_data->>'start_dt', '')::timestamp,
    end_dt        = nullif(p_data->>'end_dt', '')::timestamp,
    tags          = coalesce(p_data->'tags', '[]'::jsonb),
    managers      = coalesce(p_data->'managers', '[]'::jsonb),
    witnesses     = coalesce(p_data->'witnesses', '[]'::jsonb),
    risk_eval_id  = nullif(p_data->>'risk_eval_id', '')::uuid,
    checks        = v_checks,
    fields        = coalesce(p_data->'fields', '{}'::jsonb),
    updated_at    = now()
  where id = v.id;
  return v.id;
end $$;

-- 상신 : 번호가 없으면 이때 붙임 (0006 과 같고 번호 부분만 추가)
create or replace function public.submit_permit(p_id uuid, p_steps jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v permits%rowtype;
  j jsa_evals%rowtype;
begin
  select * into v from permits where id = p_id for update;
  if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
  if v.created_by is distinct from auth.uid() then raise exception '작성자만 상신할 수 있습니다.'; end if;
  if v.work_type is null then raise exception '작업 종류(일반위험작업/화기작업)를 선택해 주세요.'; end if;
  if v.grade is null then raise exception '위험등급을 선택해 주세요.'; end if;
  if v.work_name = '' then raise exception '작업명을 입력해 주세요.'; end if;
  if v.department_id is null then raise exception '해당부서를 선택해 주세요.'; end if;
  if v.start_dt is null or v.end_dt is null then raise exception '작업 시작·종료일시를 입력해 주세요.'; end if;
  if v.end_dt <= v.start_dt then raise exception '작업 종료일시는 시작일시보다 뒤여야 합니다.'; end if;
  if not exists (select 1 from jsonb_array_elements(v.managers) m where coalesce(trim(m->>'name'), '') <> '') then
    raise exception '작업관리자를 1명 이상 입력해 주세요.';
  end if;
  if v.grade in ('A', 'B') and not exists (select 1 from jsonb_array_elements(v.witnesses) m where coalesce(trim(m->>'name'), '') <> '') then
    raise exception '위험등급 %등급은 입회자를 반드시 선임해야 합니다.', v.grade;
  end if;
  if coalesce((v.checks->>'docs_proc')::boolean, false) = false and coalesce((v.checks->>'docs_risk')::boolean, false) = false then
    raise exception '작업절차서 또는 위험성평가서 중 하나는 필요로 체크해야 합니다. (절차서가 없으면 위험성평가 필수)';
  end if;
  if coalesce((v.checks->>'docs_risk')::boolean, false) and v.risk_eval_id is null and coalesce(trim(v.fields->>'risk_no'), '') = '' then
    raise exception '위험성평가서를 불러오거나 번호를 입력해 주세요.';
  end if;
  if v.risk_eval_id is not null then
    select * into j from jsa_evals where id = v.risk_eval_id;
    if not exists (select 1 from approvals where module_code = 'risk_adhoc' and doc_id = j.id and status = 'approved') then
      raise exception '연결한 위험성평가(%)가 아직 결재 완료되지 않았습니다.', j.eval_no;
    end if;
    if abs(v.start_dt::date - j.eval_date) >= 365 then
      raise exception '연결한 위험성평가(%)가 작업일과 1년 이상 차이나 유효성 검증이 필요합니다. 재평가 후 연결해 주세요.', j.eval_no;
    end if;
  end if;
  -- 허가번호 : 처음 상신할 때 붙임 (반려 후 다시 상신하면 같은 번호)
  if v.permit_no is null then
    v.permit_no := _next_permit_no(v.created_by);
    update permits set permit_no = v.permit_no where id = v.id;
  end if;
  return _submit_approval('permit', v.id, format('%s · %s', v.permit_no, v.work_name), v.site_id, v.department_id, p_steps);
end $$;
