-- =====================================================================
-- 안전작업허가서 (SYMC-F430 R12 · CF430-01 R04)
--   작성 → 상신 → 결재(검토·협조·승인) → 발급 → 현장 기록·TBM → 작업완료
-- =====================================================================

create table public.permits (
  id             uuid primary key default gen_random_uuid(),
  permit_no      text not null unique,
  site_id        uuid not null references public.sites(id),
  department_id  uuid references public.departments(id),      -- 해당부서 (승인 부서장)
  psm            text not null default '미해당' check (psm in ('해당', '미해당')),
  preop          text not null default '미해당' check (preop in ('해당', '미해당')),
  work_type      text check (work_type in ('일반위험', '화기')),
  supp           text[] not null default '{}',                  -- confined/power/excavation/radiation/height/heavy
  grade          text check (grade in ('A', 'B', 'C')),
  work_name      text not null default '',
  work_place     text,
  company_name   text,
  start_dt       timestamp,                                     -- 한국 시간
  end_dt         timestamp,
  tags           jsonb not null default '[]'::jsonb,            -- [{name, tag}]
  managers       jsonb not null default '[]'::jsonb,            -- [{org, name, phone}]
  witnesses      jsonb not null default '[]'::jsonb,
  risk_eval_id   uuid references public.jsa_evals(id) on delete set null,
  checks         jsonb not null default '{}'::jsonb,            -- 필요 체크 {docs_0:true, …}
  fields         jsonb not null default '{}'::jsonb,            -- 절차서/위험성평가 번호, 정전·굴착·중장비 항목 등
  field          jsonb not null default '{}'::jsonb,            -- 발급 후 현장 기록 (○확인·서명·측정·작업자)
  phase          text not null default 'draft' check (phase in ('draft', 'issued', 'completed')),
  issued_at      timestamptz,
  field_saved_at timestamptz,
  field_saved_by uuid references public.profiles(id) on delete set null,
  completed_at   timestamptz,
  completed_by   uuid references public.profiles(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.permits (start_dt desc);

create table public.permit_tbm (
  permit_id  uuid primary key references public.permits(id) on delete cascade,
  tbm_dt     timestamp not null,
  work_dt    timestamp,
  work_name  text,
  content    text,
  place      text,
  leader     text,
  photo_path text,
  saved_by   uuid references public.profiles(id) on delete set null,
  saved_at   timestamptz not null default now()
);

alter table public.permits    enable row level security;
alter table public.permit_tbm enable row level security;

create or replace function public.can_view_permit(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level('permit') >= 1
      or exists (select 1 from permits where id = p_id and created_by = auth.uid())
      or exists (select 1 from approvals a join approval_steps s on s.approval_id = a.id
                 where a.module_code = 'permit' and a.doc_id = p_id and s.approver_id = auth.uid())
$$;
create policy read_visible on public.permits    for select to authenticated using (can_view_permit(id));
create policy read_visible on public.permit_tbm for select to authenticated using (can_view_permit(permit_id));

-- 임직원(작성 권한)만 허가서 작성·현장 기록
create or replace function public.permit_writer() returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level('permit') >= 2 and exists (select 1 from profiles where id = auth.uid() and user_type = 'employee' and is_active)
$$;

create or replace function public.permit_editable(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from permits where id = p_id and phase = 'draft')
     and not exists (select 1 from approvals where module_code = 'permit' and doc_id = p_id and status in ('in_review', 'approved'))
$$;

-- 신청 내용 저장 (신규 / 수정)
create or replace function public.save_permit(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v permits%rowtype;
  v_site uuid;
  v_checks jsonb;
begin
  if not permit_writer() then raise exception '안전작업허가서를 작성할 권한이 없습니다.'; end if;
  if p_id is not null then
    select * into v from permits where id = p_id for update;
    if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
    if v.created_by is distinct from auth.uid() and not is_admin() then raise exception '작성자만 수정할 수 있습니다.'; end if;
    if not permit_editable(p_id) then raise exception '결재 중이거나 발급된 허가서는 신청 내용을 수정할 수 없습니다.'; end if;
  end if;

  v_site := coalesce(v.site_id, (select site_id from profiles where id = auth.uid()), (select id from sites where is_active order by sort_order limit 1));
  if p_id is null then
    insert into permits (permit_no, site_id, created_by) values (next_doc_no('CF430'), v_site, auth.uid()) returning * into v;
  end if;

  -- 필요 체크만 (○ 확인 _ok 키는 현장 기록에서)
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_checks
    from jsonb_each(coalesce(p_data->'checks', '{}'::jsonb))
   where key !~ '_ok$' and jsonb_typeof(value) = 'boolean';

  update permits set
    department_id = nullif(p_data->>'department_id', '')::uuid,
    psm           = case when p_data->>'psm' = '해당' then '해당' else '미해당' end,
    preop         = case when p_data->>'preop' = '해당' then '해당' else '미해당' end,
    work_type     = nullif(p_data->>'work_type', ''),
    supp          = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'supp', '[]'::jsonb)) x
                              where x in ('confined', 'power', 'excavation', 'radiation', 'height', 'heavy')), '{}'),
    grade         = nullif(p_data->>'grade', ''),
    work_name     = coalesce(trim(p_data->>'work_name'), ''),
    work_place    = nullif(trim(p_data->>'work_place'), ''),
    company_name  = nullif(trim(p_data->>'company_name'), ''),
    start_dt      = nullif(p_data->>'start_dt', '')::timestamp,
    end_dt        = nullif(p_data->>'end_dt', '')::timestamp,
    tags          = coalesce(p_data->'tags', '[]'::jsonb),
    managers      = coalesce(p_data->'managers', '[]'::jsonb),
    witnesses     = coalesce(p_data->'witnesses', '[]'::jsonb),
    risk_eval_id  = nullif(p_data->>'risk_eval_id', '')::uuid,
    checks        = v_checks,
    fields        = coalesce(p_data->'fields', '{}'::jsonb),
    updated_at    = now()
  where id = v.id;
  return v.id;
