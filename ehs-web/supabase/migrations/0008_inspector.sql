-- =====================================================================
-- 점검자(고정) : CEO 안전점검 = 대표이사, 공장장 안전점검 = 공장장,
--               그 밖의 점검(월간환경안전점검 등) = 등록한 사람(로그인 사용자)
-- 화면에서 바꿀 수 없도록 DB 함수가 정한다. 함께 점검한 사람은 기존 inspectors(점검 참여자)
-- =====================================================================

alter table public.inspections add column if not exists inspector text;

create or replace function public.inspector_for(p_module text) returns text
language sql stable security definer set search_path = public as $$
  select case p_module
    when 'insp_ceo'   then '대표이사'
    when 'insp_plant' then '공장장'
    else (select p.name || coalesce(' ' || nullif(trim(p.position), ''), '') from profiles p where p.id = auth.uid())
  end
$$;

create or replace function public.create_inspection(
  p_module text, p_site uuid, p_date date, p_title text, p_inspectors text, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if perm_level(p_module) < 2 then raise exception '이 점검을 등록할 권한이 없습니다.'; end if;
  insert into inspections (site_id, module_code, inspection_date, title, inspector, inspectors, note, created_by)
  values (p_site, p_module, p_date, p_title, inspector_for(p_module), nullif(trim(p_inspectors), ''), nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
