-- =====================================================================
-- 초기 데이터 : 천안사업장 (2026_CEO 안전점검 양식 기준 초안)
-- 울산사업장 및 추가 항목은 [환경설정] 화면에서 등록
-- =====================================================================

insert into public.modules (code, slug, name, category, form, sort_order, is_enabled) values
  ('insp_ceo',     'ceo',     'CEO 안전점검',          '사내점검',   'finding', 10,  true),
  ('insp_monthly', 'monthly', '월간환경안전점검',      '사내점검',   'finding', 20,  true),
  ('insp_plant',   'plant',   '공장장 안전점검',       '사내점검',   'finding', 30,  true),
  ('insp_chem',    'chem',    '유해화학물질 자체점검', '사내점검',   null,      40,  false),
  ('insp_daily',   'daily',   '관리감독자 일일점검',   '사내점검',   null,      50,  false),
  ('risk',         'risk',    '위험성평가',            '위험성평가', null,      100, false),
  ('permit',       'permit',  '안전작업허가서',        '작업허가',   null,      200, false)
on conflict (code) do nothing;

insert into public.sites (code, name, sort_order) values ('CA', '천안사업장', 10)
on conflict (code) do nothing;

-- 부서 (양식의 담당부서 + 환경안전팀)
insert into public.departments (site_id, name, sort_order)
select s.id, d.name, d.ord
from public.sites s,
     (values ('환경안전팀', 10), ('생산팀', 20), ('품질팀', 30), ('연구소', 40),
             ('지원팀', 50), ('경영지원실', 60)) as d(name, ord)
where s.code = 'CA'
on conflict (site_id, name) do nothing;

-- 유형
insert into public.finding_types (name, sort_order) values
  ('설비', 10), ('배관/밸브', 20), ('건축물', 30), ('전기', 40), ('고압가스', 50),
  ('MSDS', 60), ('부착물', 70), ('3정5S', 80), ('기타', 999)
on conflict (name) do nothing;

-- 장소 / 세부장소 (양식에서 추출 · 표기 통일)
with src(loc, loc_ord, sub, sub_ord) as (values
  ('HBC-C1',           10, '구연산',        10),
  ('HBC-C1',           10, '구연산 호퍼',   20),
  ('HBC-C1',           10, 'BDS실',         30),
  ('HBC-C1',           10, 'BDS10실',       40),
  ('HBC-C1',           10, '제조소',        50),
  ('HBC-C2',           20, 'ANE',           10),
  ('HBC-C2',           20, '합성장치',      20),
  ('HBC-C2',           20, 'PLP',           30),
  ('HBC-C2',           20, 'PCS-02',        40),
  ('HBC-C2',           20, '제조소',        50),
  ('HBC-C2',           20, '제조실',        60),
  ('HBC-C2',           20, '유틸리티실',    70),
  ('HBC-C2',           20, '외부 도로',     80),
  ('HBC-C2',           20, '폐기물처리장 앞', 90),
  ('과산화수소 1공장', 30, '원료하역장',    10),
  ('과산화수소 1공장', 30, '실외저장탱크',  20),
  ('과산화수소 1공장', 30, 'UPW',           30),
  ('과산화수소 1공장', 30, '정제실',        40),
  ('과산화수소 1공장', 30, '레진 플랫폼',   50),
  ('과산화수소 1공장', 30, 'BDS실',         60),
  ('과산화수소 1공장', 30, '공조실',        70),
  ('과산화수소 1공장', 30, '조종실',        80),
  ('과산화수소 2공장', 40, '제품 저장탱크', 10),
  ('과산화수소 2공장', 40, '정제실',        20),
  ('과산화수소 2공장', 40, 'MCC룸',         30),
  ('연구소',           50, '1층',           10),
  ('연구소',           50, '2층',           20),
  ('분석실',           60, '분석 1실',      10),
  ('분석실',           60, '사무실',        20),
  ('TC 점검소',        70, '점검대',        10),
  ('TC 점검소',        70, '계단',          20),
  ('TC 점검소',        70, '플랫폼',        30),
  ('10동 창고',        80, null,            0),
  ('야드트랙터',       90, null,            0),
  ('보행로',          100, null,            0),
  ('사업장 전체',     110, null,            0)
),
ins_loc as (
  insert into public.locations (site_id, name, sort_order)
  select distinct s.id, src.loc, src.loc_ord
  from src, public.sites s where s.code = 'CA'
  on conflict (site_id, name) do nothing
  returning id, name
)
insert into public.sub_locations (location_id, name, sort_order)
select l.id, src.sub, src.sub_ord
from src
join ins_loc l on l.name = src.loc
where src.sub is not null
on conflict (location_id, name) do nothing;
