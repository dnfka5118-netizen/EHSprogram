-- =====================================================================
-- 표준운전절차서 (안전운전 절차서 CF410-01 R02)
--   표지(표준명·표준번호·공정명·작성부서·작성자·적용범위·용도·준비물·개인보호구·물성·비상연락처)
--   + 유해위험요인 Check · 이상발생시 조치요령 + 작업 단계(사진·유해위험요인·작업내용·안전대책·관리기준)
--   + 제개정 이력 · 위험성평가(JSA) 연결 · 위험등급(A/B/C, 안전작업허가 부표1 기준)
--   결재 = 공통 전자결재 (기본 : 작성 → 검토(작성자의 팀장) → 검토(EHS팀장) → 승인(작성자의 부문장))
--   개정 = 결재 끝난 절차서를 복사해 Rev.+1 새 문서로 (이전 Rev. 은 그대로 보관)
--   사진 = Storage docs 버킷 sop/{절차서ID}/…
-- =====================================================================

insert into public.modules (code, slug, name, category, form, sort_order, is_enabled)
values ('sop', 'sop', '표준운전절차서', '표준운전절차서', 'sop', 130, true)
on conflict (code) do update set name = excluded.name, form = excluded.form, is_enabled = true;

create table if not exists public.sop_docs (
  id            uuid primary key default gen_random_uuid(),
  sop_no        text,                                             -- 표준번호 (예: F220-SOP-과수-001)
  rev           int  not null default 0,
  site_id       uuid not null references public.sites(id),
  department_id uuid references public.departments(id),           -- 작성부서
  process_name  text,                                             -- 공정명
  title         text not null default '',                         -- 표준명
  scope         text,                                             -- 적용범위
  writers       text,                                             -- 작성자 (여러 명 이름)
  purposes      text[] not null default '{}',                     -- 용도 체크
  supplies      text,                                             -- 준비물
  ppe           text,                                             -- 개인 보호구
  materials     text,                                             -- 취급물질의 주요물성 및 유해 위험성
  contacts      text,                                             -- 비상 연락처
  hazards       text[] not null default '{}',                     -- 유해위험요인 Check
  emergency     text,                                             -- 이상발생시 조치요령
  risk_eval_id  uuid references public.jsa_evals(id) on delete set null,
  risk_no       text,                                             -- 위험성평가 작업번호 (불러오지 않을 때 직접)
  grade         text check (grade in ('A', 'B', 'C')),            -- 위험등급
  -- [{name, photos[], hazard, work, safety, standard}]
  steps         jsonb not null default '[]'::jsonb,
  -- [{rev, content, date}]
  history       jsonb not null default '[]'::jsonb,
  prev_id       uuid references public.sop_docs(id) on delete set null,   -- 개정 전 문서
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists sop_docs_no_rev on public.sop_docs (sop_no, rev) where sop_no is not null;
create index if not exists sop_docs_updated on public.sop_docs (updated_at desc);

alter table public.sop_docs enable row level security;
drop policy if exists read_visible on public.sop_docs;
create policy read_visible on public.sop_docs for select to authenticated using (
  perm_level('sop') >= 1
  or created_by = auth.uid()
  or exists (select 1 from approvals a join approval_steps s on s.approval_id = a.id
             where a.module_code = 'sop' and a.doc_id = sop_docs.id and s.approver_id = auth.uid())
);
drop trigger if exists audit on public.sop_docs;
create trigger audit after insert or update or delete on public.sop_docs for each row execute function public._audit('문서');

-- 작성 중(미상신·반려·상신취소)인지
create or replace function public.sop_editable(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from approvals where module_code = 'sop' and doc_id = p_id and status in ('in_review', 'approved'))
$$;

-- 저장 : p_id 가 없는 문서면 새로 만듦 (화면에서 만든 ID · 사진을 먼저 올리기 위해)
create or replace function public.save_sop(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v sop_docs%rowtype;
  v_site uuid;
begin
  if perm_level('sop') < 2 then raise exception '표준운전절차서를 작성할 권한이 없습니다.'; end if;
  if p_id is null then raise exception '문서 번호가 없습니다.'; end if;
  if jsonb_typeof(coalesce(p_data->'steps', '[]'::jsonb)) <> 'array' then raise exception '작업 단계 형식이 올바르지 않습니다.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_data->'steps', '[]'::jsonb)) s, jsonb_array_elements_text(coalesce(s->'photos', '[]'::jsonb)) x
              where x not like 'sop/' || p_id || '/%') then
    raise exception '사진 경로가 올바르지 않습니다.';
  end if;

  select * into v from sop_docs where id = p_id for update;
  if found then
    if v.created_by is distinct from auth.uid() and not is_admin() then raise exception '작성자만 수정할 수 있습니다.'; end if;
    if not sop_editable(p_id) then raise exception '결재 중이거나 결재가 끝난 절차서는 수정할 수 없습니다. (개정하려면 "개정" 을 누르세요)'; end if;
  else
    v_site := coalesce((select site_id from profiles where id = auth.uid()), (select id from sites where is_active order by sort_order limit 1));
    insert into sop_docs (id, site_id, created_by) values (p_id, v_site, auth.uid()) returning * into v;
  end if;

  update sop_docs set
    sop_no        = nullif(trim(p_data->>'sop_no'), ''),
    department_id = nullif(p_data->>'department_id', '')::uuid,
    process_name  = nullif(trim(p_data->>'process_name'), ''),
    title         = coalesce(trim(p_data->>'title'), ''),
    scope         = nullif(trim(p_data->>'scope'), ''),
    writers       = nullif(trim(p_data->>'writers'), ''),
    purposes      = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'purposes', '[]'::jsonb)) x), '{}'),
    supplies      = nullif(trim(p_data->>'supplies'), ''),
    ppe           = nullif(trim(p_data->>'ppe'), ''),
    materials     = nullif(trim(p_data->>'materials'), ''),
    contacts      = nullif(trim(p_data->>'contacts'), ''),
    hazards       = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'hazards', '[]'::jsonb)) x), '{}'),
    emergency     = nullif(trim(p_data->>'emergency'), ''),
    risk_eval_id  = nullif(p_data->>'risk_eval_id', '')::uuid,
    risk_no       = nullif(trim(p_data->>'risk_no'), ''),
    grade         = nullif(p_data->>'grade', ''),
    steps         = coalesce(p_data->'steps', '[]'::jsonb),
    history       = coalesce(p_data->'history', '[]'::jsonb),
    updated_at    = now()
  where id = v.id;
  return v.id;
