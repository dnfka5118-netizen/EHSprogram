-- =====================================================================
-- 엑셀로 추가 : 인터넷이 안 될 때 엑셀(프로그램 다운로드 양식)에 적어 둔 지적사항을 나중에 등록
--   register_finding_on(점검, 점검일, 참여자, 지적사항, 중복확인 키)
--     · 점검일은 오늘 또는 지난 날짜(1년 이내)
--     · 사업장 = 등록자 사업장, 점검자 = inspector_for() (화면 등록과 같음)
--     · p_ref 가 같은 건이 이미 있으면 '이미 등록된 건입니다' (같은 엑셀을 두 번 올려도 이중 등록 없음)
--   register_finding(화면 등록)은 오늘 날짜로 이 함수를 부른다.
-- =====================================================================

create or replace function public.register_finding_on(p_module text, p_date date, p_inspectors text, p_finding jsonb, p_ref text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_site uuid;
  v_day date := coalesce(p_date, kst_today());
  v_inspector text := inspector_for(p_module);
  v_insp uuid;
  v_name text;
  v_new text[];
  v_fid uuid;
begin
  if perm_level(p_module) < 2 then raise exception '이 점검을 등록할 권한이 없습니다.'; end if;
  if v_day > kst_today() then raise exception '점검일은 오늘 이전이어야 합니다.'; end if;
  if v_day < kst_today() - 366 then raise exception '1년이 지난 점검은 등록할 수 없습니다.'; end if;
  if p_ref is not null and exists (select 1 from findings where legacy_ref = p_ref) then
    raise exception '이미 등록된 건입니다.';
  end if;
  select site_id into v_site from profiles where id = auth.uid();
  if v_site is null then raise exception '사업장이 지정되지 않은 사용자입니다. 환경설정에서 사업장을 지정해 주세요.'; end if;

  perform pg_advisory_xact_lock(hashtext(p_module || v_site::text || v_day::text || coalesce(v_inspector, '')));

  select id into v_insp from inspections
   where module_code = p_module and site_id = v_site and inspection_date = v_day and inspector is not distinct from v_inspector
   order by created_at limit 1;

  if v_insp is null then
    select name into v_name from modules where code = p_module;
    insert into inspections (site_id, module_code, inspection_date, title, inspector, inspectors, created_by)
    values (v_site, p_module, v_day,
            extract(year from v_day)::int || '년 ' || extract(month from v_day)::int || '월 ' || extract(day from v_day)::int || '일 ' || v_name,
            v_inspector, nullif(trim(p_inspectors), ''), auth.uid())
    returning id into v_insp;
  elsif coalesce(trim(p_inspectors), '') <> '' then
    select array_agg(distinct x) into v_new
      from (select trim(unnest(string_to_array(coalesce(inspectors, '') || ',' || p_inspectors, ','))) x from inspections where id = v_insp) t
     where x <> '';
    update inspections set inspectors = array_to_string(v_new, ', ') where id = v_insp;
  end if;

  v_fid := create_finding(
    (p_finding->>'id')::uuid,
    v_insp,
    nullif(p_finding->>'location_id', '')::uuid,
    nullif(p_finding->>'sub_location_id', '')::uuid,
    p_finding->>'sub_location_text',
    nullif(p_finding->>'type_id', '')::uuid,
    p_finding->>'problem',
    nullif(p_finding->>'department_id', '')::uuid,
    array(select jsonb_array_elements_text(coalesce(p_finding->'photos', '[]'::jsonb)))
  );
  if p_ref is not null then update findings set legacy_ref = p_ref where id = v_fid; end if;
  return v_insp;
end $$;

create or replace function public.register_finding(p_module text, p_inspectors text, p_finding jsonb)
returns uuid language sql security definer set search_path = public as $$
  select register_finding_on(p_module, kst_today(), p_inspectors, p_finding, null)
$$;
