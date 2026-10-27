-- 0031 : 관리감독자 일일점검 '전체 현황' 탭 권한 → 환경설정 → 사용자·권한 → 프로세스별 권한에서 사람마다 부여
--   점검 지표(insp_kpi)와 같은 방식 : restricted = 개별 권한이 없으면 '없음' (관리자는 항상 볼 수 있음)
--   지금까지 이 탭을 보던 EHS팀(EHS팀 · EHS부서와 하위 부서) 사용자는 '열람' 권한을 넣어 그대로 볼 수 있게 함

insert into public.modules (code, slug, name, category, form, sort_order, is_enabled, restricted)
values ('insp_daily_overview', 'daily-overview', '관리감독자 일일점검 전체 현황', '사내점검', null, 91, true, true)
on conflict (code) do update set restricted = true, is_enabled = true, name = excluded.name;

insert into public.user_permissions (user_id, module_code, level)
select u, 'insp_daily_overview', 'read' from public._ehs_staff_ids() u
on conflict (user_id, module_code) do nothing;
