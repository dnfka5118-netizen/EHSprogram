-- 0026 : 유형 정리 — 비슷한 문제점인데 유형이 갈린 과거 사례를 관리자가 골라 통일
--   finding_examples.type_checked : 관리자가 확인한 사례 (정리 화면에서 다시 묻지 않음)
--   review_example_types(p_ids, p_keep, p_type) : p_ids 는 p_type 으로 바꾸고, p_keep 은 그대로 두고 둘 다 확인 표시

alter table public.finding_examples add column if not exists type_checked boolean not null default false;

create or replace function public.review_example_types(p_ids bigint[], p_keep bigint[], p_type text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not is_admin() then raise exception '관리자만 유형을 정리할 수 있습니다.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 0 then
    if p_type is null or not exists (select 1 from finding_types where name = p_type) then
      raise exception '유형을 선택해 주세요.';
    end if;
    update finding_examples set type_name = p_type, type_checked = true where id = any(p_ids);
  end if;
  update finding_examples set type_checked = true where id = any(coalesce(p_keep, '{}'));
  get diagnostics v_n = row_count;
  return coalesce(array_length(p_ids, 1), 0) + v_n;
end $$;

revoke all on function public.review_example_types(bigint[], bigint[], text) from public;
grant execute on function public.review_example_types(bigint[], bigint[], text) to authenticated;
