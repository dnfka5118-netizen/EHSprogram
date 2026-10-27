-- 0035 : 감사 로그 (내부 통제 · 추적 관리) — 누가 · 언제 · 무엇을 · 어떻게 바꿨는지
--   결재 : 상신 · 결재(승인/반려) · 상신 취소 · 결재자 변경 · 결재선(양식별) 변경
--   문서 : 안전작업허가서 · 작업 위험성평가(JSA) · 관리감독자 월간 일지 · 유해화학물질 점검대장 작성/수정/삭제
--   계정 : 사용자 추가 · 정보 수정 · 관리자 지정/해제 · 사용 중지 · 비밀번호 초기화(화면에서 기록)
--   권한 · 조직 : 프로세스별 권한 · 부서 · 부서 역할(지정자/승인자·부서장) · 관리감독자 구역 담당 · 유해화학물질 점검원
--   설정 : 알림 · 메일 등 app_settings
--   표의 변경을 DB 트리거가 기록 (화면을 거치지 않은 변경도 남음) · 수정은 바뀐 칸만 [이전, 이후]
--   한 번 남은 기록은 고치거나 지울 수 없음 (관리자 포함) · 조회는 관리자만

create table public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,              -- 외래키 없음 : 계정이 지워져도 기록은 그대로 (지운 계정 때문에 로그가 바뀌지 않도록)
  actor_name   text,              -- 처리자 이름 (당시) · 비어 있으면 시스템(자동 처리 · 관리 스크립트)
  category     text not null,     -- 결재 · 문서 · 계정 · 권한 · 조직 · 설정
  action       text not null,     -- 추가 · 수정 · 삭제 · 상신 · 승인 · 반려 · 상신 취소 · 결재자 변경 …
  target_table text,
  target_id    text,
  target_label text,
  changes      jsonb              -- 수정 : {칸: [이전, 이후]} · 추가/삭제 : 그때 값
);
create index on public.audit_log (at desc);
create index on public.audit_log (target_table, target_id);
create index on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;
create policy read_admin on public.audit_log for select to authenticated using (is_admin());

-- 고치거나 지울 수 없음
create or replace function public._audit_readonly() returns trigger language plpgsql as $$
begin
  raise exception '감사 로그는 수정하거나 삭제할 수 없습니다.';
end $$;
create trigger audit_log_readonly before update or delete on public.audit_log
  for each row execute function public._audit_readonly();

