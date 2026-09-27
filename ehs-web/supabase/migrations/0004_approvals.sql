-- =====================================================================
-- 공통 전자결재 : 양식별 기본 결재선(환경설정) + 문서별 결재 진행
--   · 모든 결재 양식(안전작업허가서, 위험성평가 …)이 같이 사용
--   · 양식별 공개 RPC(예: submit_permit)가 문서 권한을 확인한 뒤 _submit_approval 호출
-- =====================================================================

-- 용어 통일 : 환경안전팀 → EHS부서
update public.departments set name = 'EHS부서' where name = '환경안전팀';

-- 결재 양식 등록 (modules 재사용 · 화면은 아직 비활성)
update public.modules set name = '안전작업허가서', form = 'permit' where code = 'permit';
insert into public.modules (code, slug, name, category, form, sort_order, is_enabled)
values ('risk_adhoc', 'risk-adhoc', '수시 위험성평가(JSA)', '위험성평가', 'jsa', 110, false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 1. 양식별 기본 결재선
--   resolver : drafter       작성자 본인
--              dept_head     지정 부서의 부서장(departments.approver_id)   ← department_id
--              doc_dept_head 문서의 해당부서 부서장
--              user          지정 사용자                                   ← user_id
--              pick          상신할 때 지정
-- ---------------------------------------------------------------------
create table public.approval_template_steps (
  id            uuid primary key default gen_random_uuid(),
  module_code   text not null references public.modules(code) on delete cascade,
  step_order    int  not null,
  step_kind     text not null check (step_kind in ('담당', '검토', '협조', '승인', '확인')),
  label         text not null,
  resolver      text not null check (resolver in ('drafter', 'dept_head', 'doc_dept_head', 'user', 'pick')),
  department_id uuid references public.departments(id) on delete set null,
  user_id       uuid references public.profiles(id) on delete set null,
  required      boolean not null default true,
  unique (module_code, step_order)
);

alter table public.approval_template_steps enable row level security;
create policy read_all on public.approval_template_steps for select to authenticated using (is_member());
create policy admin_all on public.approval_template_steps for all to authenticated using (is_admin()) with check (is_admin());

-- 기본값 : 안전작업허가서 = 담당 → 검토(EHS부서장) → 협조(관련부서) → 승인(해당부서장)
--          수시 위험성평가 = 담당 → 검토(EHS부서장) → 승인(해당부서장) → 확인
insert into public.approval_template_steps (module_code, step_order, step_kind, label, resolver, department_id, required)
select v.module_code, v.step_order, v.step_kind, v.label, v.resolver,
       case when v.resolver = 'dept_head' then (select id from public.departments where name = 'EHS부서' order by sort_order limit 1) end,
       v.required
from (values
  ('permit',     1, '담당', '담당',             'drafter',       true),
  ('permit',     2, '검토', '검토(EHS부서장)',  'dept_head',     true),
  ('permit',     3, '협조', '협조(관련부서)',   'pick',          false),
  ('permit',     4, '승인', '승인(해당부서장)', 'doc_dept_head', true),
  ('risk_adhoc', 1, '담당', '담당',             'drafter',       true),
  ('risk_adhoc', 2, '검토', '검토(EHS부서장)',  'dept_head',     true),
  ('risk_adhoc', 3, '승인', '승인(해당부서장)', 'doc_dept_head', true),
  ('risk_adhoc', 4, '확인', '확인',             'pick',          false)
) as v(module_code, step_order, step_kind, label, resolver, required)
on conflict (module_code, step_order) do nothing;

-- ---------------------------------------------------------------------
-- 2. 문서별 결재
-- ---------------------------------------------------------------------
create table public.approvals (
  id            uuid primary key default gen_random_uuid(),
  module_code   text not null references public.modules(code),
  doc_id        uuid not null,
  title         text not null,
  site_id       uuid references public.sites(id),
  department_id uuid references public.departments(id),  -- 해당부서
  drafter_id    uuid references public.profiles(id) on delete set null,
  status        text not null default 'in_review'
                check (status in ('in_review', 'approved', 'rejected', 'withdrawn')),
  round         int  not null default 1,          -- 반려 후 재상신 차수
  submitted_at  timestamptz not null default now(),
  completed_at  timestamptz,
  unique (module_code, doc_id)
);
create index on public.approvals (drafter_id, status);

-- status : waiting(차례 전) · pending(결재 차례) · approved · rejected · skipped
create table public.approval_steps (
  id           uuid primary key default gen_random_uuid(),
  approval_id  uuid not null references public.approvals(id) on delete cascade,
  round        int  not null,
  step_order   int  not null,
  step_kind    text not null,
  label        text not null,
  approver_id  uuid references public.profiles(id) on delete set null,
  status       text not null check (status in ('waiting', 'pending', 'approved', 'rejected', 'skipped')),
  comment      text,
  acted_at     timestamptz,
  unique (approval_id, round, step_order)
);
create index on public.approval_steps (approver_id, status);

alter table public.approvals      enable row level security;
alter table public.approval_steps enable row level security;

create or replace function public.can_view_approval(p_approval uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from approvals a
    where a.id = p_approval and (
      perm_level(a.module_code) >= 1
      or a.drafter_id = auth.uid()
      or exists (select 1 from approval_steps s where s.approval_id = a.id and s.approver_id = auth.uid())
    )
  )
$$;

create policy read_visible on public.approvals      for select to authenticated using (can_view_approval(id));
create policy read_visible on public.approval_steps for select to authenticated using (can_view_approval(approval_id));

-- 양식별 문서 화면 경로 (메일 링크·결재함에서 사용) — 양식을 추가할 때 case 를 늘린다
create or replace function public.approval_doc_path(p_module text, p_doc uuid) returns text
language sql immutable as $$
  select case p_module
    when 'permit'     then '/permit/' || p_doc
    when 'risk_adhoc' then '/risk/adhoc/' || p_doc
    else '/approvals'
  end
$$;

-- 결재 완료/반려 시 양식별 후처리 — 양식을 추가할 때 create or replace 로 확장
create or replace function public._on_approval_result(p_module text, p_doc uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

-- 상신 (양식 RPC 에서만 호출)
-- p_steps : [{"step_kind":"검토","label":"검토(EHS부서장)","approver_id":"…"}]  (순서대로)
create or replace function public._submit_approval(
  p_module text, p_doc uuid, p_title text, p_site uuid, p_department uuid, p_steps jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ap approvals%rowtype;
  v_item jsonb;
  v_order int := 0;
  v_approver uuid;
  v_kind text;
  v_first_pending boolean := true;
  v_status text;
  v_non_drafter int := 0;
begin
  if jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) = 0 then raise exception '결재선을 지정해 주세요.'; end if;

  select * into v_ap from approvals where module_code = p_module and doc_id = p_doc for update;
  if found then
    if v_ap.status in ('in_review', 'approved') then raise exception '이미 결재가 진행 중이거나 완료된 문서입니다.'; end if;
    update approvals set status = 'in_review', round = round + 1, title = p_title, site_id = p_site,
           department_id = p_department, submitted_at = now(), completed_at = null
     where id = v_ap.id returning * into v_ap;
  else
    insert into approvals (module_code, doc_id, title, site_id, department_id, drafter_id)
    values (p_module, p_doc, p_title, p_site, p_department, auth.uid())
    returning * into v_ap;
  end if;

  for v_item in select * from jsonb_array_elements(p_steps) loop
    v_order := v_order + 1;
    v_kind := coalesce(nullif(v_item->>'step_kind', ''), '검토');
    v_approver := nullif(v_item->>'approver_id', '')::uuid;
    if v_kind not in ('담당', '검토', '협조', '승인', '확인') then raise exception '결재 구분이 올바르지 않습니다.'; end if;
    if v_approver is null then raise exception '%단계(%)의 결재자를 지정해 주세요.', v_order, coalesce(v_item->>'label', v_kind); end if;
    if not exists (select 1 from profiles where id = v_approver and is_active) then raise exception '사용할 수 없는 결재자가 포함되어 있습니다.'; end if;

    -- 작성자 본인의 담당 단계는 상신과 동시에 결재 처리
    if v_kind = '담당' and v_approver = auth.uid() then
      v_status := 'approved';
    else
      v_non_drafter := v_non_drafter + 1;
      v_status := case when v_first_pending then 'pending' else 'waiting' end;
      v_first_pending := false;
    end if;

    insert into approval_steps (approval_id, round, step_order, step_kind, label, approver_id, status, acted_at)
    values (v_ap.id, v_ap.round, v_order, v_kind, coalesce(nullif(trim(v_item->>'label'), ''), v_kind), v_approver, v_status,
            case when v_status = 'approved' then now() end);
  end loop;

  if v_non_drafter = 0 then raise exception '작성자 외 결재자를 1명 이상 지정해 주세요.'; end if;
  return v_ap.id;
end $$;

-- 결재 승인
create or replace function public.approve_step(p_approval uuid, p_comment text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ap approvals%rowtype;
  v_step approval_steps%rowtype;
  v_next uuid;
begin
  select * into v_ap from approvals where id = p_approval for update;
  if not found or v_ap.status <> 'in_review' then raise exception '결재 진행 중인 문서가 아닙니다.'; end if;
  select * into v_step from approval_steps
   where approval_id = p_approval and round = v_ap.round and status = 'pending' order by step_order limit 1;
  if not found or v_step.approver_id is distinct from auth.uid() then raise exception '지금 결재할 차례가 아닙니다.'; end if;

  update approval_steps set status = 'approved', acted_at = now(), comment = nullif(trim(p_comment), '') where id = v_step.id;

  select id into v_next from approval_steps
   where approval_id = p_approval and round = v_ap.round and status = 'waiting' order by step_order limit 1;
  if v_next is not null then
    update approval_steps set status = 'pending' where id = v_next;
    return 'in_review';
  end if;

  update approvals set status = 'approved', completed_at = now() where id = p_approval;
  perform _on_approval_result(v_ap.module_code, v_ap.doc_id, 'approved');
  return 'approved';
end $$;

-- 결재 반려 (사유 필수) → 작성자가 수정 후 재상신
create or replace function public.reject_step(p_approval uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ap approvals%rowtype;
  v_step approval_steps%rowtype;
begin
  if coalesce(trim(p_comment), '') = '' then raise exception '반려 사유를 입력해 주세요.'; end if;
  select * into v_ap from approvals where id = p_approval for update;
  if not found or v_ap.status <> 'in_review' then raise exception '결재 진행 중인 문서가 아닙니다.'; end if;
  select * into v_step from approval_steps
   where approval_id = p_approval and round = v_ap.round and status = 'pending' order by step_order limit 1;
  if not found or v_step.approver_id is distinct from auth.uid() then raise exception '지금 결재할 차례가 아닙니다.'; end if;

  update approval_steps set status = 'rejected', acted_at = now(), comment = trim(p_comment) where id = v_step.id;
  update approval_steps set status = 'skipped' where approval_id = p_approval and round = v_ap.round and status = 'waiting';
  update approvals set status = 'rejected', completed_at = now() where id = p_approval;
  perform _on_approval_result(v_ap.module_code, v_ap.doc_id, 'rejected');
end $$;

-- 상신 취소 (작성자 · 작성자 외 결재가 아직 없을 때)
create or replace function public.withdraw_approval(p_approval uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ap approvals%rowtype;
begin
  select * into v_ap from approvals where id = p_approval for update;
  if not found or v_ap.drafter_id is distinct from auth.uid() then raise exception '상신한 사람만 취소할 수 있습니다.'; end if;
  if v_ap.status <> 'in_review' then raise exception '결재 진행 중인 문서가 아닙니다.'; end if;
  if exists (select 1 from approval_steps where approval_id = p_approval and round = v_ap.round
             and status = 'approved' and approver_id is distinct from v_ap.drafter_id) then
    raise exception '이미 결재가 진행되어 취소할 수 없습니다. 결재자에게 반려를 요청하세요.';
  end if;
  update approval_steps set status = 'skipped' where approval_id = p_approval and round = v_ap.round and status in ('pending', 'waiting');
  update approvals set status = 'withdrawn', completed_at = now() where id = p_approval;
  perform _on_approval_result(v_ap.module_code, v_ap.doc_id, 'withdrawn');
end $$;

revoke execute on function public._submit_approval(text, uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._on_approval_result(text, uuid, text) from public, anon, authenticated;

-- 결재함 목록용
create or replace view public.approval_overview with (security_invoker = on) as
select a.*,
       m.name as module_name,
       approval_doc_path(a.module_code, a.doc_id) as doc_path,
       p.name as drafter_name,
       d.name as department_name,
       cur.approver_id as current_approver_id,
       cp.name  as current_approver_name,
       cur.label as current_label
from approvals a
join modules m on m.code = a.module_code
left join profiles p on p.id = a.drafter_id
left join departments d on d.id = a.department_id
left join lateral (
  select s.approver_id, s.label from approval_steps s
   where s.approval_id = a.id and s.round = a.round and s.status = 'pending'
   order by s.step_order limit 1
) cur on true
left join profiles cp on cp.id = cur.approver_id;

-- ---------------------------------------------------------------------
-- 3. 결재 알림 메일 : 결재 차례가 된 사람 / 결과를 작성자에게
-- ---------------------------------------------------------------------
alter table public.notifications add column if not exists link text;

create or replace function public.on_approval_step() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ap approvals%rowtype; v_drafter text;
begin
  if new.status <> 'pending' or (tg_op = 'UPDATE' and old.status = 'pending') then return new; end if;
  select * into v_ap from approvals where id = new.approval_id;
  select name into v_drafter from profiles where id = v_ap.drafter_id;
  if new.approver_id is distinct from auth.uid() and exists (select 1 from profiles where id = new.approver_id and is_active) then
    insert into notifications (user_id, kind, subject, body, link)
    select new.approver_id, 'approval_request',
           format('[EHS] 결재 요청 : %s', v_ap.title),
           format(E'%s 결재가 요청되었습니다.\n\n양식: %s\n제목: %s\n상신자: %s\n결재 단계: %s',
                  m.name, m.name, v_ap.title, coalesce(v_drafter, '-'), new.label),
           approval_doc_path(v_ap.module_code, v_ap.doc_id)
      from modules m where m.code = v_ap.module_code;
  end if;
  return new;
end $$;

create trigger approval_step_mail after insert or update of status on public.approval_steps
  for each row execute function public.on_approval_step();

create or replace function public.on_approval_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_comment text;
begin
  if new.status = old.status or new.status not in ('approved', 'rejected') then return new; end if;
  if new.drafter_id is null or new.drafter_id = auth.uid() then return new; end if;
  select comment into v_comment from approval_steps
   where approval_id = new.id and round = new.round and status = 'rejected' limit 1;
  insert into notifications (user_id, kind, subject, body, link)
  select new.drafter_id, 'approval_' || new.status,
         format('[EHS] %s : %s', case new.status when 'approved' then '결재 완료' else '결재 반려' end, new.title),
         case new.status
           when 'approved' then format(E'상신한 %s 결재가 모두 완료되었습니다.\n\n제목: %s', m.name, new.title)
           else format(E'상신한 %s 가(이) 반려되었습니다.\n반려 사유: %s\n\n내용을 수정한 뒤 다시 상신해 주세요.\n제목: %s', m.name, coalesce(v_comment, '-'), new.title)
         end,
         approval_doc_path(new.module_code, new.doc_id)
    from modules m where m.code = new.module_code;
  return new;
end $$;

create trigger approval_result_mail after update of status on public.approvals
  for each row execute function public.on_approval_result();

-- 발송기가 링크도 받도록 (반환 형식 변경 → 재생성)
drop function if exists public.claim_notifications(int);
create function public.claim_notifications(p_limit int default 30)
returns table (id uuid, finding_id uuid, link text, subject text, body text, email text, name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update notifications set status = 'expired'
   where status in ('pending', 'failed') and created_at < now() - interval '3 days';
  update notifications set status = 'pending'
   where status = 'sending' and created_at < now() - interval '10 minutes';

  return query
  with picked as (
    select n.id from notifications n
     where n.status = 'pending' or (n.status = 'failed' and n.attempts < 5)
     order by n.created_at
     limit p_limit
     for update skip locked
  )
  update notifications n set status = 'sending', attempts = n.attempts + 1
    from picked, profiles p
   where n.id = picked.id and p.id = n.user_id
  returning n.id, n.finding_id, n.link, n.subject, n.body, p.email, p.name;
end $$;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
