-- =====================================================================
-- 조직 : 사업장 › 부문 › 팀 › 파트 + 부문장 · 팀장 · 파트장 (결재선 자동 연동)
--   departments.head_id   : 팀 줄 = 팀장, 파트 줄 = 파트장 (점검 종결 승인자와 별개)
--   division_heads        : (사업장, 부문) 의 부문장
--   결재선 정하는 방법 추가 : 작성자의 파트장 / 팀장 / 부문장, 해당 부서의 부문장
--     작성자가 파트 소속이 아니면 파트장 단계는 빠지고, 작성자 본인이거나 앞 단계와 같은 사람이면 빠짐 (화면)
--   '해당 부서의 부서장'(doc_dept_head) = 팀장 (없으면 예전처럼 첫 번째 종결 승인자)
--   조직 개편 (조직표 2026-10) : 본사 사업장 · 연구소 = 부문, 연구1팀·연구2팀 = 팀
-- =====================================================================

-- 1) 팀장 · 파트장
alter table public.departments add column if not exists head_id uuid references public.profiles(id) on delete set null;


-- 2) 부문장
create table if not exists public.division_heads (
  site_id    uuid not null references public.sites(id) on delete cascade,
  division   text not null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (site_id, division)
);
alter table public.division_heads enable row level security;
drop policy if exists read_all on public.division_heads;
create policy read_all on public.division_heads for select to authenticated using (is_member());
drop policy if exists admin_all on public.division_heads;
create policy admin_all on public.division_heads for all to authenticated using (is_admin()) with check (is_admin());
drop trigger if exists audit on public.division_heads;
create trigger audit after insert or update or delete on public.division_heads for each row execute function public._audit('조직');

-- 3) 결재선 정하는 방법
alter table public.approval_template_steps drop constraint if exists approval_template_steps_resolver_check;
alter table public.approval_template_steps add constraint approval_template_steps_resolver_check check (resolver in (
  'drafter', 'dept_head', 'doc_dept_head', 'user', 'pick',
  'drafter_part_head', 'drafter_team_head', 'drafter_division_head', 'doc_division_head'));

-- 작성자(p_user) 또는 문서 부서(p_doc_dept) 기준 파트장·팀장·부문장 (없으면 null)
create or replace function public._org_head(p_resolver text, p_user uuid, p_doc_dept uuid) returns uuid
language sql stable security definer set search_path = public as $$
  with me as (select d.* from profiles p join departments d on d.id = p.department_id where p.id = p_user),
       team as (
         select t.* from departments t
          where t.id = case when p_resolver = 'doc_division_head' then dept_team(p_doc_dept)
                            else (select coalesce(parent_id, id) from me) end)
  select case p_resolver
    when 'drafter_part_head' then (select head_id from me where parent_id is not null)
    when 'drafter_team_head' then (select head_id from team)
    else (select h.user_id from division_heads h, team where h.site_id = team.site_id and h.division = team.division)
  end
$$;
revoke execute on function public._org_head(text, uuid, uuid) from public, anon, authenticated;

-- 부서장 목록에 팀장도 포함 (일지 부서 레포트 승인 등) · 일지 승인자 1명 = 팀장 우선
create or replace function public._dept_heads(p_dept uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select head_id u from departments where id = p_dept
    union select approver_id from departments where id = p_dept
    union select unnest(dept_role_users(p_dept, 'approver'))
  ) x where u is not null
$$;

create or replace function public.daily_team_heads(p_team uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce((select array[coalesce(head_id, approver_id)] from departments where id = p_team and coalesce(head_id, approver_id) is not null), _dept_heads(p_team))
$$;

-- 상신 검사 : 필수 결재 단계에 파트장·팀장·부문장도 (0025 와 같고 정하는 방법만 추가)
create or replace function public._check_approval_line(p_module text, p_department uuid, p_steps jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb;
  v_kind text;
  v_user uuid;
  v_n int := 0;
  t record;
  v_need uuid[];
  v_names text;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_steps, '[]')) loop
    v_kind := coalesce(nullif(v_item->>'step_kind', ''), '검토');
    if v_kind in ('참조', '시행') then continue; end if;
    v_n := v_n + 1;
    v_user := nullif(v_item->>'approver_id', '')::uuid;
    if v_user is null then continue; end if;   -- 빈 칸은 _submit_approval 이 안내
    if v_kind <> '담당' and v_user = auth.uid() then
      raise exception '%단계(%) : 상신한 본인은 결재자가 될 수 없습니다. 상위 결재자를 지정해 주세요.', v_n, coalesce(v_item->>'label', v_kind);
    end if;
    if exists (select 1 from profiles where id = v_user and (user_type <> 'employee' or not is_active)) then
      raise exception '%단계(%) : 협력업체 · 사용 중지 사용자는 결재자가 될 수 없습니다.', v_n, coalesce(v_item->>'label', v_kind);
    end if;
  end loop;

  for t in select * from approval_template_steps where module_code = p_module and required and resolver in ('dept_head', 'doc_dept_head', 'user', 'drafter_part_head', 'drafter_team_head', 'drafter_division_head', 'doc_division_head') order by step_order loop
    v_need := case t.resolver
                when 'user' then case when t.user_id is null then '{}'::uuid[] else array[t.user_id] end
                when 'dept_head' then _dept_heads(t.department_id)
                when 'doc_dept_head' then _dept_heads(p_department)
                else coalesce(array_remove(array[_org_head(t.resolver, auth.uid(), p_department)], null), '{}')   -- 0045 : 파트장·팀장·부문장
              end;
    if cardinality(v_need) = 0 or auth.uid() = any (v_need) then continue; end if;   -- 지정된 사람이 없거나 본인이 그 결재자
    if not exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]')) x
                    where x->>'step_kind' not in ('참조', '시행') and nullif(x->>'approver_id', '')::uuid = any (v_need)) then
      select string_agg(name, ', ' order by name) into v_names from profiles where id = any (v_need);
      raise exception '필수 결재자가 빠졌습니다 : % (%) — 양식별 결재선에서 필수로 정한 단계입니다.', t.label, v_names;
    end if;
  end loop;
