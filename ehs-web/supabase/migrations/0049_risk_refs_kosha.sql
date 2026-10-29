-- =====================================================================
-- 위험성평가 참고 자료에 KOSHA GUIDE(안전보건기술지침·기술지원규정) 추가
--   source 'kosha' : 지침을 장·절 단위로 자른 조각 (목적·적용범위·용어 정의 · 작성자 개요는 뺌)
--   title = "지침 번호 지침 이름 › 장·절 제목" · meta = {code, guide, section, text, laws[]}
--   넣기 : node scripts/import-risk-refs.mjs --apply (PDF 글자 뽑기 pdftotext)
-- =====================================================================

alter table public.risk_refs drop constraint if exists risk_refs_source_check;
alter table public.risk_refs add constraint risk_refs_source_check check (source in ('jsa', 'ext', 'sif', 'kosha'));

create or replace function public._risk_ref_grams() returns trigger
language plpgsql as $$
declare
  v_body text;
begin
  if new.source = 'sif' then
    v_body := concat_ws(' ', new.meta->>'situation', new.meta->>'overview', new.meta->>'origin', new.meta->>'kind', new.meta->>'industry');
  elsif new.source = 'kosha' then
    v_body := new.meta->>'text';
  else
    select string_agg(concat_ws(' ', s->>'content', (select string_agg(h->>'content', ' ') from jsonb_array_elements(coalesce(s->'hazards', '[]'::jsonb)) h)), ' ')
      into v_body from jsonb_array_elements(new.steps) s;
    v_body := concat_ws(' ', new.area, new.meta->>'equip', v_body);
  end if;
  new.title_grams := _grams(new.title);
  new.body_grams := _grams(v_body);
  return new;
end $$;