-- 긴 값은 앞부분만
create or replace function public._audit_short(v jsonb) returns jsonb language sql immutable as $$
  select case when v is null then null
              when length(v::text) > 1000 then to_jsonb(left(case when jsonb_typeof(v) = 'string' then v #>> '{}' else v::text end, 1000) || ' …')
              else v end
$$;

create or replace function public._audit_label(p_table text, r jsonb) returns text
language sql stable security definer set search_path = public as $$
  select case p_table
    when 'profiles' then (r->>'name') || ' (' || coalesce(r->>'email', '') || ')'
    when 'user_permissions' then (select name from profiles where id = (r->>'user_id')::uuid) || ' · ' || coalesce((select name from modules where code = r->>'module_code'), r->>'module_code')
    when 'department_roles' then (select name from departments where id = (r->>'department_id')::uuid) || ' · ' || (select name from profiles where id = (r->>'user_id')::uuid)
                                 || ' · ' || case r->>'role' when 'approver' then '종결 승인자' when 'assigner' then '조치담당자 지정자' else r->>'role' end
    when 'departments' then r->>'name'
    when 'sites' then r->>'name'
    when 'daily_area_members' then (select name from daily_areas where id = (r->>'area_id')::uuid) || ' · ' || (select name from profiles where id = (r->>'user_id')::uuid)
    when 'chem_group_members' then (select name from profiles where id = (r->>'user_id')::uuid)
    when 'approvals' then r->>'title'
    when 'approval_steps' then (select title from approvals where id = (r->>'approval_id')::uuid) || ' · ' || coalesce(r->>'label', '')
    when 'approval_template_steps' then coalesce((select name from modules where code = r->>'module_code'), r->>'module_code') || ' · ' || coalesce(r->>'label', '')
    when 'permits' then coalesce(r->>'permit_no', '') || ' ' || coalesce(r->>'work_name', '')
    when 'jsa_evals' then coalesce(r->>'eval_no', '') || ' ' || coalesce(r->>'work_name', '')
    when 'daily_logs' then (select name from daily_areas where id = (r->>'area_id')::uuid) || ' · ' || left(r->>'ym', 7)
    when 'chem_checks' then 'week ' || coalesce(r->>'week_start', r->>'check_date', '')
    when 'app_settings' then r->>'key'
    else coalesce(r->>'name', r->>'title', r->>'id')
  end
$$;

create or replace function public._audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cat text := tg_argv[0];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}';
  v_action text;
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      continue when k in ('updated_at', 'created_at', 'saved_at');
      if v_old->k is distinct from v_new->k then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(_audit_short(v_old->k), _audit_short(v_new->k)));
      end if;
    end loop;
    if v_changes = '{}' then return new; end if;
  else
    for k in select jsonb_object_keys(v_row) loop
      v_changes := v_changes || jsonb_build_object(k, _audit_short(v_row->k));
    end loop;
  end if;

  v_action := case tg_op when 'INSERT' then '추가' when 'UPDATE' then '수정' else '삭제' end;
  -- 결재 : 단계·문서 상태 변화는 결재 용어로
  if tg_table_name = 'approvals' then
    v_action := case
      when tg_op = 'INSERT' then '상신'
      when tg_op = 'UPDATE' and v_changes ? 'status' then case v_new->>'status' when 'approved' then '결재 완료' when 'rejected' then '반려(문서)' when 'withdrawn' then '상신 취소' when 'in_review' then '다시 상신' else '상태 변경' end
      else v_action end;
  elsif tg_table_name = 'approval_steps' and tg_op = 'UPDATE' then
    v_action := case
      when v_changes ? 'approver_id' then '결재자 변경'
      when v_changes ? 'status' and v_new->>'status' = 'approved' then '승인'
      when v_changes ? 'status' and v_new->>'status' = 'rejected' then '반려'
      else '결재 단계 ' || coalesce(v_new->>'status', '변경') end;
    -- 차례가 넘어오는 자동 변경(대기 → 결재 차례)은 기록하지 않음
    if v_action like '결재 단계%' then return new; end if;
  elsif tg_table_name = 'approval_steps' and tg_op = 'INSERT' then
    return new; -- 상신 때 만들어지는 결재선은 '상신' 한 줄로 충분
  elsif tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    v_action := case
      when v_changes ? 'is_active' then case when (v_new->>'is_active')::boolean then '사용 재개' else '사용 중지' end
      when v_changes ? 'is_admin' then case when (v_new->>'is_admin')::boolean then '관리자 지정' else '관리자 해제' end
      when v_changes ? 'must_change_password' and (v_new->>'must_change_password')::boolean = false and (select count(*) from jsonb_object_keys(v_changes)) = 1 then '비밀번호 변경(본인)'
      else '정보 수정' end;
  elsif tg_table_name = 'profiles' and tg_op = 'INSERT' then
    v_action := '계정 추가';
  elsif tg_table_name = 'profiles' and tg_op = 'DELETE' then
    v_action := '계정 삭제';
  end if;

  insert into audit_log (actor_id, actor_name, category, action, target_table, target_id, target_label, changes)
  values (auth.uid(), (select name from profiles where id = auth.uid()), v_cat, v_action, tg_table_name,
          coalesce(v_row->>'id', v_row->>'key', concat_ws(':', v_row->>'user_id', v_row->>'module_code', v_row->>'department_id', v_row->>'area_id', v_row->>'role')),
          _audit_label(tg_table_name, v_row), v_changes);
  return coalesce(new, old);
end $$;

-- 화면에서만 알 수 있는 일 (비밀번호 초기화 등) : 관리자가 기록
create or replace function public.audit_note(p_category text, p_action text, p_table text, p_id text, p_label text, p_changes jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 기록할 수 있습니다.'; end if;
  insert into audit_log (actor_id, actor_name, category, action, target_table, target_id, target_label, changes)
  values (auth.uid(), (select name from profiles where id = auth.uid()), p_category, p_action, p_table, p_id, p_label, p_changes);
end $$;
grant execute on function public.audit_note(text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public._audit_label(text, jsonb) from public, anon, authenticated;

-- 트리거 연결 (분류)
create trigger audit after insert or update or delete on public.approvals                for each row execute function public._audit('결재');
create trigger audit after insert or update or delete on public.approval_steps           for each row execute function public._audit('결재');
create trigger audit after insert or update or delete on public.approval_template_steps  for each row execute function public._audit('결재');
create trigger audit after insert or update or delete on public.permits                  for each row execute function public._audit('문서');
create trigger audit after insert or update or delete on public.jsa_evals                for each row execute function public._audit('문서');
create trigger audit after insert or update or delete on public.daily_logs               for each row execute function public._audit('문서');
create trigger audit after insert or update or delete on public.chem_checks              for each row execute function public._audit('문서');
create trigger audit after insert or update or delete on public.profiles                 for each row execute function public._audit('계정');
create trigger audit after insert or update or delete on public.user_permissions         for each row execute function public._audit('권한');
create trigger audit after insert or update or delete on public.department_roles         for each row execute function public._audit('권한');
create trigger audit after insert or update or delete on public.departments              for each row execute function public._audit('조직');
create trigger audit after insert or update or delete on public.sites                    for each row execute function public._audit('조직');
create trigger audit after insert or update or delete on public.daily_area_members       for each row execute function public._audit('조직');
create trigger audit after insert or update or delete on public.chem_group_members       for each row execute function public._audit('조직');
create trigger audit after insert or update or delete on public.app_settings             for each row execute function public._audit('설정');
