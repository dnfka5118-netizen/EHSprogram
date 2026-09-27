-- =====================================================================
-- 수시 위험성평가 (작업 위험성평가서 JSA · SYMC-F110 · CF112-01/02 R02)
-- =====================================================================

-- 문서번호 일련번호 (예: RA-20260927-001) — 같은 날 여러 건이어도 겹치지 않게
create table public.doc_counters (
  prefix text not null,
  day    date not null,
  n      int  not null default 0,
  primary key (prefix, day)
);
alter table public.doc_counters enable row level security; -- 정책 없음 : 함수로만 사용

create or replace function public.next_doc_no(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare v_n int; v_day date := kst_today();
begin
  insert into doc_counters (prefix, day, n) values (p_prefix, v_day, 1)
  on conflict (prefix, day) do update set n = doc_counters.n + 1
  returning n into v_n;
  return format('%s-%s-%s', p_prefix, to_char(v_day, 'YYYYMMDD'), lpad(v_n::text, 3, '0'));
end $$;
revoke execute on function public.next_doc_no(text) from public, anon, authenticated;

create table public.jsa_evals (
  id            uuid primary key default gen_random_uuid(),
  eval_no       text not null unique,
  site_id       uuid not null references public.sites(id),
  department_id uuid references public.departments(id),       -- 부서명 (해당부서 · 승인자 결정)
  eval_date     date not null default kst_today(),
  super_name    text, worker_name text, ehs_name text,           -- 평가 참여자
  super_count   int,  worker_count int,  ehs_count int,          -- 참여 인원수
  work_area     text,
  sop_no        text,
  work_name     text not null default '',
  work_no       text,
  material      text,
  ppe           text,
  equip         text,
  safety_equip  text,
  req_docs      text,
  -- [{cat, content, safe, hazards:[{type,content,freq,sev}],
  --   control:{needed, checks[], desc, impNo, target, owner, done, postFreq, postSev}}]
  steps         jsonb not null default '[]'::jsonb,
  max_risk      int  not null default 0,                         -- 통제 전 최대 위험도 (목록용)
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.jsa_evals (eval_date desc);

alter table public.jsa_evals enable row level security;
create policy read_visible on public.jsa_evals for select to authenticated using (
  perm_level('risk_adhoc') >= 1
  or created_by = auth.uid()
  or exists (select 1 from approvals a join approval_steps s on s.approval_id = a.id
             where a.module_code = 'risk_adhoc' and a.doc_id = jsa_evals.id and s.approver_id = auth.uid())
);

create or replace function public.jsa_max_risk(p_steps jsonb) returns int
language sql immutable as $$
  select coalesce(max(
    case when (h->>'freq') ~ '^\d+$' and (h->>'sev') ~ '^\d+$' then (h->>'freq')::int * (h->>'sev')::int else 0 end
  ), 0)
  from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s, jsonb_array_elements(coalesce(s->'hazards', '[]'::jsonb)) h
$$;

-- 작성 중(미상신·반려·상신취소)인지
create or replace function public.jsa_editable(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from approvals where module_code = 'risk_adhoc' and doc_id = p_id and status in ('in_review', 'approved'))
$$;

-- 저장 (신규 / 수정)
create or replace function public.save_jsa(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_row jsa_evals%rowtype;
  v_site uuid;
  n text := nullif(trim(p_data->>'work_name'), '');
  int_or_null text := '^\s*\d+\s*$';
begin
  if perm_level('risk_adhoc') < 2 then raise exception '위험성평가를 작성할 권한이 없습니다.'; end if;
  if jsonb_typeof(coalesce(p_data->'steps', '[]'::jsonb)) <> 'array' then raise exception '작업단계 형식이 올바르지 않습니다.'; end if;

  if p_id is not null then
    select * into v_row from jsa_evals where id = p_id for update;
    if not found then raise exception '평가서를 찾을 수 없습니다.'; end if;
    if v_row.created_by is distinct from auth.uid() and not is_admin() then raise exception '작성자만 수정할 수 있습니다.'; end if;
    if not jsa_editable(p_id) then raise exception '결재 중이거나 결재가 끝난 평가서는 수정할 수 없습니다.'; end if;
  end if;

  v_site := coalesce(nullif(p_data->>'site_id', '')::uuid, v_row.site_id, (select site_id from profiles where id = auth.uid()),
                     (select id from sites where is_active order by sort_order limit 1));

  if p_id is null then
    insert into jsa_evals (eval_no, site_id, created_by) values (next_doc_no('RA'), v_site, auth.uid())
    returning * into v_row;
  end if;

  update jsa_evals set
    site_id       = v_site,
    department_id = nullif(p_data->>'department_id', '')::uuid,
    eval_date     = coalesce(nullif(p_data->>'eval_date', '')::date, kst_today()),
    super_name    = nullif(trim(p_data->>'super_name'), ''),
    worker_name   = nullif(trim(p_data->>'worker_name'), ''),
    ehs_name      = nullif(trim(p_data->>'ehs_name'), ''),
    super_count   = case when p_data->>'super_count'  ~ int_or_null then (p_data->>'super_count')::int end,
    worker_count  = case when p_data->>'worker_count' ~ int_or_null then (p_data->>'worker_count')::int end,
    ehs_count     = case when p_data->>'ehs_count'    ~ int_or_null then (p_data->>'ehs_count')::int end,
    work_area     = nullif(trim(p_data->>'work_area'), ''),
    sop_no        = nullif(trim(p_data->>'sop_no'), ''),
    work_name     = coalesce(n, ''),
    work_no       = nullif(trim(p_data->>'work_no'), ''),
    material      = nullif(trim(p_data->>'material'), ''),
    ppe           = nullif(trim(p_data->>'ppe'), ''),
    equip         = nullif(trim(p_data->>'equip'), ''),
    safety_equip  = nullif(trim(p_data->>'safety_equip'), ''),
    req_docs      = nullif(trim(p_data->>'req_docs'), ''),
    steps         = coalesce(p_data->'steps', '[]'::jsonb),
    max_risk      = jsa_max_risk(p_data->'steps'),
    updated_at    = now()
  where id = v_row.id;
  return v_row.id;
end $$;

-- 상신 : 필수값 확인 후 공통 결재 시작
create or replace function public.submit_jsa(p_id uuid, p_steps jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v jsa_evals%rowtype;
begin
  select * into v from jsa_evals where id = p_id for update;
  if not found then raise exception '평가서를 찾을 수 없습니다.'; end if;
  if v.created_by is distinct from auth.uid() then raise exception '작성자만 상신할 수 있습니다.'; end if;
  if v.work_name = '' then raise exception '작업명을 입력해 주세요.'; end if;
  if v.department_id is null then raise exception '부서명을 선택해 주세요.'; end if;
  if exists (
    select 1 from jsonb_array_elements(v.steps) s, jsonb_array_elements(coalesce(s->'hazards', '[]'::jsonb)) h
    where (coalesce(h->>'freq', '') <> '' and (h->>'freq') !~ '^[1-5]$') or (coalesce(h->>'sev', '') <> '' and (h->>'sev') !~ '^[1-5]$')
  ) then
    raise exception '빈도·강도는 1~5 사이 숫자로 입력해 주세요.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v.steps) s, jsonb_array_elements(coalesce(s->'hazards', '[]'::jsonb)) h
    where coalesce(h->>'type', '') <> '' and (h->>'freq') ~ '^[1-5]$' and (h->>'sev') ~ '^[1-5]$'
  ) then
    raise exception '유형·빈도·강도가 입력된 유해위험요인을 1건 이상 등록해 주세요.';
  end if;
  return _submit_approval('risk_adhoc', v.id, format('%s · %s', v.eval_no, v.work_name), v.site_id, v.department_id, p_steps);
end $$;

-- 삭제 (작성 중인 평가서만)
create or replace function public.delete_jsa(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v jsa_evals%rowtype;
begin
  select * into v from jsa_evals where id = p_id;
  if not found then raise exception '평가서를 찾을 수 없습니다.'; end if;
  if v.created_by is distinct from auth.uid() and not is_admin() then raise exception '작성자만 삭제할 수 있습니다.'; end if;
  if not jsa_editable(p_id) then raise exception '결재 중이거나 결재가 끝난 평가서는 삭제할 수 없습니다.'; end if;
  delete from approvals where module_code = 'risk_adhoc' and doc_id = p_id;
  delete from jsa_evals where id = p_id;
end $$;

-- 목록용 (결재 상태 포함)
create or replace view public.jsa_overview with (security_invoker = on) as
select j.id, j.eval_no, j.eval_date, j.site_id, j.department_id, d.name as department_name,
       j.work_name, j.work_area, j.max_risk, j.created_by, p.name as created_by_name, j.updated_at,
       jsonb_array_length(j.steps) as step_count,
       coalesce(a.status, 'draft') as approval_status, a.id as approval_id, a.completed_at as approved_at
from jsa_evals j
left join departments d on d.id = j.department_id
left join profiles p on p.id = j.created_by
left join approvals a on a.module_code = 'risk_adhoc' and a.doc_id = j.id;

-- 화면 켜기
update public.modules set is_enabled = true where code = 'risk_adhoc';
