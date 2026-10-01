-- [서울 새 프로젝트 전용] 일부만 실행된 상태를 지우고 0001~0007 을 처음부터 다시 만들기 위한 머리말
-- 사용자가 1명이라도 있는 프로젝트(= 기존 시드니 운영 DB)에서는 아무것도 지우지 않고 멈춘다.
do $$
begin
  if to_regclass('public.profiles') is not null and exists (select 1 from public.profiles) then
    raise exception '이 프로젝트에는 이미 사용자가 있습니다. 서울 새 프로젝트에서만 실행하세요.';
  end if;
end $$;

drop policy if exists findings_photo_read   on storage.objects;
drop policy if exists findings_photo_insert on storage.objects;
drop policy if exists findings_photo_delete on storage.objects;
drop policy if exists docs_read   on storage.objects;
drop policy if exists docs_insert on storage.objects;
drop policy if exists docs_delete on storage.objects;

drop table if exists
  public.permit_tbm, public.permits, public.jsa_evals, public.doc_counters,
  public.approval_steps, public.approvals, public.approval_template_steps, public.notifications,
  public.finding_events, public.finding_comments, public.finding_photos, public.finding_progress,
  public.measure_date_history, public.finding_measures, public.finding_assignees, public.findings,
  public.inspections, public.finding_types, public.sub_locations, public.locations,
  public.user_permissions, public.modules, public.departments, public.profiles, public.sites
  cascade;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;
