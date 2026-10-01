-- =====================================================================
-- 점검 등록 = 지적사항 1건 등록 (점검 회차는 자동)
--   사업장 = 등록자의 사업장, 점검일 = 오늘(한국 시간), 점검자 = inspector_for() — 모두 고정
--   같은 점검 · 같은 사업장 · 같은 날 · 같은 점검자 의 회차가 있으면 이어서 붙이고, 없으면 새로 만든다.
--   점검명은 입력받지 않고 "2026년 10월 1일 CEO 안전점검" 처럼 자동으로 붙인다.
-- p_finding : {"id","location_id","sub_location_id","sub_location_text","type_id","problem","department_id","photos":[...]}
-- =====================================================================

create or replace function public.register_finding(p_module text, p_inspectors text, p_finding jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_site uuid;
  v_day date := kst_today();
  v_inspector text := inspector_for(p_module);
  v_insp uuid;
  v_name text;
  v_new text[];
begin
  if perm_level(p_module) < 2 then raise exception '이 점검을 등록할 권한이 없습니다.'; end if;
  select site_id into v_site from profiles where id = auth.uid();
  if v_site is null then raise exception '사업장이 지정되지 않은 사용자입니다. 환경설정에서 사업장을 지정해 주세요.'; end if;

  -- 동시에 두 사람이 같은 회차를 처음 만드는 경우 대비
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
    -- 같은 회차에 참여자가 더해지면 합친다 (중복 제외)
    select array_agg(distinct x) into v_new
      from (select trim(unnest(string_to_array(coalesce(inspectors, '') || ',' || p_inspectors, ','))) x from inspections where id = v_insp) t
     where x <> '';
    update inspections set inspectors = array_to_string(v_new, ', ') where id = v_insp;
  end if;

  perform create_finding(
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
  return v_insp;
end $$;

-- 0009 의 "점검 + 여러 건" 방식은 쓰지 않음
drop function if exists public.create_inspection_with_findings(text, uuid, date, text, text, text, jsonb);