end $$;
revoke execute on function public._check_approval_line(text, uuid, jsonb) from public, anon, authenticated;

-- 4) 처음 값 : 팀장 = 지금 결재선 부서장, 파트장 = 첫 번째 파트 종결 승인자(파트 리더) — 환경설정 → 부서·결재자에서 바꿈
update public.departments set head_id = approver_id where parent_id is null and head_id is null and approver_id is not null;
update public.departments d
   set head_id = (select r.user_id from department_roles r where r.department_id = d.id and r.role = 'approver' order by r.sort_order, r.user_id limit 1)
 where d.parent_id is not null and d.head_id is null;

-- 5) 조직 개편 (조직표 기준 · 이미 바뀌어 있으면 아무것도 안 함)
-- 5-1) 본사 사업장 : 경영지원실 · 영업본부 · 경영전략실과 그 소속 직원
insert into public.sites (code, name, sort_order) values ('HQ', '본사', 20) on conflict (code) do nothing;
do $$
declare v_hq uuid; v_teams uuid[];
begin
  select id into v_hq from sites where code = 'HQ';
  select coalesce(array_agg(id), '{}') into v_teams from departments
   where parent_id is null and division in ('경영지원실', '영업본부', '경영전략실') and site_id <> v_hq;
  if cardinality(v_teams) = 0 then return; end if;
  update departments set site_id = v_hq where id = any (v_teams);
  update departments set site_id = v_hq where parent_id = any (v_teams);   -- 파트도 같은 사업장
  update profiles set site_id = v_hq
   where department_id = any (v_teams) or department_id in (select id from departments where parent_id = any (v_teams));
end $$;

-- 5-2) 연구소 = 부문, 연구1팀 · 연구2팀 = 팀 (연구소 줄은 소장·연구위원이 속한 팀으로 남김)
do $$
declare
  v_lab departments%rowtype;
  v_part record;
  f record;
  v_team uuid;
begin
  select * into v_lab from departments where name = '연구소' and parent_id is null and division = '연구소';
  if not found then return; end if;
  for v_part in select * from departments where parent_id = v_lab.id loop
    update departments set parent_id = null, division = '연구소' where id = v_part.id;
    -- 결재선 부서장 = 첫 번째 종결 승인자(파트 리더) · 조치담당자 지정자 = 연구소 지정자 그대로
    update departments set approver_id = (select user_id from department_roles where department_id = v_part.id and role = 'approver' order by sort_order, user_id limit 1)
     where id = v_part.id;
    insert into department_roles (department_id, user_id, role, sort_order)
    select v_part.id, user_id, 'assigner', sort_order from department_roles where department_id = v_lab.id and role = 'assigner'
    on conflict do nothing;
  end loop;
  -- 진행 중인 연구소 지적사항 : 조치담당자가 모두 한 팀(연구1팀/연구2팀)이면 그 팀으로
  for f in select id from findings where request_department_id = v_lab.id and status <> 'closed' loop
    select min(p.department_id::text)::uuid into v_team from finding_assignees a join profiles p on p.id = a.user_id where a.finding_id = f.id
     having count(distinct p.department_id) = 1;
    if v_team is not null and exists (select 1 from departments where id = v_team and parent_id is null and division = '연구소' and id <> v_lab.id) then
      update findings set request_department_id = v_team where id = f.id;
      insert into finding_events (finding_id, actor_id, action, detail)
      values (f.id, null, '조치 요청 부서 변경', '연구소 → ' || (select name from departments where id = v_team) || ' (조직 개편 : 연구소 = 부문)');
    end if;
  end loop;
  -- 부문장 = 연구소장
  insert into division_heads (site_id, division, user_id)
  select v_lab.site_id, '연구소', id from profiles where department_id = v_lab.id and is_active and position like '%소장%' order by name limit 1
  on conflict do nothing;
  -- 연구소 줄(소장·연구위원 소속)의 팀장도 부문장으로
  update departments set head_id = (select user_id from division_heads where site_id = v_lab.site_id and division = '연구소')
   where id = v_lab.id and head_id is null;
end $$;
