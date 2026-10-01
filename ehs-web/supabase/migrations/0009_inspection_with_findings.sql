-- =====================================================================
-- 점검 등록 + 지적사항 여러 건을 한 번에 (하나의 트랜잭션)
--   한 건이라도 실패하면 점검·지적사항 모두 저장되지 않는다.
-- p_findings : [{"id","location_id","sub_location_id","sub_location_text","type_id","problem","department_id","photos":[...]}]
-- =====================================================================

create or replace function public.create_inspection_with_findings(
  p_module text, p_site uuid, p_date date, p_title text, p_inspectors text, p_note text, p_findings jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_f jsonb;
  v_n int := 0;
begin
  v_id := create_inspection(p_module, p_site, p_date, p_title, p_inspectors, p_note);

  for v_f in select * from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) loop
    v_n := v_n + 1;
    begin
      perform create_finding(
        (v_f->>'id')::uuid,
        v_id,
        nullif(v_f->>'location_id', '')::uuid,
        nullif(v_f->>'sub_location_id', '')::uuid,
        v_f->>'sub_location_text',
        nullif(v_f->>'type_id', '')::uuid,
        v_f->>'problem',
        nullif(v_f->>'department_id', '')::uuid,
        array(select jsonb_array_elements_text(coalesce(v_f->'photos', '[]'::jsonb)))
      );
    exception when others then
      raise exception '지적사항 %번 : %', v_n, sqlerrm;
    end;
  end loop;

  return v_id;
end $$;