exception when unique_violation then
  raise exception '같은 표준번호·Rev. 의 절차서가 이미 있습니다. 표준번호를 확인하거나 기존 절차서에서 "개정" 을 누르세요.';
end $$;

-- 상신 : 필수값 확인 후 공통 결재
create or replace function public.submit_sop(p_id uuid, p_steps jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v sop_docs%rowtype;
begin
  select * into v from sop_docs where id = p_id for update;
  if not found then raise exception '절차서를 찾을 수 없습니다.'; end if;
  if v.created_by is distinct from auth.uid() then raise exception '작성자만 상신할 수 있습니다.'; end if;
  if v.title = '' then raise exception '표준명을 입력해 주세요.'; end if;
  if v.sop_no is null then raise exception '표준번호를 입력해 주세요.'; end if;
  if v.process_name is null then raise exception '공정명을 입력해 주세요.'; end if;
  if v.department_id is null then raise exception '작성부서를 선택해 주세요.'; end if;
  if v.grade is null then raise exception '위험등급을 선택해 주세요.'; end if;
  if not exists (select 1 from jsonb_array_elements(v.steps) s where coalesce(trim(s->>'name'), '') <> '' and coalesce(trim(s->>'work'), '') <> '') then
    raise exception '작업 단계(작업 단계 · 작업 내용)를 1개 이상 입력해 주세요.';
  end if;
  if v.risk_eval_id is not null and not exists (select 1 from approvals where module_code = 'risk_adhoc' and doc_id = v.risk_eval_id and status = 'approved') then
    raise exception '연결한 위험성평가가 아직 결재 완료되지 않았습니다.';
  end if;
  return _submit_approval('sop', v.id, format('%s Rev.%s · %s', v.sop_no, v.rev, v.title), v.site_id, v.department_id, p_steps);
end $$;

-- 삭제 (작성 중인 절차서만) · 사진은 화면에서 지움
create or replace function public.delete_sop(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare v sop_docs%rowtype; v_paths text[];
begin
  select * into v from sop_docs where id = p_id;
  if not found then raise exception '절차서를 찾을 수 없습니다.'; end if;
  if v.created_by is distinct from auth.uid() and not is_admin() then raise exception '작성자만 삭제할 수 있습니다.'; end if;
  if not sop_editable(p_id) then raise exception '결재 중이거나 결재가 끝난 절차서는 삭제할 수 없습니다.'; end if;
  select coalesce(array_agg(x), '{}') into v_paths from jsonb_array_elements(v.steps) s, jsonb_array_elements_text(coalesce(s->'photos', '[]'::jsonb)) x;
  delete from approvals where module_code = 'sop' and doc_id = p_id;
  delete from sop_docs where id = p_id;
  return v_paths;
end $$;

-- 개정 : 결재 완료된 절차서를 복사해 Rev.+1 작성 중 문서로 (사진은 화면에서 새 경로로 복사)
create or replace function public.revise_sop(p_id uuid, p_new uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v sop_docs%rowtype;
begin
  if perm_level('sop') < 2 then raise exception '표준운전절차서를 작성할 권한이 없습니다.'; end if;
  select * into v from sop_docs where id = p_id;
  if not found then raise exception '절차서를 찾을 수 없습니다.'; end if;
  if not exists (select 1 from approvals where module_code = 'sop' and doc_id = p_id and status = 'approved') then
    raise exception '결재가 끝난 절차서만 개정할 수 있습니다.';
  end if;
  if exists (select 1 from sop_docs where prev_id = p_id) then
    raise exception '이미 개정 중인 절차서가 있습니다. 현황에서 Rev.% 문서를 확인해 주세요.', v.rev + 1;
  end if;
  insert into sop_docs (id, sop_no, rev, site_id, department_id, process_name, title, scope, writers, purposes, supplies, ppe,
                        materials, contacts, hazards, emergency, risk_eval_id, risk_no, grade, steps, history, prev_id, created_by)
  values (p_new, v.sop_no, v.rev + 1, v.site_id, v.department_id, v.process_name, v.title, v.scope, v.writers, v.purposes, v.supplies, v.ppe,
          v.materials, v.contacts, v.hazards, v.emergency, v.risk_eval_id, v.risk_no, v.grade,
          (select coalesce(jsonb_agg(jsonb_set(s, '{photos}', '[]'::jsonb) order by o), '[]') from jsonb_array_elements(v.steps) with ordinality t(s, o)),
          v.history || jsonb_build_array(jsonb_build_object('rev', v.rev + 1, 'content', '', 'date', to_char(kst_today(), 'YYYY-MM-DD'))),
          p_id, auth.uid());
  return p_new;
end $$;

-- 목록 (결재 상태 · 위험성평가 번호)
create or replace view public.sop_overview with (security_invoker = on) as
select s.id, s.sop_no, s.rev, s.site_id, s.department_id, d.name as department_name, s.process_name, s.title,
       coalesce(j.eval_no, s.risk_no) as risk_no, s.risk_eval_id, s.grade, jsonb_array_length(s.steps) as step_count,
       s.created_by, p.name as created_by_name, s.updated_at, s.prev_id,
       coalesce(a.status, 'draft') as approval_status, a.completed_at as approved_at,
       exists (select 1 from sop_docs n where n.prev_id = s.id) as superseded
from sop_docs s
left join departments d on d.id = s.department_id
left join profiles p on p.id = s.created_by
left join jsa_evals j on j.id = s.risk_eval_id
left join approvals a on a.module_code = 'sop' and a.doc_id = s.id;

-- 전자결재함 → 문서 주소
create or replace function public.approval_doc_path(p_module text, p_doc uuid) returns text
language sql immutable as $$
  select case p_module
    when 'permit'     then '/permit/' || p_doc
    when 'risk_adhoc' then '/risk/adhoc/' || p_doc
    when 'insp_daily' then '/insp/daily/logs/' || p_doc
    when 'insp_chem'  then '/insp/chem/checks/' || p_doc
    when 'sop'        then '/sop/' || p_doc
    else '/approvals'
  end
$$;

-- 기본 결재선 : 작성 → 검토(작성자의 팀장) → 검토(EHS팀장) → 승인(작성자의 부문장) — 환경설정 → 양식별 결재선에서 바꿈
insert into public.approval_template_steps (module_code, step_order, step_kind, label, resolver, department_id, required)
select 'sop', v.o, v.k, v.l, v.r,
       case when v.r = 'dept_head' then (select id from public.departments where name in ('EHS팀', 'EHS부서') and parent_id is null order by sort_order limit 1) end, v.req
  from (values (1, '담당', '작성', 'drafter', true), (2, '검토', '검토(팀장)', 'drafter_team_head', true),
               (3, '검토', '검토(EHS팀장)', 'dept_head', true), (4, '승인', '승인(부문장)', 'drafter_division_head', true)) v(o, k, l, r, req)
on conflict (module_code, step_order) do nothing;