end $$;

-- 상신 : 절차 규칙 검사 후 공통 결재 시작
create or replace function public.submit_permit(p_id uuid, p_steps jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v permits%rowtype;
  j jsa_evals%rowtype;
begin
  select * into v from permits where id = p_id for update;
  if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
  if v.created_by is distinct from auth.uid() then raise exception '작성자만 상신할 수 있습니다.'; end if;
  if v.work_type is null then raise exception '작업 종류(일반위험작업/화기작업)를 선택해 주세요.'; end if;
  if v.grade is null then raise exception '위험등급을 선택해 주세요.'; end if;
  if v.work_name = '' then raise exception '작업명을 입력해 주세요.'; end if;
  if v.department_id is null then raise exception '해당부서를 선택해 주세요.'; end if;
  if v.start_dt is null or v.end_dt is null then raise exception '작업 시작·종료일시를 입력해 주세요.'; end if;
  if v.end_dt <= v.start_dt then raise exception '작업 종료일시는 시작일시보다 뒤여야 합니다.'; end if;
  if not exists (select 1 from jsonb_array_elements(v.managers) m where coalesce(trim(m->>'name'), '') <> '') then
    raise exception '작업관리자를 1명 이상 입력해 주세요.';
  end if;
  if v.grade in ('A', 'B') and not exists (select 1 from jsonb_array_elements(v.witnesses) m where coalesce(trim(m->>'name'), '') <> '') then
    raise exception '위험등급 %등급은 입회자를 반드시 선임해야 합니다.', v.grade;
  end if;
  if coalesce((v.checks->>'docs_proc')::boolean, false) = false and coalesce((v.checks->>'docs_risk')::boolean, false) = false then
    raise exception '작업절차서 또는 위험성평가서 중 하나는 필요로 체크해야 합니다. (절차서가 없으면 위험성평가 필수)';
  end if;
  if coalesce((v.checks->>'docs_risk')::boolean, false) and v.risk_eval_id is null and coalesce(trim(v.fields->>'risk_no'), '') = '' then
    raise exception '위험성평가서를 불러오거나 번호를 입력해 주세요.';
  end if;
  if v.risk_eval_id is not null then
    select * into j from jsa_evals where id = v.risk_eval_id;
    if not exists (select 1 from approvals where module_code = 'risk_adhoc' and doc_id = j.id and status = 'approved') then
      raise exception '연결한 위험성평가(%)가 아직 결재 완료되지 않았습니다.', j.eval_no;
    end if;
    if abs(v.start_dt::date - j.eval_date) >= 365 then
      raise exception '연결한 위험성평가(%)가 작업일과 1년 이상 차이나 유효성 검증이 필요합니다. 재평가 후 연결해 주세요.', j.eval_no;
    end if;
  end if;
  return _submit_approval('permit', v.id, format('%s · %s', v.permit_no, v.work_name), v.site_id, v.department_id, p_steps);
end $$;

-- 결재 결과 후처리 : 허가서는 최종 승인 = 발급
create or replace function public._on_approval_result(p_module text, p_doc uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_module = 'permit' and p_status = 'approved' then
    update permits set phase = 'issued', issued_at = now() where id = p_doc;
  end if;
end $$;
revoke execute on function public._on_approval_result(text, uuid, text) from public, anon, authenticated;

-- 현장 기록 저장 (발급된 허가서 · 결재·기본정보는 잠김)
create or replace function public.save_permit_field(p_id uuid, p_field jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v permits%rowtype;
begin
  if not permit_writer() then raise exception '현장 기록 권한이 없습니다.'; end if;
  select * into v from permits where id = p_id for update;
  if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
  if v.phase <> 'issued' then raise exception '발급된(작업 중인) 허가서만 현장 기록을 입력할 수 있습니다.'; end if;
  update permits set
    field = jsonb_build_object(
      'checks_ok',     coalesce(p_field->'checks_ok', '{}'::jsonb),
      'sigs',          coalesce(p_field->'sigs', '{}'::jsonb),
      'extends',       coalesce(p_field->'extends', '[]'::jsonb),
      'suspends',      coalesce(p_field->'suspends', '[]'::jsonb),
      'fire_logs',     coalesce(p_field->'fire_logs', '[]'::jsonb),
      'confined_logs', coalesce(p_field->'confined_logs', '[]'::jsonb),
      'acks',          coalesce(p_field->'acks', '[]'::jsonb),
      'fields',        coalesce(p_field->'fields', '{}'::jsonb)
    ),
    field_saved_at = now(), field_saved_by = auth.uid(), updated_at = now()
  where id = p_id;
end $$;

-- 작업완료 보고 : 필수 서명·완료 확인
create or replace function public.complete_permit(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v permits%rowtype;
  s jsonb;
begin
  if not permit_writer() then raise exception '권한이 없습니다.'; end if;
  select * into v from permits where id = p_id for update;
  if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
  if v.phase <> 'issued' then raise exception '발급된(작업 중인) 허가서만 작업완료 처리할 수 있습니다.'; end if;
  s := coalesce(v.field->'sigs', '{}'::jsonb);
  if coalesce(s->>'prework_mgr', '') = '' then raise exception '작업 전 확인 — 작업관리자 서명이 없습니다.'; end if;
  if v.grade in ('A', 'B') and coalesce(s->>'prework_wit', '') = '' then raise exception '작업 전 확인 — %등급은 입회자 서명이 필요합니다.', v.grade; end if;
  if (v.grade in ('A', 'B') or v.supp && array['power', 'excavation', 'radiation', 'height', 'heavy'])
     and coalesce(s->>'prework_ehs', '') = '' then
    raise exception '작업 전 확인 — EHS 확인 서명이 필요합니다. (B등급 이상 또는 정전·굴착·방사선·고소·중장비)';
  end if;
  if coalesce(v.field->'fields'->>'complete_time', '') = '' then raise exception '작업완료 시간을 입력해 주세요.'; end if;
  if coalesce(s->>'complete_mgr', '') = '' then raise exception '작업완료 — 작업관리자 서명이 없습니다.'; end if;
  if v.grade in ('A', 'B') and coalesce(s->>'complete_wit', '') = '' then raise exception '작업완료 — 입회자 서명이 필요합니다.'; end if;
  update permits set phase = 'completed', completed_at = now(), completed_by = auth.uid(), updated_at = now() where id = p_id;
end $$;

-- TBM 실시 기록 (허가서당 1건)
create or replace function public.save_permit_tbm(p_id uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v permits%rowtype;
begin
  if not permit_writer() then raise exception '권한이 없습니다.'; end if;
  select * into v from permits where id = p_id;
  if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
  if v.phase = 'draft' then raise exception '발급된 허가서만 TBM을 기록할 수 있습니다.'; end if;
  if coalesce(p_data->>'tbm_dt', '') = '' then raise exception 'TBM 일시를 입력하세요.'; end if;
  insert into permit_tbm (permit_id, tbm_dt, work_dt, work_name, content, place, leader, photo_path, saved_by, saved_at)
  values (p_id, (p_data->>'tbm_dt')::timestamp, nullif(p_data->>'work_dt', '')::timestamp, p_data->>'work_name', p_data->>'content',
          p_data->>'place', p_data->>'leader', nullif(p_data->>'photo_path', ''), auth.uid(), now())
  on conflict (permit_id) do update set
    tbm_dt = excluded.tbm_dt, work_dt = excluded.work_dt, work_name = excluded.work_name, content = excluded.content,
    place = excluded.place, leader = excluded.leader, photo_path = excluded.photo_path, saved_by = excluded.saved_by, saved_at = now();
end $$;

create or replace function public.delete_permit(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v permits%rowtype;
begin
  select * into v from permits where id = p_id;
  if not found then raise exception '허가서를 찾을 수 없습니다.'; end if;
  if v.created_by is distinct from auth.uid() and not is_admin() then raise exception '작성자만 삭제할 수 있습니다.'; end if;
  if not permit_editable(p_id) then raise exception '결재 중이거나 발급된 허가서는 삭제할 수 없습니다.'; end if;
  delete from approvals where module_code = 'permit' and doc_id = p_id;
  delete from permits where id = p_id;
end $$;

-- 현황용
create or replace view public.permit_overview with (security_invoker = on) as
select p.id, p.permit_no, p.site_id, p.department_id, d.name as department_name,
       p.work_type, p.supp, p.grade, p.work_name, p.work_place, p.company_name, p.start_dt, p.end_dt,
       p.psm, p.preop, p.risk_eval_id, j.eval_no as risk_eval_no,
       p.fields->>'proc_no' as proc_no, p.fields->>'risk_no' as risk_no,
       p.managers->0->>'name' as manager_name,
       p.phase, p.issued_at, p.field_saved_at, p.completed_at, p.created_by, u.name as created_by_name,
       case when p.phase = 'completed' then 'completed'
            when p.phase = 'issued' then 'issued'
            else coalesce(a.status, 'draft') end as status,
       exists (select 1 from permit_tbm t where t.permit_id = p.id) as has_tbm
from permits p
left join departments d on d.id = p.department_id
left join profiles u on u.id = p.created_by
left join jsa_evals j on j.id = p.risk_eval_id
left join approvals a on a.module_code = 'permit' and a.doc_id = p.id;

-- TBM 사진 등 문서 첨부 (비공개 · 경로 {양식}/{문서ID}/…)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('docs', 'docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy docs_read   on storage.objects for select to authenticated using (bucket_id = 'docs' and public.is_member());
create policy docs_insert on storage.objects for insert to authenticated with check (bucket_id = 'docs' and public.is_member());
create policy docs_delete on storage.objects for delete to authenticated using (bucket_id = 'docs' and (owner_id = auth.uid()::text or public.is_admin()));

update public.modules set is_enabled = true where code = 'permit';
