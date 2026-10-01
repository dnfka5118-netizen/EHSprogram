-- =====================================================================
-- "비슷한 과거 지적" 추천용 사례 (과거 점검 엑셀에서 추출, scripts/build-examples.mjs 가 채움)
--   사진은 저장하지 않고 사진 특징값(512개 숫자, int8 → base64)만 저장한다.
--   문제점 문구는 사람 이름을 지운 뒤 저장한다.
--   비교 계산은 브라우저에서 한다 (사진이 외부로 나가지 않음).
-- =====================================================================

create table public.finding_examples (
  id           bigserial primary key,
  source       text,               -- 원본 엑셀 파일 # 시트
  location     text,
  sub_location text,
  type_name    text,
  problem      text not null,
  emb          text not null,      -- 정규화한 512차원 특징값 × 127 → int8 → base64
  created_at   timestamptz not null default now()
);

alter table public.finding_examples enable row level security;
create policy read_all on public.finding_examples for select to authenticated using (is_member());
-- 쓰기는 관리자 키(스크립트)로만
